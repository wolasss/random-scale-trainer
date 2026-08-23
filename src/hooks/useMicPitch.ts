import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createMicCapture,
  isMicSupported,
  releaseMicStream,
  requestMicStream,
  type MicCapture,
  type PcmFrame,
} from '../lib/audio/mic'
import { detectPitch, frequencyToPitch } from '../lib/audio/pitch'

/** How often a frame is pulled off the analyser and run through the detector. */
export const MIC_POLL_MS = 50

export type MicStatus = 'idle' | 'unsupported' | 'denied' | 'listening'

/**
 * One detection, timestamped on the engine's clock so beats can be compared.
 * The cents and the clarity belong to the frame that produced it: subscribers
 * see every frame, so they are current there. The readout below only names the
 * note, and its copy is refreshed when the note changes rather than per frame.
 *
 * The octave is carried for subscribers that care which *pitch* was played
 * rather than which pitch class — but it is the least certain field here, for
 * the reason `frequencyToPitch` gives.
 */
export type HeardPitch = {
  pitchClass: number
  cents: number
  octave: number
  clarity: number
  audioTime: number
}

export type HeardPitchListener = (heard: HeardPitch) => void

/**
 * The slice of AudioEngine the microphone needs. Narrow on purpose: a fake in a
 * test is three functions, and the real engine satisfies it structurally.
 */
export type MicEngine = {
  getContext(): AudioContext | null
  getCurrentTime(): number
  isWithinCue(time: number): boolean
}

export type UseMicPitchOptions = {
  engine: MicEngine
  /** The "Listen for my playing" setting. Off means no microphone is opened. */
  enabled: boolean
  /** Playback is running. The microphone is only ever open alongside it. */
  running: boolean
  /**
   * Which called note the readout belongs to — the running count of notes
   * called does the job — or null when nothing is being called, as during a
   * count-in. A reading survives silence but not the next call, so what is
   * shown is always an answer to the note on screen, and when no note is on
   * screen there is nothing to show.
   */
  callId: number | null
}

/**
 * Listens through the microphone while practice runs and reports what it hears.
 *
 * The lifecycle is the whole job. The microphone is opened only while the
 * setting is on and playback is running, and every way out of that — a pause, a
 * stop, an unmount, a refusal, or an acquire that a newer one has already
 * superseded — stops the stream's tracks, not just the nodes. A browser that
 * leaves its recording indicator lit after you press pause is a bug report.
 *
 * A reading is stamped with the call it was heard under and held from there:
 * a plucked string decays out of the detector's reach in well under a second,
 * and a readout that blinks out with it is unreadable. What replaces a reading
 * is the next note heard or the next note called, nothing else — and between
 * the two, while the count-in runs and no note is being called, nothing at all.
 */
export function useMicPitch({ engine, enabled, running, callId }: UseMicPitchOptions) {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [reading, setReading] = useState<{ heard: HeardPitch; callId: number } | null>(null)

  const engineRef = useRef(engine)
  const callIdRef = useRef(callId)
  useEffect(() => {
    engineRef.current = engine
    callIdRef.current = callId
  })

  const listenersRef = useRef<Set<HeardPitchListener> | null>(null)
  listenersRef.current ??= new Set()

  /** Stable, so a subscriber can bind once — this is what scoring hangs off. */
  const subscribe = useCallback((listener: HeardPitchListener) => {
    const listeners = listenersRef.current
    listeners?.add(listener)
    return () => {
      listeners?.delete(listener)
    }
  }, [])

  const active = enabled && running

  useEffect(() => {
    if (!active) {
      // Nothing below this line may touch a microphone API: with the setting
      // off, the app must behave exactly as it did before it existed.
      setStatus('idle')
      setReading(null)
      return
    }

    if (!isMicSupported()) {
      setStatus('unsupported')
      return
    }

    let cancelled = false
    let capture: MicCapture | null = null
    let pollId: number | undefined

    const poll = (frame: PcmFrame, sampleRate: number) => {
      if (capture === null) {
        return
      }

      capture.readFrame(frame)
      const detected = detectPitch(frame, sampleRate)
      const audioTime = engineRef.current.getCurrentTime()

      // The app plays the called note out of the same speaker the microphone is
      // pointed at, so clarity alone can never tell the cue from the player.
      // Only what falls outside every cue interval, tail included, counts as
      // playing — the engine knows how long each of its own sounds lingers.
      //
      // Neither the app's own sound nor the silence after a note is news: the
      // reading already on screen stands until something is actually heard.
      if (detected === null || engineRef.current.isWithinCue(audioTime)) {
        return
      }

      const { pitchClass, cents, octave } = frequencyToPitch(detected.frequency)
      const event: HeardPitch = { pitchClass, cents, octave, clarity: detected.clarity, audioTime }

      for (const listener of listenersRef.current ?? []) {
        listener(event)
      }

      // Subscribers get every frame; React only gets a new note, so a note held
      // across a whole span is one render rather than twenty a second. With no
      // note being called there is nothing for a reading to be an answer to, so
      // one is not kept — a subscriber that scores playing still hears it.
      const heardUnder = callIdRef.current
      if (heardUnder === null) {
        return
      }

      setReading((current) =>
        current !== null && current.callId === heardUnder && current.heard.pitchClass === pitchClass
          ? current
          : { heard: event, callId: heardUnder }
      )
    }

    const open = async () => {
      let stream: MediaStream
      try {
        stream = await requestMicStream()
      } catch {
        if (!cancelled) {
          setStatus('denied')
        }

        return
      }

      const context = engineRef.current.getContext()
      // Superseded while the permission prompt was up, or torn down under it —
      // either way this stream belongs to nobody and has to be handed back.
      // A missing context means playback has not opened one yet; starting
      // playback re-runs this effect through `running`.
      if (cancelled || context === null) {
        releaseMicStream(stream)
        return
      }

      capture = createMicCapture(context, stream)
      // Sized by the capture: a fast context analyses a longer frame, and a
      // shorter array would be filled by dropping the end of it.
      const frame = new Float32Array(capture.frameSize)
      const { sampleRate } = context
      setStatus('listening')
      pollId = window.setInterval(() => poll(frame, sampleRate), MIC_POLL_MS)
    }

    void open()

    return () => {
      cancelled = true
      if (pollId !== undefined) {
        window.clearInterval(pollId)
      }

      capture?.release()
      capture = null
    }
  }, [active])

  // Derived rather than cleared by an effect, so the note that was heard for
  // the last call is gone in the same render that puts the new call on screen.
  const heard = callId !== null && reading?.callId === callId ? reading.heard : null

  return { status, heard, subscribe }
}
