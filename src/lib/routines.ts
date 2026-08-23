import {
  BEAT_SPAN_OPTIONS,
  clampRampTarget,
  DEFAULT_BLOCK_SECONDS,
  defaultRampTarget,
  MAX_BPM,
  MIN_BPM,
  MIN_BLOCK_FLEX_SECONDS,
  OPEN_BLOCK_FLEX_SECONDS,
  type BeatsPerNote,
} from '../constants'
import { PITCH_CLASSES, sortedPcs, type SpellingPreference } from './notes'
import { matchPreset, PRESETS, type PresetId } from './presets'
import { cycleSeconds } from './time'

/**
 * A routine is a named, ordered list of blocks. A block sets tempo, note pool,
 * note-change rate and accidental spelling, and optionally has a duration.
 *
 * One block with `dur: null` is a saved setup — it applies its settings and
 * runs until the user stops. Several blocks with durations is a timed workout.
 * They are the same object at different lengths, never two features.
 */
export type RoutineBlock = {
  name: string
  poolKey: PoolKey
  /** Explicit pitch classes; set only for a custom chip selection, else null. */
  pool: number[] | null
  bpm: number
  beats: BeatsPerNote
  /** null leaves the user's current spelling alone. */
  acc: RoutineAccidental | null
  /**
   * Whether the tempo climbs while this block runs. The ramp belongs to the
   * block rather than the app: a global one would climb the tempo only for the
   * next block to silently reset it.
   */
  ramp: boolean
  /** The tempo the ramp stops at; meaningful only while `ramp` is true. */
  rampTo: number
  /** Seconds; null = open-ended, runs until stopped. */
  dur: number | null
}

export type Routine = {
  id: string
  name: string
  blocks: RoutineBlock[]
}

export type PoolKey =
  | 'chromatic'
  | 'naturals'
  | 'accidentals'
  | 'C'
  | 'G'
  | 'D'
  | 'A'
  | 'E'
  | 'F'
  | 'Am'
  | 'custom'

export type RoutineAccidental = 'flats' | 'sharps' | 'mixed'

/** The settings a block owns — everything else is left to the user. */
export type BlockSettings = {
  bpm: number
  beatsPerNote: BeatsPerNote
  pool: number[]
  spelling: SpellingPreference
  ramp: boolean
  rampTo: number
}

const PRESET_BY_POOL_KEY: Record<Exclude<PoolKey, 'custom'>, PresetId> = {
  chromatic: 'all',
  naturals: 'naturals',
  accidentals: 'accidentals',
  C: 'c-major',
  G: 'g-major',
  D: 'd-major',
  A: 'a-major',
  E: 'e-major',
  F: 'f-major',
  Am: 'a-minor-pentatonic',
}

const POOL_LABELS: Record<PoolKey, string> = {
  chromatic: 'all 12',
  naturals: 'naturals',
  accidentals: 'accidentals',
  C: 'C major',
  G: 'G major',
  D: 'D major',
  A: 'A major',
  E: 'E major',
  F: 'F major',
  Am: 'A minor pent.',
  custom: 'custom',
}

const SPELLING_BY_ACC: Record<RoutineAccidental, SpellingPreference> = {
  flats: 'flat',
  sharps: 'sharp',
  mixed: 'mixed',
}

const ACC_BY_SPELLING: Record<SpellingPreference, RoutineAccidental> = {
  flat: 'flats',
  sharp: 'sharps',
  mixed: 'mixed',
}

const POOL_KEY_BY_PRESET = Object.fromEntries(
  Object.entries(PRESET_BY_POOL_KEY).map(([key, presetId]) => [presetId, key as PoolKey]),
) as Partial<Record<PresetId, PoolKey>>

/** The pitch classes a block drills: its explicit pool, else its preset. */
export const blockPool = (block: RoutineBlock): number[] => {
  if (block.pool !== null) {
    return sortedPcs(block.pool)
  }

  const presetId = block.poolKey === 'custom' ? null : PRESET_BY_POOL_KEY[block.poolKey]
  const preset = presetId === null ? undefined : PRESETS.find((entry) => entry.id === presetId)
  return preset?.pcs ? sortedPcs(preset.pcs) : [...PITCH_CLASSES]
}

export const blockPoolLabel = (block: RoutineBlock) => POOL_LABELS[block.poolKey] ?? POOL_LABELS.custom

/** The spelling a block forces, or null when it leaves the choice alone. */
export const blockSpelling = (block: RoutineBlock): SpellingPreference | null =>
  block.acc === null ? null : SPELLING_BY_ACC[block.acc]

const poolKeyForPool = (pool: readonly number[]): PoolKey => POOL_KEY_BY_PRESET[matchPreset(pool)] ?? 'custom'

const titleCase = (label: string) => label.charAt(0).toUpperCase() + label.slice(1)

/** Total seconds; open-ended blocks contribute nothing, so a saved setup is 0. */
export const routineSeconds = (routine: Routine) =>
  routine.blocks.reduce((total, block) => total + (block.dur ?? 0), 0)

export const isOpenEnded = (routine: Routine) => routine.blocks.length === 1 && routine.blocks[0].dur === null

/** m:ss — 72 → '1:12', 720 → '12:00'. */
export const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export const formatMinutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`

/**
 * Where a ramping block ends up, not how fast it gets there — '+2/round' tells
 * the player nothing about the tempo they will finish on.
 */
const rampMeta = (block: RoutineBlock) => (block.ramp ? ` · climbs to ${block.rampTo}` : '')

/** Chip meta — distinguishes the two shapes without a category label. */
export const routineMeta = (routine: Routine) => {
  if (routine.blocks.length === 1) {
    const block = routine.blocks[0]
    const size = blockPool(block).length
    return `${block.bpm} BPM · every ${block.beats} · ${size} ${size === 1 ? 'note' : 'notes'}${rampMeta(block)}`
  }

  return `${routine.blocks.length} blocks · ${formatMinutes(routineSeconds(routine))}`
}

export const blockMeta = (block: RoutineBlock) =>
  `${block.bpm} BPM · every ${block.beats} · ${blockPoolLabel(block)}${rampMeta(block)}`

/**
 * How long one lap of the block's pool takes. BPM alone can't be compared
 * across blocks that also differ in rate or pool size — this can.
 */
export const blockCycleSeconds = (block: RoutineBlock) =>
  cycleSeconds(blockPool(block).length, block.beats, block.bpm)

export const blockFromSettings = (settings: BlockSettings, dur: number | null): RoutineBlock => {
  const poolKey = poolKeyForPool(settings.pool)

  return {
    name: titleCase(POOL_LABELS[poolKey]),
    poolKey,
    pool: poolKey === 'custom' ? sortedPcs(settings.pool) : null,
    bpm: settings.bpm,
    beats: settings.beatsPerNote,
    acc: ACC_BY_SPELLING[settings.spelling],
    ramp: settings.ramp,
    rampTo: clampRampTarget(settings.rampTo, settings.bpm),
    dur,
  }
}

/** Pre-fill for the save field: pool label plus tempo, e.g. 'Naturals @ 60'. */
export const suggestRoutineName = (settings: BlockSettings) =>
  `${titleCase(POOL_LABELS[poolKeyForPool(settings.pool)])} @ ${settings.bpm}`

export const createRoutineId = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/** Flex share for a timeline segment: proportional to duration, floored so a
 * very short block (the 25-second exam) stays wide enough to read. */
export const blockFlex = (block: RoutineBlock) =>
  Math.max(block.dur ?? OPEN_BLOCK_FLEX_SECONDS, MIN_BLOCK_FLEX_SECONDS)

export type RoutineProgress = {
  /** Total routine seconds; 0 when nothing is timed. */
  total: number
  /** Completed blocks plus elapsed in the current one, capped at its duration. */
  elapsed: number
  /** 0..1 across the whole routine; 0 while open-ended, 1 once finished. */
  fraction: number
  /** Seconds left in the current block; null when it is open-ended. */
  remaining: number | null
  block: RoutineBlock | null
}

export const routineProgress = (
  routine: Routine,
  blockIndex: number,
  blockElapsedMs: number,
  finished: boolean,
): RoutineProgress => {
  const total = routineSeconds(routine)
  const block = routine.blocks[blockIndex] ?? null
  const before = routine.blocks.slice(0, blockIndex).reduce((sum, entry) => sum + (entry.dur ?? 0), 0)
  const blockElapsed = Math.max(0, blockElapsedMs / 1000)

  if (finished) {
    return { total, elapsed: total, fraction: 1, remaining: 0, block }
  }

  const timed = block !== null && block.dur !== null
  const elapsed = before + (timed ? Math.min(block.dur!, blockElapsed) : 0)

  return {
    total,
    elapsed,
    fraction: total > 0 ? Math.min(1, elapsed / total) : 0,
    remaining: timed ? Math.max(0, block.dur! - blockElapsed) : null,
    block,
  }
}

/** Per-block fill for the timeline: 1 for done blocks, live for the active one. */
export const blockFill = (
  block: RoutineBlock,
  state: 'done' | 'active' | 'upcoming',
  blockElapsedMs: number,
) => {
  if (state === 'done') return 1
  if (state === 'upcoming' || block.dur === null) return 0
  return Math.min(1, Math.max(0, blockElapsedMs / 1000 / block.dur))
}

const openBlock = (
  name: string,
  poolKey: PoolKey,
  bpm: number,
  beats: BeatsPerNote,
  acc: RoutineAccidental | null,
): RoutineBlock => ({ name, poolKey, pool: null, bpm, beats, acc, ramp: false, rampTo: defaultRampTarget(bpm), dur: null })

const timedBlock = (
  name: string,
  poolKey: PoolKey,
  bpm: number,
  beats: BeatsPerNote,
  minutes: number,
): RoutineBlock => ({
  name,
  poolKey,
  pool: null,
  bpm,
  beats,
  acc: null,
  ramp: false,
  rampTo: defaultRampTarget(bpm),
  dur: minutes * 60,
})

/** A timed block that climbs from `bpm` to `rampTo` and then holds there. */
const rampingBlock = (
  name: string,
  poolKey: PoolKey,
  bpm: number,
  beats: BeatsPerNote,
  minutes: number,
  rampTo: number,
): RoutineBlock => ({ ...timedBlock(name, poolKey, bpm, beats, minutes), ramp: true, rampTo })

/** Seeded on first load so the shelf demonstrates both shapes side by side. */
export const SEEDED_ROUTINES: Routine[] = [
  {
    id: 'seed-warmup-naturals',
    name: 'Warm-up naturals',
    blocks: [openBlock('Naturals', 'naturals', 60, 4, 'flats')],
  },
  {
    id: 'seed-chromatic-drill',
    name: 'Chromatic drill',
    blocks: [openBlock('All 12', 'chromatic', 48, 2, 'mixed')],
  },
  {
    // The exam's pace as an open-ended setup: same pool, rate and tempo as the
    // block that ends Neck fluency, minus the clock — for drilling the pace
    // until the timed lap stops being frightening.
    id: 'seed-exam-pace',
    name: 'Exam pace',
    blocks: [openBlock('All 12', 'chromatic', 115, 4, null)],
  },
  {
    // Twelve beats a note is not a slow lap — it is time to find the called
    // note on every string in turn, two beats a string, before the next call.
    id: 'seed-string-by-string',
    name: 'String by string',
    blocks: [openBlock('All 12', 'chromatic', 60, 12, null)],
  },
  {
    id: 'seed-warmup-6',
    name: 'Warm-up (6 min)',
    blocks: [
      timedBlock('Slow naturals', 'naturals', 60, 4, 2),
      timedBlock('Naturals, quicker', 'naturals', 76, 2, 2),
      timedBlock('All 12', 'chromatic', 76, 4, 2),
    ],
  },
  {
    id: 'seed-neck-fluency-12',
    name: 'Neck fluency (12 min)',
    blocks: [
      timedBlock('Settle in', 'chromatic', 60, 4, 4),
      timedBlock('Accidentals', 'accidentals', 66, 4, 3),
      // Both paced as lap targets, not tempos: all 12 in 0:30, naturals in 0:20.
      timedBlock('All 12, quicker', 'chromatic', 48, 2, 3),
      timedBlock('Naturals sprint', 'naturals', 42, 2, 2),
      // The exam: one lap of all 12 at a pace that deals the whole deck in
      // 25 seconds (12 × 4 beats at 115 ≈ 0:25), in a block exactly that long.
      // Pass/fail is the block itself — name every note before it runs out.
      { ...timedBlock('Exam', 'chromatic', 115, 4, 0), dur: 25 },
    ],
  },
  {
    // Three hand-built rungs at 70/90/110 were a stepped approximation of a
    // ramp — two mechanisms for one intent, free to drift apart. One ramping
    // block is the same exercise stated honestly.
    id: 'seed-speed-ladder-9',
    name: 'Speed ladder (9 min)',
    blocks: [rampingBlock('Climb', 'chromatic', 70, 4, 9, 110)],
  },
]

const isPoolKey = (value: unknown): value is PoolKey => typeof value === 'string' && value in POOL_LABELS

const isAcc = (value: unknown): value is RoutineAccidental =>
  value === 'flats' || value === 'sharps' || value === 'mixed'

const parseBlock = (raw: unknown): RoutineBlock | null => {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const block = raw as Record<string, unknown>
  const bpm = Number(block.bpm)
  const beats = Number(block.beats)
  if (!isPoolKey(block.poolKey) || !Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
    return null
  }

  if (!(BEAT_SPAN_OPTIONS as readonly number[]).includes(beats)) {
    return null
  }

  // A repeated pitch class would be dealt twice per lap and give the note chips
  // two identical keys, so the pool is a set the moment it leaves storage.
  const pool = Array.isArray(block.pool)
    ? [...new Set(block.pool.filter((pc): pc is number => Number.isInteger(pc) && pc >= 0 && pc <= 11))]
    : null
  const dur = block.dur === null || block.dur === undefined ? null : Number(block.dur)
  const roundedBpm = Math.round(bpm)
  // A block written before the ramp existed — or one that ramps without naming
  // a target — gets a ceiling it can actually reach rather than none at all.
  const rampTo = Number(block.rampTo)
  const target = Number.isFinite(rampTo) ? clampRampTarget(rampTo, roundedBpm) : defaultRampTarget(roundedBpm)

  return {
    name: typeof block.name === 'string' && block.name.trim() !== '' ? block.name : 'Block',
    poolKey: block.poolKey,
    pool: pool !== null && pool.length > 0 ? sortedPcs(pool) : null,
    bpm: roundedBpm,
    beats: beats as BeatsPerNote,
    acc: isAcc(block.acc) ? block.acc : null,
    ramp: block.ramp === true,
    rampTo: target,
    dur: dur !== null && Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
  }
}

/**
 * Enforces the shape rule the whole feature rests on: every block in a sequence
 * carries a duration.
 *
 * An untimed block inside a sequence would stall the routine on it forever —
 * nothing with `dur: null` ever auto-advances — so such blocks are dropped
 * rather than handed a duration the user never chose. Dropping can cascade: to
 * one block, or to none (the caller discards the routine), and both are
 * legitimate ends.
 *
 * A lone block is exempt in either direction. Untimed it is a saved setup, and
 * timed it is a single exercise that ends on its own clock — the Speed ladder's
 * nine minutes of climbing is one block, not a stack of rungs.
 */
const normalizeBlocks = (blocks: RoutineBlock[]): RoutineBlock[] => {
  if (blocks.length <= 1) {
    return blocks
  }

  const timed = blocks.filter((block) => block.dur !== null)
  return timed.length === blocks.length ? blocks : normalizeBlocks(timed)
}

/** Returns undefined for anything unusable, so the seeds take over. */
export const parseRoutines = (raw: string): Routine[] | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }

  if (!Array.isArray(parsed)) {
    return undefined
  }

  const routines: Routine[] = []
  // Ids address routines: selection picks the first match while removal deletes
  // every match, so two routines sharing one id is a shelf the user cannot edit
  // one entry of. The first usable claimant keeps the id and the rest go.
  const seenIds = new Set<string>()
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }

    const candidate = entry as Record<string, unknown>
    if (typeof candidate.id !== 'string' || candidate.id.trim() === '' || typeof candidate.name !== 'string') {
      continue
    }

    if (seenIds.has(candidate.id) || !Array.isArray(candidate.blocks)) {
      continue
    }

    const parsedBlocks = candidate.blocks.map(parseBlock).filter((block): block is RoutineBlock => block !== null)
    const blocks = normalizeBlocks(parsedBlocks)
    if (blocks.length > 0) {
      seenIds.add(candidate.id)
      routines.push({ id: candidate.id, name: candidate.name, blocks })
    }
  }

  return routines
}

/** How far one tap of the duration controls moves a block's clock. */
export const BLOCK_STEP_SECONDS = 30

/**
 * Inserts a block built from the current controls at `index`, so a warm-up can
 * be put in front of a workout rather than only behind it. A single open-ended
 * block gains a duration on the way, otherwise the sequence could never advance
 * past it — that one click is what turns a saved setup into a workout.
 */
export const withInsertedBlock = (routine: Routine, index: number, settings: BlockSettings): Routine => {
  const existing =
    routine.blocks.length === 1 && routine.blocks[0].dur === null
      ? [{ ...routine.blocks[0], dur: DEFAULT_BLOCK_SECONDS }]
      : routine.blocks

  const at = Math.max(0, Math.min(existing.length, Math.round(index)))
  const blocks = [...existing]
  blocks.splice(at, 0, blockFromSettings(settings, DEFAULT_BLOCK_SECONDS))

  return { ...routine, blocks }
}

/** Appending is inserting at the end — one arithmetic, so the two cannot drift. */
export const withAppendedBlock = (routine: Routine, settings: BlockSettings): Routine =>
  withInsertedBlock(routine, routine.blocks.length, settings)

/**
 * Swaps a block with the neighbour `delta` away, which is reordering stated as
 * something a button can do. Returns the routine untouched at either end, so a
 * caller can test identity the way it does for a refused removal.
 */
export const withMovedBlock = (routine: Routine, index: number, delta: -1 | 1): Routine => {
  const target = index + delta
  if (!routine.blocks[index] || !routine.blocks[target]) {
    return routine
  }

  const blocks = [...routine.blocks]
  blocks[index] = routine.blocks[target]
  blocks[target] = routine.blocks[index]

  return { ...routine, blocks }
}

/**
 * Retimes one block. No ceiling and no floor beyond the parser's own rule —
 * positive, finite, whole seconds — because a clamp here would disagree with
 * what `parseBlock` already accepts and silently truncate a stored block the
 * first time somebody trimmed thirty seconds off it.
 *
 * `dur: null` is refused for anything but a lone block: an untimed block inside
 * a sequence stalls the routine on it forever, and `normalizeBlocks` would
 * simply delete it. Refusing is the honest answer to a control that can only
 * ever be offered when there is one block to offer it for.
 */
export const withBlockDuration = (routine: Routine, index: number, dur: number | null): Routine => {
  const block = routine.blocks[index]
  if (!block) {
    return routine
  }

  if (dur === null) {
    return block.dur === null || routine.blocks.length > 1 ? routine : { ...routine, blocks: [{ ...block, dur: null }] }
  }

  const rounded = Math.round(dur)
  if (!Number.isFinite(dur) || rounded <= 0 || rounded === block.dur) {
    return routine
  }

  return {
    ...routine,
    blocks: routine.blocks.map((entry, position) => (position === index ? { ...entry, dur: rounded } : entry)),
  }
}

/** Whatever is left keeps its own duration, down to a single timed block. */
export const withRemovedBlock = (routine: Routine, index: number): Routine => {
  const blocks = normalizeBlocks(routine.blocks.filter((_, position) => position !== index))
  if (blocks.length === 0) {
    return routine
  }

  return { ...routine, blocks }
}
