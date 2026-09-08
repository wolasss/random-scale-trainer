/**
 * The fake engine accepts every scheduled sound and reports the faked
 * performance clock, so beats become due as the fake timers advance. It also
 * carries the microphone surface (a context to hang the analyser off, plus
 * the cue-interval queries) that suites exercising the mic path need.
 *
 * `vi.mock` factories are hoisted above imports, so reach this module through
 * a dynamic import inside the factory rather than a top-level one:
 *
 *   vi.mock('./lib/audio/engine', async () => ({
 *     AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
 *   }))
 */

export type ScheduledSound = { kind: 'click' | 'note'; key: string; time: number }

let recording = false

/** Opt-in: only suites that call `record()` pay for tracking scheduled sounds. */
export const soundLog = {
  sounds: [] as ScheduledSound[],
  stopScheduledCalls: 0,
  record() {
    recording = true
    soundLog.sounds.length = 0
    soundLog.stopScheduledCalls = 0
  },
}

/**
 * The slice of `AudioContext` that `src/lib/audio/mic.ts`'s `createMicCapture`
 * touches. jsdom has no `window.AudioContext`, so the capture falls back to
 * the app's own context and hangs its analyser off it.
 */
export const createFakeAudioContext = () => ({
  sampleRate: 44100,
  state: 'running',
  async resume() {},
  addEventListener() {},
  removeEventListener() {},
  createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
  createAnalyser: () => ({
    fftSize: 0,
    smoothingTimeConstant: 1,
    getFloatTimeDomainData() {},
    connect() {},
    disconnect() {},
  }),
})

export class FakeAudioEngine {
  context = createFakeAudioContext()
  async ensureContext() {
    return this.context
  }
  getContext() {
    return this.context
  }
  async loadNoteBuffers() {}
  hasBuffers() {
    return true
  }
  getCurrentTime() {
    return performance.now() / 1000
  }
  isWithinCue() {
    return false
  }
  getCueEndForBeat() {
    return null
  }
  playClickAt(time: number) {
    if (recording) {
      soundLog.sounds.push({ kind: 'click', key: 'click', time })
    }
  }
  playNoteAt(key: string, time: number) {
    if (recording) {
      soundLog.sounds.push({ kind: 'note', key, time })
    }
  }
  playSessionEndChime() {}
  stopScheduledSounds() {
    if (recording) {
      soundLog.stopScheduledCalls += 1
    }
  }
}
