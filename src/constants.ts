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

export const BEAT_SPAN_OPTIONS = [1, 2, 4, 8, 12] as const
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
/**
 * The narrowest share a timeline segment may claim, in flex-seconds. Purely a
 * readability floor: a 25-second exam after twelve minutes of blocks is a
 * sliver no label fits inside. A floor on flex-grow can never overflow the row
 * the way a pixel minimum could — it only re-divides it.
 */
export const MIN_BLOCK_FLEX_SECONDS = 90

export const SESSION_GOAL_OPTIONS = [5, 10, 20] as const
export const DEFAULT_SESSION_GOAL_MIN = 10

/** Look-ahead scheduler tuning: the tick wakes every 25ms and keeps ~250ms of
 * audio scheduled at explicit AudioContext times, so the click never drifts. */
export const SCHEDULE_AHEAD_S = 0.25
export const SCHEDULER_TICK_MS = 25

/**
 * Every localStorage key the app owns. The store holds strings and nothing
 * else, so each key carries its own codec rather than a shared format.
 *
 * The contract for everything read through `usePersistentState` — directly, or
 * through `useSettings`' per-key codecs: a stored value the codec doesn't
 * recognise is rejected outright (`deserialize` returns undefined) and the
 * default stands in for it. The mount-time write-back then persists whatever
 * was accepted, so the store normalises itself on the way in — a BPM saved
 * above the ceiling comes back clamped, a junk theme comes back as the default
 * and is rewritten as such. Nothing partially-valid survives: rejection is per
 * key, never per field.
 *
 * Underneath, `src/lib/storage.ts` keeps both halves crash-proof. A store that
 * is absent, blocked or throwing (Safari private mode, cookies off) reads as a
 * missing key, and a write that fails — a full quota — is dropped silently and
 * the value lives on in memory for the rest of the session.
 *
 * `practiceLog` and `iosInstallHint` reach localStorage on their own, with the
 * same crash-proofing but different salvage rules; see their notes below.
 */
export const STORAGE_KEYS = {
  theme: 'fretboard-theme',
  skin: 'fretboard-skin',
  bpm: 'fretboard-bpm',
  continuousMode: 'fretboard-continuous-mode',
  speedRampMode: 'fretboard-speed-ramp-mode',
  rampTarget: 'fretboard-ramp-target',
  endSound: 'fretboard-end-sound',
  countIn: 'fretboard-count-in',
  beatsPerNote: 'fretboard-beats-per-note',
  spelling: 'fretboard-spelling',
  // Pitch classes as comma-joined indices — '0,4,7'. Rejected as a whole
  // unless every segment is a distinct integer within the octave, so a gappy
  // '1,,3' can't coerce its way into a pool holding C.
  notePool: 'fretboard-note-pool',
  sessionGoal: 'fretboard-session-goal',
  // Which way the transport's goal readout counts: literally 'remaining' or
  // 'elapsed'. Anything else is rejected and the readout counts up.
  goalCountdown: 'fretboard-goal-countdown',
  showFretboard: 'fretboard-show-neck',
  // Off unless it literally reads 'true'. The microphone is the one setting
  // where a value we did not write must never be read as consent.
  micListen: 'fretboard-mic-listen',
  // A JSON array of the saved setups and workouts on the shelf. The exception
  // to whole-value rejection: `parseRoutines` salvages entry by entry, keeping
  // every routine (and block) it can read and dropping the rest. Only a value
  // that isn't parseable JSON, or isn't an array, loses the lot — and then the
  // seeded shelf takes over.
  routines: 'fretboard-routines',
  // Which of the above is chosen, as its id; '' means none. Any non-empty
  // string is accepted and written back as it stands, because an id can only
  // be judged against the shelf: one that no longer matches anything simply
  // resolves to no selection when it is looked up.
  selectedRoutine: 'fretboard-selected-routine',
  // Set the first time practice starts. Until then the browser layout keeps the
  // setup cards folded away, so a first run is a stage and a start button
  // rather than a page of controls.
  setupRevealed: 'fretboard-setup-revealed',
  // Versioned in the key itself: the practice log is the one store whose shape
  // is worth migrating rather than dropping. JSON, read and written by
  // src/lib/history.ts rather than the hooks above, and sanitised a day at a
  // time — a day that doesn't survive validation is dropped and the rest of the
  // log stands. The cleaned-up shape only reaches storage on the next practice
  // write, not on mount.
  practiceLog: 'rnt.history.v1',
  // The name you go by on a shared challenge's board, so joining a second one
  // costs no typing. Only ever read when `?challenge=` is in the URL — without
  // it the scoreboard does not exist and this key is never touched.
  challengeNickname: 'fretboard-challenge-nickname',
  // Literally 'dismissed', or unset. Anything else reads as not yet dismissed
  // and is left exactly where it is: the hint costs a launch to show and a tap
  // to send away, which is cheaper than rewriting a value nobody asked about.
  iosInstallHint: 'fretboard-ios-install-hint',
} as const

/**
 * How long the idle hero holds each ghost note. The CSS breathe animation
 * (`ghost-breathe` in index.css) is authored to this same length, so a note
 * has always faded back out by the time the next one is dealt.
 */
export const IDLE_PREVIEW_MS = 2_750

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
  // A device with no keyboard has no Space key to name, so Hero swaps this in.
  idleTouch: 'Press start to begin.',
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
