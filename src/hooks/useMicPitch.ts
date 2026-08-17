import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createMicCapture,
  isMicSupported,
  MIC_FRAME_SIZE,
  releaseMicStream,
  requestMicStream,
  type MicCapture,
  type PcmFrame,
} from '../lib/audio/mic'
import { detectPitch, frequencyToPitch } from '../lib/audio/pitch'

/** How often a frame is pulled off the analyser and run through the detector. */
export const MIC_POLL_MS = 50

/**
 * How far the cents reading has to move before the readout is refreshed while
 * the note stays in the same pitch class. Subscribers still see every frame;
 * this only decides when React hears about one, so a held note costs a render
 * when it drifts rather than twenty a second when it doesn't.
 */
export const HEARD_CENTS_TOLERANCE = 2

export type MicStatus = 'idle' | 'unsupported' | 'denied' | 'listening'

/** One detection, timestamped on the engine's clock so beats can be compared. */
export type HeardPitch = {
  pitchClass: number
  cents: number
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
   * called does the job. A reading survives silence but not the next call, so
   * what is shown is always an answer to the note on screen.
   */
  callId?: number
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
 * is the next note heard or the next note called, nothing else.
 */
export function useMicPitch({ engine, enabled, running, callId }: UseMicPitchOptions) {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [reading, setReading] = useState<{ heard: HeardPitch; callId: number | undefined } | null>(null)

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

      const { pitchClass, cents } = frequencyToPitch(detected.frequency)
      const event: HeardPitch = { pitchClass, cents, clarity: detected.clarity, audioTime }

      for (const listener of listenersRef.current ?? []) {
        listener(event)
      }

      // Subscribers get every frame; React only gets the changes, so a held
      // note is one render rather than twenty a second. Cents count as a
      // change, or bending and tuning would freeze the reading the moment the
      // pitch class settled — which is exactly when it is being watched.
      const heardUnder = callIdRef.current
      setReading((current) =>
        current !== null &&
        current.callId === heardUnder &&
        current.heard.pitchClass === pitchClass &&
        Math.abs(current.heard.cents - cents) < HEARD_CENTS_TOLERANCE
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
      const frame = new Float32Array(MIC_FRAME_SIZE)
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
  const heard = reading !== null && reading.callId === callId ? reading.heard : null

  return { status, heard, subscribe }
}
