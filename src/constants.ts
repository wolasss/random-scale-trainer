export const MIN_BPM = 30
export const MAX_BPM = 240
export const DEFAULT_BPM = 72
export const COUNT_IN_BEATS = 4
/** How much a completed round adds to the tempo while the ramp is climbing. */
export const RAMP_BPM_STEP = 2
/** The ramp target moves in coarser steps than the tempo — it is a goal, not a nudge. */
export const RAMP_TARGET_STEP = 5
/** How far above the current tempo a target lands when nobody has named one. */
export const RAMP_TARGET_OFFSET = 40

export const BEAT_SPAN_OPTIONS = [1, 2, 4, 8] as const
export const DEFAULT_BEATS_PER_NOTE = 4

export type BeatsPerNote = (typeof BEAT_SPAN_OPTIONS)[number]

export const clampBpm = (value: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)))

/**
 * A target below the tempo you are already at is not a goal, so the floor is
 * one climb above it. At the very top of the range the floor is the top itself.
 */
export const clampRampTarget = (target: number, bpm: number) =>
  Math.min(MAX_BPM, Math.max(Math.min(bpm + RAMP_BPM_STEP, MAX_BPM), Math.round(target)))

export const defaultRampTarget = (bpm: number) => clampRampTarget(bpm + RAMP_TARGET_OFFSET, bpm)

/** Completed rounds still to come before the tempo settles on its target. */
export const rampRounds = (bpm: number, target: number) => Math.max(0, Math.ceil((target - bpm) / RAMP_BPM_STEP))

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
  rampTarget: 'fretboard-ramp-target',
  endSound: 'fretboard-end-sound',
  beatsPerNote: 'fretboard-beats-per-note',
  spelling: 'fretboard-spelling',
  notePool: 'fretboard-note-pool',
  sessionGoal: 'fretboard-session-goal',
  showFretboard: 'fretboard-show-neck',
  routines: 'fretboard-routines',
  selectedRoutine: 'fretboard-selected-routine',
  // Versioned in the key itself: the practice log is the one store whose shape
  // is worth migrating rather than dropping.
  practiceLog: 'rnt.history.v1',
  iosInstallHint: 'fretboard-ios-install-hint',
} as const

/**
 * A metronome clicking in a pocket is worse than one that stopped: playback
 * gives up after this long off-screen rather than waiting to be found.
 */
export const HIDDEN_STOP_MS = 60_000

/**
 * Background tabs throttle timers while the audio clock keeps running, so a
 * scheduler that wakes up late would otherwise fire every missed beat at once.
 * Falling this far behind means re-anchoring to the clock instead of catching up.
 */
export const RESYNC_THRESHOLD_S = 0.5

/** User-visible playback strings. The e2e suite pins these exact values
 * (e2e/pages/trainer.page.ts keeps its own golden copies on purpose). */
export const PLAYBACK_MESSAGES = {
  idle: 'Press start — or hit Space.',
  countingIn: 'Counting in…',
  playing: 'Find it on the neck before the next beat.',
  // The ramp names the number it is heading for, then says when it has arrived.
  // A session that ends at a tempo you chose is the whole point of the ceiling.
  rampClimbing: (target: number) => `Climbing to ${target} BPM, ${RAMP_BPM_STEP} at a time.`,
  rampHolding: (bpm: number) => `At your target tempo — holding ${bpm} BPM.`,
  paused: 'Paused — the timer stopped too.',
  loadingAudio: 'Loading audio...',
  noNotes: 'No notes available.',
  audioUnsupported: 'Audio playback is unsupported in this browser.',
  audioLoadFailed: 'Failed to load audio. Please reload the page.',
  finished: (noteCount: number) => `Finished all ${noteCount} notes.`,
  routineComplete: 'Routine complete — press start to run it again.',
  hiddenTooLong: 'Stopped — the app was in the background.',
} as const
