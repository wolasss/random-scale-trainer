export const MIN_BPM = 30
export const MAX_BPM = 240
export const DEFAULT_BPM = 72
export const COUNT_IN_BEATS = 4
export const RAMP_BPM_STEP = 2

export const BEAT_SPAN_OPTIONS = [1, 2, 4, 8] as const
export const DEFAULT_BEATS_PER_NOTE = 4

export type BeatsPerNote = (typeof BEAT_SPAN_OPTIONS)[number]

export const clampBpm = (value: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)))

/** Duration a block gets when a saved setup is grown into a workout. */
export const DEFAULT_BLOCK_SECONDS = 120
/** Flex basis for an open-ended block, so the timeline still has a shape. */
export const OPEN_BLOCK_FLEX_SECONDS = 240

export const SESSION_GOAL_OPTIONS = [5, 10, 20] as const
export const DEFAULT_SESSION_GOAL_MIN = 10

/** Look-ahead scheduler tuning: the tick wakes every 25ms and keeps ~250ms of
 * audio scheduled at explicit AudioContext times, so the click never drifts. */
export const SCHEDULE_AHEAD_S = 0.25
export const SCHEDULER_TICK_MS = 25

export const STORAGE_KEYS = {
  theme: 'fretboard-theme',
  bpm: 'fretboard-bpm',
  continuousMode: 'fretboard-continuous-mode',
  speedRampMode: 'fretboard-speed-ramp-mode',
  endSound: 'fretboard-end-sound',
  beatsPerNote: 'fretboard-beats-per-note',
  spelling: 'fretboard-spelling',
  notePool: 'fretboard-note-pool',
  sessionGoal: 'fretboard-session-goal',
  showFretboard: 'fretboard-show-neck',
  routines: 'fretboard-routines',
} as const

/** User-visible playback strings. The e2e suite pins these exact values
 * (e2e/pages/trainer.page.ts keeps its own golden copies on purpose). */
export const PLAYBACK_MESSAGES = {
  idle: 'Press start — or hit Space.',
  countingIn: 'Counting in…',
  playing: 'Find it on the neck before the next beat.',
  playingRamp: 'Speed ramp on — it gets faster every round.',
  paused: 'Paused — the timer stopped too.',
  loadingAudio: 'Loading audio...',
  noNotes: 'No notes available.',
  audioUnsupported: 'Audio playback is unsupported in this browser.',
  audioLoadFailed: 'Failed to load audio. Please reload the page.',
  finished: (noteCount: number) => `Finished all ${noteCount} notes.`,
  routineComplete: 'Routine complete — press start to run it again.',
} as const
