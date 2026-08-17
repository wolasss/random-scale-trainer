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
 * How long after a cue has finished the room is still assumed to be ringing
 * with it. Anything heard inside a cue plus this margin is the app hearing
 * itself, and is dropped rather than shown or published.
 *
 * Named, and deliberately generous, because it is the one number the hardware
 * pass is expected to reach for: if a real room still leaks the spoken note
 * into the readout, widen this rather than trusting the clarity gate to sort
 * out a signal that is genuinely a clean note.
 */
export const CUE_DECAY_MARGIN_S = 0.15

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
  isWithinCue(time: number, marginS?: number): boolean
}

export type UseMicPitchOptions = {
  engine: MicEngine
  /** The "Listen for my playing" setting. Off means no microphone is opened. */
  enabled: boolean
  /** Playback is running. The microphone is only ever open alongside it. */
  running: boolean
}

/**
 * Listens through the microphone while practice runs and reports what it hears.
 *
 * The lifecycle is the whole job. The microphone is opened only while the
 * setting is on and playback is running, and every way out of that — a pause, a
 * stop, an unmount, a refusal, or an acquire that a newer one has already
 * superseded — stops the stream's tracks, not just the nodes. A browser that
 * leaves its recording indicator lit after you press pause is a bug report.
 */
export function useMicPitch({ engine, enabled, running }: UseMicPitchOptions) {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [heard, setHeard] = useState<HeardPitch | null>(null)

  const engineRef = useRef(engine)
  useEffect(() => {
    engineRef.current = engine
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
      setHeard(null)
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
      // Only what falls outside every cue interval counts as playing.
      if (detected === null || engineRef.current.isWithinCue(audioTime, CUE_DECAY_MARGIN_S)) {
        setHeard((current) => (current === null ? current : null))
        return
      }

      const { pitchClass, cents } = frequencyToPitch(detected.frequency)
      const event: HeardPitch = { pitchClass, cents, clarity: detected.clarity, audioTime }

      for (const listener of listenersRef.current ?? []) {
        listener(event)
      }

      // Subscribers get every frame; React only gets the changes, so a held
      // note is one render rather than twenty a second.
      setHeard((current) => (current !== null && current.pitchClass === pitchClass ? current : event))
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

  return { status, heard, subscribe }
}
