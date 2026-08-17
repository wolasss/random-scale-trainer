/**
 * The only file in the app that touches the microphone APIs. Everything above
 * it — the hook, the readout, and whatever scores what it hears — works against
 * the two small shapes below, so none of it needs a browser to be tested.
 */

/** Frames of this length hold four periods of a low E at any sane sample rate. */
export const MIC_FRAME_SIZE = 2048

/**
 * Echo cancellation is on because the app is playing the very note it is
 * listening for, out of the same device's speaker. It is a second line of
 * defence, never the only one: the cue intervals the engine records are what
 * actually keep the app from hearing itself, since a phone on a table with no
 * echo canceller worth the name is a normal way to practise.
 */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true },
}

export type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>

/**
 * A frame of samples the analyser can write into. Spelled out rather than left
 * as a bare Float32Array because getFloatTimeDomainData refuses a view over a
 * SharedArrayBuffer, which is what the unparameterised type allows.
 */
export type PcmFrame = Float32Array<ArrayBuffer>

/** A live microphone, reduced to the two things the detector loop needs. */
export type MicCapture = {
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
 * Wires a stream into an analyser on the app's own AudioContext, so the frames
 * it hands out are timestamped on the same clock the beats are scheduled with.
 * Deliberately not connected to the destination: that is a feedback loop.
 */
export const createMicCapture = (context: AudioContext, stream: MediaStream): MicCapture => {
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = MIC_FRAME_SIZE
  // Time-domain data only, and the detector wants the samples as they arrived.
  analyser.smoothingTimeConstant = 0
  source.connect(analyser)

  return {
    readFrame: (target) => analyser.getFloatTimeDomainData(target),
    release: () => {
      source.disconnect()
      analyser.disconnect()
      releaseMicStream(stream)
    },
  }
}
