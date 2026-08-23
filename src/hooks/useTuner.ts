import { useEffect, useRef, useState } from 'react'
import {
  createMicCapture,
  isMicSupported,
  releaseMicStream,
  requestMicStream,
  type MicCapture,
  type PcmFrame,
} from '../lib/audio/mic'
import { detectPitch, frequencyToPitch } from '../lib/audio/pitch'
import { SHARP_DISPLAY } from '../lib/notes'
import { MIC_POLL_MS, type MicStatus } from './useMicPitch'

export type TunerString = {
  /** How a guitarist names the string: the one nearest the floor is the 6th. */
  label: string
  name: string
  hz: number
}

/**
 * Standard tuning, low to high. Equal temperament at A4 = 440, which is what
 * `frequencyToPitch` measures against too — so the two never disagree about
 * what a string in tune sounds like.
 */
export const STANDARD_TUNING: readonly TunerString[] = [
  { label: '6th string', name: 'E', hz: 82.41 },
  { label: '5th string', name: 'A', hz: 110 },
  { label: '4th string', name: 'D', hz: 146.83 },
  { label: '3rd string', name: 'G', hz: 196 },
  { label: '2nd string', name: 'B', hz: 246.94 },
  { label: '1st string', name: 'E', hz: 329.63 },
] as const

/**
 * Half the width of the band that counts as in tune. Five cents either way is
 * inside what a beating pair of strings gives away and comfortably outside what
 * the detector's own error can invent: a clean sine at any of the six open
 * strings above reads back to well under a cent through `detectPitch`, so the
 * band is a musical judgement rather than a concession to the arithmetic.
 */
export const IN_TUNE_CENTS = 5

/**
 * How far off the needle can go before it pins. A semitone either way is the
 * whole distance to the neighbouring string's pitch, and past it the answer is
 * "you are on the wrong string", which the string name already says.
 */
export const METER_RANGE_CENTS = 50

export type TunerStatus = 'flat' | 'in-tune' | 'sharp'

export type TunerReading = {
  string: TunerString
  /** Signed distance from that string's pitch: negative is flat. */
  cents: number
  status: TunerStatus
  /** The pitch actually heard, e.g. "A2". */
  note: string
  frequency: number
}

/**
 * Which open string a frequency is closest to, and by how much.
 *
 * Measured against the string rather than the nearest semitone on purpose: a
 * string 40 cents flat is still nearer its own pitch than any other, and
 * rounding it onto the semitone it happens to be closest to would report it as
 * in tune while it plainly isn't.
 *
 * Absolute frequencies, not pitch classes, for the same reason. Folding octaves
 * away would rescue the odd frame `detectPitch` names an octave out — but it
 * would also call a string that is a whole tone flat, which is a real and
 * common state for one, by the name of the string it has landed on top of and
 * pronounce it in tune. A pinned needle against the wrong string's name is a
 * reading you distrust; a confident "in tune" is one you act on. It also keeps
 * the two E strings, two octaves apart, tellable apart at all.
 */
export const nearestOpenString = (frequency: number): { string: TunerString; cents: number } => {
  let best = STANDARD_TUNING[0]
  let bestCents = 1200 * Math.log2(frequency / best.hz)

  for (const candidate of STANDARD_TUNING) {
    const cents = 1200 * Math.log2(frequency / candidate.hz)
    if (Math.abs(cents) < Math.abs(bestCents)) {
      best = candidate
      bestCents = cents
    }
  }

  return { string: best, cents: bestCents }
}

/**
 * The slice of AudioEngine the tuner needs — one method, so a fake in a test is
 * one function and the real engine satisfies it structurally. A caller that has
 * already opened the context inside the click can answer with that promise
 * instead; either way the hook has a context before it asks for a microphone.
 */
export type TunerAudio = {
  ensureContext(): Promise<AudioContext | null>
}

export type UseTunerOptions = {
  audio: TunerAudio
  /** The panel is on screen. Closed means no microphone is open, ever. */
  open: boolean
}

/**
 * Listens for one string at a time and says how far off it is.
 *
 * Same bargain as `useMicPitch`: the microphone is open for exactly as long as
 * the thing that needs it is on screen, and every way out of that — a close, an
 * unmount, a refusal, or an acquire a newer one has superseded — stops the
 * stream's tracks rather than just disconnecting the nodes.
 *
 * The context comes first, before the permission prompt, because
 * `AudioEngine.ensureContext` has to run inside the gesture that opened the
 * panel: awaiting `getUserMedia` first would spend that activation on the
 * prompt and leave the context suspended. An effect runs after the click that
 * scheduled it has returned, so the caller is expected to *start* the context
 * in the click handler and hand this hook the promise it started — `ensureContext`
 * here awaits that opening rather than beginning one. Nothing has been asked
 * for at that point either way, so a context that never opens strands no stream.
 */
export function useTuner({ audio, open }: UseTunerOptions) {
  const [micStatus, setStatus] = useState<MicStatus>('idle')
  const [micReading, setReading] = useState<TunerReading | null>(null)

  // Refreshed every render so the effect depends on `active` alone — an engine
  // rebuilt on a render must never reopen the microphone.
  const audioRef = useRef(audio)
  useEffect(() => {
    audioRef.current = audio
  })

  // A browser with no microphone API is answered without one being reached for,
  // so the only state worth holding is the state of a microphone that exists.
  const supported = isMicSupported()
  const active = open && supported

  useEffect(() => {
    if (!active) {
      // Nothing below this line may touch a microphone API: with the panel shut
      // the app has to behave exactly as it did before the tuner existed.
      return undefined
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
      // A plucked string is under the clarity gate long before you have read the
      // needle, so silence leaves the last reading standing rather than wiping
      // it — same reasoning as the readout during practice.
      if (detected === null) {
        return
      }

      const { string, cents } = nearestOpenString(detected.frequency)
      const { pitchClass, octave } = frequencyToPitch(detected.frequency)

      setReading({
        string,
        cents,
        status: cents < -IN_TUNE_CENTS ? 'flat' : cents > IN_TUNE_CENTS ? 'sharp' : 'in-tune',
        // A tuner names the pitch it hears, always with sharps: the spelling
        // preference belongs to what the app *calls*, and a string is neither
        // asked for nor answered here.
        note: `${SHARP_DISPLAY[pitchClass]}${octave}`,
        frequency: detected.frequency,
      })
    }

    const openMic = async () => {
      let context: AudioContext | null
      try {
        context = await audioRef.current.ensureContext()
      } catch {
        context = null
      }

      if (cancelled) {
        return
      }

      // No context is no analyser to hang the microphone off, and a browser
      // that refused to open one is not going to listen either.
      if (context === null) {
        setStatus('unsupported')
        return
      }

      let stream: MediaStream
      try {
        stream = await requestMicStream()
      } catch {
        if (!cancelled) {
          setStatus('denied')
        }

        return
      }

      // Closed while the permission prompt was up: this stream belongs to
      // nobody, and nothing else will ever stop it.
      if (cancelled) {
        releaseMicStream(stream)
        return
      }

      capture = createMicCapture(context, stream)
      // Sized by the capture, not by the constant: a context running at 96 kHz
      // needs a longer frame before the low E's period fits inside the search.
      const frame = new Float32Array(capture.frameSize)
      const { sampleRate } = context
      setStatus('listening')
      pollId = window.setInterval(() => poll(frame, sampleRate), MIC_POLL_MS)
    }

    void openMic()

    return () => {
      cancelled = true
      if (pollId !== undefined) {
        window.clearInterval(pollId)
      }

      capture?.release()
      capture = null

      // Handing the microphone back and forgetting what it heard are the same
      // event: a needle left standing over a stream that has been released is
      // a reading of nothing.
      setStatus('idle')
      setReading(null)
    }
  }, [active])

  // Derived rather than held, so a browser that cannot listen says so without a
  // render's worth of "opening the microphone…" in front of it, and a shut
  // panel reports nothing whatever the last session left behind.
  const status: MicStatus = active ? micStatus : open ? 'unsupported' : 'idle'

  return { status, reading: active ? micReading : null }
}
