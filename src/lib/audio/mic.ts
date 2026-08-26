/**
 * The only file in the app that touches the microphone APIs. Everything above
 * it — the hook, the readout, and whatever scores what it hears — works against
 * the two small shapes below, so none of it needs a browser to be tested.
 */
import { MIN_PITCH_HZ } from './pitch'

/** Frames of this length hold four periods of a low E at 44.1 or 48 kHz. */
export const MIC_FRAME_SIZE = 2048

/** As large an analyser as the Web Audio API will build. */
const MAX_FRAME_SIZE = 32768

/**
 * The frame length a context's sample rate needs, as a size an analyser takes.
 *
 * `detectPitch` searches lags out to half a frame, and the longest period it
 * will name is `sampleRate / MIN_PITCH_HZ` samples — so the constant above is
 * only enough while the hardware runs at the rates a laptop picks. Plug in an
 * audio interface at 96 kHz and a low E's period is 1165 samples, past the end
 * of the search inside a 2048-sample frame, and the 6th string reads as nothing
 * at all. Doubling with the rate keeps the frame the same length in *seconds*,
 * which is what the detector actually cares about.
 */
export const micFrameSizeFor = (sampleRate: number): number => {
  const needed = 2 * (sampleRate / MIN_PITCH_HZ)

  let size = MIC_FRAME_SIZE
  // Analyser sizes are powers of two. A rate that wants more than the largest
  // of them is not a rate anything records a guitar at.
  while (size < needed && size < MAX_FRAME_SIZE) {
    size *= 2
  }

  return size
}

/**
 * Raw capture, with every voice-call nicety switched off. All three of these
 * are built for speech, and an instrument is exactly what they are built to
 * remove: the noise suppressor hears a decaying string as background hum and
 * gates it, automatic gain pumps the level under the detector's RMS floor, and
 * echo cancellation is what pulls iOS onto its voice-processing route — which
 * also ducks the app's own cues, and in the home-screen app strips a pluck
 * down to one stray frame where the scoring needs a sustained pair. The app
 * hearing itself is not this constraint's job and never really was: the cue
 * intervals the engine records are what keep the microphone deaf to the app's
 * own voice, and they work the same over a raw stream.
 */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
}

export type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>

/**
 * A frame of samples the analyser can write into. Spelled out rather than left
 * as a bare Float32Array because getFloatTimeDomainData refuses a view over a
 * SharedArrayBuffer, which is what the unparameterised type allows.
 */
export type PcmFrame = Float32Array<ArrayBuffer>

/** A live microphone, reduced to the things the detector loop needs. */
export type MicCapture = {
  /**
   * How many samples a frame holds, from `micFrameSizeFor`. Allocate against
   * this rather than the constant: `getFloatTimeDomainData` fills a shorter
   * array by dropping the samples that do not fit, which on a fast context
   * would throw away exactly the extra length the low strings need.
   */
  readonly frameSize: number
  /** Fills `target` with the newest frame of samples. */
  readFrame(target: PcmFrame): void
  /** Disconnects the nodes AND stops the tracks — the indicator must go dark. */
  release(): void
}

export const isMicSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

export const requestMicStream = (
  getUserMedia: GetUserMedia = (constraints) => navigator.mediaDevices.getUserMedia(constraints),
): Promise<MediaStream> => getUserMedia(MIC_CONSTRAINTS)

/** Stops every track on a stream. Safe to call on one that was never used. */
export const releaseMicStream = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

/**
 * Asks for the microphone and hands it straight back, purely to get the
 * browser's permission prompt out of the way.
 *
 * A shared challenge is scored on what you play, so the permission is going to
 * be needed either way — and asking for it at the moment the first note is
 * called means the prompt lands on top of the thing you are meant to be
 * reading. Asking on arrival costs one dialog and buys a session that starts
 * cleanly. The stream is released immediately: `useMicPitch` opens its own when
 * playback starts, and a recording indicator lit through the setup would be a
 * lie about what the app is doing.
 *
 * Never throws. A refusal is an answer — `useMicPitch` will report it as such
 * when it asks again for real.
 */
export const primeMicPermission = async (getUserMedia?: GetUserMedia): Promise<boolean> => {
  if (!isMicSupported()) {
    return false
  }

  try {
    releaseMicStream(await requestMicStream(getUserMedia))
    return true
  } catch {
    return false
  }
}

/**
 * Wires a stream into an analyser on the app's own AudioContext, so the frames
 * it hands out are timestamped on the same clock the beats are scheduled with.
 * Deliberately not connected to the destination: that is a feedback loop.
 */
export const createMicCapture = (context: AudioContext, stream: MediaStream): MicCapture => {
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  const frameSize = micFrameSizeFor(context.sampleRate)
  analyser.fftSize = frameSize
  // Time-domain data only, and the detector wants the samples as they arrived.
  analyser.smoothingTimeConstant = 0
  source.connect(analyser)

  // Opening the microphone is what flips iOS's audio session from playback
  // over to play-and-record, and Safari answers that flip by parking the
  // context in a nonstandard 'interrupted' state — every cue silent and every
  // frame here a row of zeros, on the very tap that granted the permission.
  // Resuming is permitted once the interruption has been delivered, so the
  // context gets a nudge now (the flip may have landed while the permission
  // prompt was up) and on every state change while the capture is open. A
  // refusal means the interruption is still in force; the statechange it ends
  // with tries again.
  const resumeIfParked = () => {
    const state = context.state as string
    if (state !== 'running' && state !== 'closed') {
      void context.resume().catch(() => undefined)
    }
  }
  context.addEventListener('statechange', resumeIfParked)
  resumeIfParked()

  return {
    frameSize,
    readFrame: (target) => analyser.getFloatTimeDomainData(target),
    release: () => {
      context.removeEventListener('statechange', resumeIfParked)
      source.disconnect()
      analyser.disconnect()
      releaseMicStream(stream)
    },
  }
}
