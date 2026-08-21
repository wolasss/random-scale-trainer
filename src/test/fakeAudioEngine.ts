/**
 * The fake engine accepts every scheduled sound and reports the faked
 * performance clock, so beats become due as the fake timers advance.
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

export class FakeAudioEngine {
  async ensureContext() {
    return {}
  }
  async loadNoteBuffers() {}
  hasBuffers() {
    return true
  }
  getCurrentTime() {
    return performance.now() / 1000
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
