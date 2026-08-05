export const MIN_BPM = 10
export const MAX_BPM = 100
export const DEFAULT_BPM = 30
export const COUNT_IN_BEATS = 3
export const COUNT_IN_MS = 650

export const NOTES_PER_CYCLE = 12

/** Idle placeholder shown when nothing is playing. Uses the Unicode flat sign
 * (U+266D) so it can never collide with real note names, which are ASCII —
 * the e2e suite relies on this distinction. */
export const IDLE_NOTE = 'A♭'

export const STORAGE_KEYS = {
  theme: 'fretboard-theme',
  bpm: 'fretboard-bpm',
  continuousMode: 'fretboard-continuous-mode',
  speedRampMode: 'fretboard-speed-ramp-mode',
  endSound: 'fretboard-end-sound',
} as const

/** User-visible playback strings. The e2e suite pins these exact values
 * (e2e/pages/trainer.page.ts keeps its own golden copies on purpose). */
export const PLAYBACK_MESSAGES = {
  idle: 'Press play to start.',
  paused: 'Paused',
  getReady: 'Get ready...',
  resuming: 'Resuming...',
  loadingAudio: 'Loading audio...',
  noNotes: 'No notes available.',
  audioUnsupported: 'Audio playback is unsupported in this browser.',
  audioLoadFailed: 'Failed to load audio. Please reload the page.',
  finished: 'Finished all 12 notes.',
  countIn: (beat: number) => `Starting in ${beat}...`,
  finishedWithBpm: (bpm: number) => `Finished all 12 notes. BPM set to ${bpm}.`,
} as const
