/**
 * The only file in the app that touches the microphone APIs. Everything above
 * it — the hook, the readout, and whatever scores what it hears — works against
 * the two small shapes below, so none of it needs a browser to be tested.
 */

/** Frames of this length hold four periods of a low E at any sane sample rate. */
export const MIC_FRAME_SIZE = 2048

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

/**
 * What the capture can say about itself, for the on-device debug overlay: the
 * settings the browser *actually applied* — on iOS the honest answer to
 * whether the raw-capture constraints were honoured or quietly ignored — and
 * the live state of both contexts.
 */
export type MicCaptureDiagnostics = {
  trackSettings: MediaTrackSettings
  appContextState: string
  appContextRate: number
  captureContextState: string
  captureContextRate: number
  /** Whether the analyser sits on a context of the capture's own. */
  ownContext: boolean
}

/** A live microphone, reduced to what the detector loop needs. */
export type MicCapture = {
  /** Samples-per-second of the frames `readFrame` fills. */
  sampleRate: number
  /** Fills `target` with the newest frame of samples. */
  readFrame(target: PcmFrame): void
  /**
   * Re-nudges any parked context. Called from the poll loop, because the
   * statechange watcher has a blind spot: a context that *starts* parked and
   * has its first resume() refused never fires a statechange to retry on.
   */
  keepAlive(): void
  /** The live state of the plumbing — see MicCaptureDiagnostics. */
  diagnostics(): MicCaptureDiagnostics
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

type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext }

/**
 * A context of the capture's own, opened while the microphone session is live
 * so it is born at the record route's native sample rate. Analysing off the
 * app's existing context looks tidier — one context, one clock — but iOS moves
 * the hardware rate when the microphone opens, and Safari's MediaStreamSource
 * delivers silence into a context whose rate no longer matches the track's.
 * The shared clock was never load-bearing here: frames carry no time of their
 * own, and whoever polls them stamps them off the engine.
 *
 * Null where no context can be built — the app's own context is the fallback,
 * and the only context a test environment has.
 */
const createCaptureContext = (): AudioContext | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const AudioContextClass = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext
  if (!AudioContextClass) {
    return null
  }

  try {
    return new AudioContextClass()
  } catch {
    // The browser's context limit; the fallback shares the app's instead.
    return null
  }
}

/**
 * Opening the microphone is what flips iOS's audio session from playback over
 * to play-and-record, and Safari answers that flip by parking a running
 * context in a nonstandard 'interrupted' state — every cue silent and every
 * frame here a row of zeros, on the very tap that granted the permission. A
 * freshly created context can start parked the same way. Resuming is permitted
 * once the interruption has been delivered, so the context gets a nudge now
 * (the flip may have landed while the permission prompt was up) and on every
 * state change for as long as the watcher stands. A refusal means the
 * interruption is still in force; the statechange it ends with tries again —
 * and because a refusal with no state change fires no event at all, the
 * returned nudge is also called from the capture's poll loop.
 */
const watchAndResume = (context: AudioContext): { nudge: () => void; unwatch: () => void } => {
  const nudge = () => {
    const state = context.state as string
    if (state !== 'running' && state !== 'closed') {
      void context.resume().catch(() => undefined)
    }
  }
  context.addEventListener('statechange', nudge)
  nudge()

  return { nudge, unwatch: () => context.removeEventListener('statechange', nudge) }
}

/**
 * Wires a stream into an analyser. The analyser hangs off a context of the
 * capture's own where one can be built — see `createCaptureContext` — and off
 * the app's context otherwise. Deliberately not connected to the destination:
 * that is a feedback loop.
 *
 * The app's context is watched either way: the session flip that opening the
 * microphone causes is exactly what parks it, and it must keep sounding the
 * cues while the capture is open.
 */
export const createMicCapture = (appContext: AudioContext, stream: MediaStream): MicCapture => {
  const own = createCaptureContext()
  const context = own ?? appContext
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = MIC_FRAME_SIZE
  // Time-domain data only, and the detector wants the samples as they arrived.
  analyser.smoothingTimeConstant = 0
  source.connect(analyser)

  const watchers = [watchAndResume(appContext)]
  if (own !== null) {
    watchers.push(watchAndResume(own))
  }

  return {
    sampleRate: context.sampleRate,
    readFrame: (target) => analyser.getFloatTimeDomainData(target),
    keepAlive: () => {
      for (const watcher of watchers) {
        watcher.nudge()
      }
    },
    diagnostics: () => ({
      trackSettings:
        typeof stream.getAudioTracks === 'function' ? (stream.getAudioTracks()[0]?.getSettings() ?? {}) : {},
      appContextState: appContext.state,
      appContextRate: appContext.sampleRate,
      captureContextState: context.state,
      captureContextRate: context.sampleRate,
      ownContext: own !== null,
    }),
    release: () => {
      for (const watcher of watchers) {
        watcher.unwatch()
      }

      source.disconnect()
      analyser.disconnect()
      // The capture's context dies with it; the app's goes on playing cues.
      if (own !== null) {
        void own.close().catch(() => undefined)
      }

      releaseMicStream(stream)
    },
  }
}
