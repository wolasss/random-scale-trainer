import { describe, expect, it } from 'vitest'
import {
  blockCycleSeconds,
  blockFill,
  blockFlex,
  blockFromSettings,
  blockMeta,
  blockPool,
  blockSpelling,
  formatClock,
  isOpenEnded,
  parseRoutines,
  routineMeta,
  routineProgress,
  routineSeconds,
  SEEDED_ROUTINES,
  suggestRoutineName,
  withAppendedBlock,
  withRemovedBlock,
  type Routine,
  type RoutineBlock,
} from './routines'

const block = (overrides: Partial<RoutineBlock> = {}): RoutineBlock => ({
  name: 'Block',
  poolKey: 'chromatic',
  pool: null,
  bpm: 72,
  beats: 4,
  acc: null,
  dur: 120,
  ...overrides,
})

const routine = (blocks: RoutineBlock[]): Routine => ({ id: 'r', name: 'R', blocks })

describe('blockPool', () => {
  it('resolves every pool key to its preset pitch classes', () => {
    expect(blockPool(block({ poolKey: 'chromatic' }))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(blockPool(block({ poolKey: 'naturals' }))).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(blockPool(block({ poolKey: 'accidentals' }))).toEqual([1, 3, 6, 8, 10])
    expect(blockPool(block({ poolKey: 'G' }))).toEqual([0, 2, 4, 6, 7, 9, 11])
    expect(blockPool(block({ poolKey: 'Am' }))).toEqual([0, 2, 4, 7, 9])
  })

  it('prefers an explicit custom pool and sorts it', () => {
    expect(blockPool(block({ poolKey: 'custom', pool: [9, 0, 4] }))).toEqual([0, 4, 9])
  })
})

describe('blockSpelling', () => {
  it('maps the stored accidental names, and null leaves the choice alone', () => {
    expect(blockSpelling(block({ acc: 'flats' }))).toBe('flat')
    expect(blockSpelling(block({ acc: 'sharps' }))).toBe('sharp')
    expect(blockSpelling(block({ acc: 'mixed' }))).toBe('mixed')
    expect(blockSpelling(block({ acc: null }))).toBeNull()
  })
})

describe('routineMeta', () => {
  it('describes a one-block routine by its settings', () => {
    expect(routineMeta(routine([block({ poolKey: 'naturals', bpm: 60, beats: 4, dur: null })]))).toBe(
      '60 BPM · every 4 · 7 notes',
    )
  })

  it('describes a multi-block routine by its shape', () => {
    expect(routineMeta(routine([block({ dur: 240 }), block({ dur: 180 }), block({ dur: 180 })]))).toBe(
      '3 blocks · 10 min',
    )
  })
})

describe('blockMeta', () => {
  it('reads tempo, rate and pool on one line', () => {
    expect(blockMeta(block({ poolKey: 'accidentals', bpm: 66, beats: 4 }))).toBe('66 BPM · every 4 · accidentals')
  })
})

describe('blockCycleSeconds', () => {
  it('measures one lap of the pool, so blocks stay comparable', () => {
    // 5 accidentals × 4 beats at 66 BPM ≈ 18s.
    expect(blockCycleSeconds(block({ poolKey: 'accidentals', bpm: 66, beats: 4 }))).toBeCloseTo(18.18)

    // A faster tempo with a slower rate over a bigger pool is the longer lap —
    // exactly the comparison BPM on its own cannot make.
    expect(blockCycleSeconds(block({ poolKey: 'chromatic', bpm: 80, beats: 2 }))).toBeCloseTo(18)
    expect(blockCycleSeconds(block({ poolKey: 'chromatic', bpm: 60, beats: 4 }))).toBeCloseTo(48)
  })
})

describe('formatClock', () => {
  it('renders m:ss', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(72)).toBe('1:12')
    expect(formatClock(720)).toBe('12:00')
  })

  it('never renders a negative overshoot', () => {
    expect(formatClock(-4)).toBe('0:00')
  })
})

describe('routineProgress', () => {
  const workout = routine([block({ dur: 120 }), block({ dur: 120 }), block({ dur: 120 })])

  it('counts completed blocks plus elapsed in the current one', () => {
    const progress = routineProgress(workout, 1, 60_000, false)

    expect(progress.total).toBe(360)
    expect(progress.elapsed).toBe(180)
    expect(progress.fraction).toBeCloseTo(0.5)
    expect(progress.remaining).toBe(60)
  })

  it('reports a full bar once finished', () => {
    expect(routineProgress(workout, 2, 0, true)).toMatchObject({ fraction: 1, elapsed: 360 })
  })

  it('leaves an open-ended block with an empty bar and no countdown', () => {
    const setup = routine([block({ dur: null })])
    const progress = routineProgress(setup, 0, 99_000, false)

    expect(progress.total).toBe(0)
    expect(progress.fraction).toBe(0)
    expect(progress.remaining).toBeNull()
  })

  it('caps what the current block contributes at its own duration', () => {
    // A late tick must never push the bar past the blocks that follow.
    expect(routineProgress(workout, 0, 999_000, false).elapsed).toBe(120)
  })
})

describe('blockFill', () => {
  it('fills done blocks, tracks the active one, and leaves upcoming empty', () => {
    expect(blockFill(block({ dur: 120 }), 'done', 0)).toBe(1)
    expect(blockFill(block({ dur: 120 }), 'active', 30_000)).toBeCloseTo(0.25)
    expect(blockFill(block({ dur: 120 }), 'upcoming', 30_000)).toBe(0)
    expect(blockFill(block({ dur: null }), 'active', 30_000)).toBe(0)
  })
})

describe('blockFlex', () => {
  it('sizes segments by duration, with a fallback for open-ended blocks', () => {
    expect(blockFlex(block({ dur: 240 }))).toBe(240)
    expect(blockFlex(block({ dur: null }))).toBe(240)
  })
})

describe('blockFromSettings', () => {
  it('names the block from the matched preset and stores no explicit pool', () => {
    const built = blockFromSettings({ bpm: 60, beatsPerNote: 4, pool: [0, 2, 4, 5, 7, 9, 11], spelling: 'flat' }, null)

    expect(built).toEqual({
      name: 'Naturals',
      poolKey: 'naturals',
      pool: null,
      bpm: 60,
      beats: 4,
      acc: 'flats',
      dur: null,
    })
  })

  it('keeps a custom chip selection as an explicit pool', () => {
    const built = blockFromSettings({ bpm: 90, beatsPerNote: 2, pool: [3, 0], spelling: 'mixed' }, 120)

    expect(built.poolKey).toBe('custom')
    expect(built.pool).toEqual([0, 3])
  })
})

describe('suggestRoutineName', () => {
  it('pairs the pool label with the tempo', () => {
    expect(suggestRoutineName({ bpm: 60, beatsPerNote: 4, pool: [0, 2, 4, 5, 7, 9, 11], spelling: 'flat' })).toBe(
      'Naturals @ 60',
    )
  })
})

describe('withAppendedBlock', () => {
  const settings = { bpm: 90, beatsPerNote: 2 as const, pool: [1, 3, 6, 8, 10], spelling: 'sharp' as const }

  it('times the lone open block on the way, or it could never be passed', () => {
    const grown = withAppendedBlock(routine([block({ dur: null })]), settings)

    expect(grown.blocks).toHaveLength(2)
    expect(grown.blocks[0].dur).toBe(120)
    expect(grown.blocks[1]).toMatchObject({ name: 'Accidentals', bpm: 90, beats: 2, dur: 120 })
  })

  it('leaves the existing blocks of a workout alone', () => {
    const grown = withAppendedBlock(routine([block({ dur: 240 }), block({ dur: 180 })]), settings)

    expect(grown.blocks.map((entry) => entry.dur)).toEqual([240, 180, 120])
  })
})

describe('withRemovedBlock', () => {
  it('turns a workout back into a saved setup at one block', () => {
    const shrunk = withRemovedBlock(routine([block({ dur: 120 }), block({ dur: 240 })]), 0)

    expect(shrunk.blocks).toHaveLength(1)
    expect(shrunk.blocks[0].dur).toBeNull()
    expect(isOpenEnded(shrunk)).toBe(true)
  })

  it('refuses to empty a routine', () => {
    const only = routine([block({ dur: null })])
    expect(withRemovedBlock(only, 0)).toBe(only)
  })
})

describe('SEEDED_ROUTINES', () => {
  it('ships both shapes: saved setups and timed workouts', () => {
    const setups = SEEDED_ROUTINES.filter(isOpenEnded)
    const workouts = SEEDED_ROUTINES.filter((entry) => entry.blocks.length > 1)

    expect(setups.map((entry) => entry.name)).toEqual(['Warm-up naturals', 'Chromatic drill', 'A minor box'])
    expect(workouts.map((entry) => routineSeconds(entry) / 60)).toEqual([6, 12, 9, 8])
  })

  it('gives every routine a unique id', () => {
    expect(new Set(SEEDED_ROUTINES.map((entry) => entry.id)).size).toBe(SEEDED_ROUTINES.length)
  })
})

describe('parseRoutines', () => {
  it('round-trips the seeds', () => {
    expect(parseRoutines(JSON.stringify(SEEDED_ROUTINES))).toEqual(SEEDED_ROUTINES)
  })

  it('rejects anything that is not an array of routines', () => {
    expect(parseRoutines('not json')).toBeUndefined()
    expect(parseRoutines('{"id":"x"}')).toBeUndefined()
  })

  it('drops unusable blocks and routines, keeping the rest', () => {
    const stored = JSON.stringify([
      { id: 'a', name: 'Good', blocks: [{ poolKey: 'naturals', bpm: 60, beats: 4, dur: 120 }, { bpm: 'nope' }] },
      { id: 'b', name: 'Empty', blocks: [{ poolKey: 'nonsense', bpm: 60, beats: 4 }] },
      { name: 'No id', blocks: [] },
    ])

    const parsed = parseRoutines(stored)
    expect(parsed).toHaveLength(1)
    expect(parsed![0].id).toBe('a')
    // Down to one block, so it is a saved setup and can carry no duration.
    expect(parsed![0].blocks[0].dur).toBeNull()
  })

  it('clears the duration of a stored lone block', () => {
    const stored = JSON.stringify([{ id: 'a', name: 'A', blocks: [{ poolKey: 'chromatic', bpm: 60, beats: 4, dur: 90 }] }])
    expect(parseRoutines(stored)![0].blocks[0].dur).toBeNull()
  })

  /**
   * An untimed block inside a sequence would stall the routine on it forever,
   * so the parser must not let one through — it is the trust boundary for
   * hand-edited storage and version skew.
   */
  describe('an untimed block inside a timed sequence', () => {
    const workoutWith = (...durs: unknown[]) =>
      JSON.stringify([
        {
          id: 'a',
          name: 'Workout',
          blocks: durs.map((dur, index) => ({
            name: `B${index}`,
            poolKey: 'chromatic',
            bpm: 60 + index,
            beats: 4,
            dur,
          })),
        },
      ])

    it.each([
      ['missing', undefined],
      ['null', null],
      ['zero', 0],
      ['negative', -30],
      ['non-numeric', 'soon'],
    ])('drops the block whose duration is %s', (_label, dur) => {
      const parsed = parseRoutines(workoutWith(120, dur, 180))!

      expect(parsed[0].blocks.map((block) => block.dur)).toEqual([120, 180])
      // The surviving blocks keep their own settings, not a fabricated duration.
      expect(parsed[0].blocks.map((block) => block.bpm)).toEqual([60, 62])
    })

    it('collapses to a saved setup when only one timed block survives', () => {
      const parsed = parseRoutines(workoutWith(120, 0, 0))!

      expect(parsed[0].blocks).toHaveLength(1)
      expect(parsed[0].blocks[0].dur).toBeNull()
      expect(isOpenEnded(parsed[0])).toBe(true)
    })

    it('discards a routine whose blocks are all untimed rather than inventing durations', () => {
      expect(parseRoutines(workoutWith(0, null, -1))).toEqual([])
    })

    it('leaves a well-formed workout untouched', () => {
      const parsed = parseRoutines(workoutWith(120, 180, 240))!
      expect(parsed[0].blocks.map((block) => block.dur)).toEqual([120, 180, 240])
    })
  })
})
