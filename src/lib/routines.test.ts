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
  ramp: false,
  rampTo: 112,
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

  it('names where a ramping block ends up', () => {
    expect(routineMeta(routine([block({ poolKey: 'naturals', bpm: 70, ramp: true, rampTo: 110 })]))).toBe(
      '70 BPM · every 4 · 7 notes · climbs to 110',
    )
  })
})

describe('blockMeta', () => {
  it('reads tempo, rate and pool on one line', () => {
    expect(blockMeta(block({ poolKey: 'accidentals', bpm: 66, beats: 4 }))).toBe('66 BPM · every 4 · accidentals')
  })

  /** The destination, not the increment — '+2/round' says nothing about where. */
  it('adds the destination when the block ramps, and nothing when it does not', () => {
    expect(blockMeta(block({ poolKey: 'chromatic', bpm: 70, ramp: true, rampTo: 110 }))).toBe(
      '70 BPM · every 4 · all 12 · climbs to 110',
    )
    expect(blockMeta(block({ poolKey: 'chromatic', bpm: 70, ramp: false, rampTo: 110 }))).toBe(
      '70 BPM · every 4 · all 12',
    )
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

  it('floors very short blocks so their segment stays readable', () => {
    expect(blockFlex(block({ dur: 25 }))).toBe(90)
    expect(blockFlex(block({ dur: 90 }))).toBe(90)
  })
})

describe('blockFromSettings', () => {
  it('names the block from the matched preset and stores no explicit pool', () => {
    const built = blockFromSettings(
      { bpm: 60, beatsPerNote: 4, pool: [0, 2, 4, 5, 7, 9, 11], spelling: 'flat', ramp: false, rampTo: 100 },
      null,
    )

    expect(built).toEqual({
      name: 'Naturals',
      poolKey: 'naturals',
      pool: null,
      bpm: 60,
      beats: 4,
      acc: 'flats',
      ramp: false,
      rampTo: 100,
      dur: null,
    })
  })

  it('keeps a custom chip selection as an explicit pool', () => {
    const built = blockFromSettings(
      { bpm: 90, beatsPerNote: 2, pool: [3, 0], spelling: 'mixed', ramp: false, rampTo: 130 },
      120,
    )

    expect(built.poolKey).toBe('custom')
    expect(built.pool).toEqual([0, 3])
  })

  /** Saving is the only way a hand-tuned ramp becomes a routine — it must stick. */
  it('captures the live ramp and its ceiling', () => {
    const built = blockFromSettings(
      { bpm: 70, beatsPerNote: 4, pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], spelling: 'mixed', ramp: true, rampTo: 110 },
      null,
    )

    expect(built).toMatchObject({ ramp: true, rampTo: 110 })
  })

  it('floors a captured ceiling that sits at or below the tempo', () => {
    const built = blockFromSettings(
      { bpm: 120, beatsPerNote: 4, pool: [0, 2, 4], spelling: 'mixed', ramp: true, rampTo: 90 },
      null,
    )

    expect(built.rampTo).toBe(122)
  })
})

describe('suggestRoutineName', () => {
  it('pairs the pool label with the tempo', () => {
    expect(
      suggestRoutineName({
        bpm: 60,
        beatsPerNote: 4,
        pool: [0, 2, 4, 5, 7, 9, 11],
        spelling: 'flat',
        ramp: false,
        rampTo: 100,
      }),
    ).toBe('Naturals @ 60')
  })
})

describe('withAppendedBlock', () => {
  const settings = {
    bpm: 90,
    beatsPerNote: 2 as const,
    pool: [1, 3, 6, 8, 10],
    spelling: 'sharp' as const,
    ramp: false,
    rampTo: 130,
  }

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
  it('leaves the surviving block on its own clock rather than untiming it', () => {
    const shrunk = withRemovedBlock(routine([block({ dur: 120 }), block({ dur: 240 })]), 0)

    expect(shrunk.blocks).toHaveLength(1)
    expect(shrunk.blocks[0].dur).toBe(240)
    expect(isOpenEnded(shrunk)).toBe(false)
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

    expect(setups.map((entry) => entry.name)).toEqual([
      'Warm-up naturals',
      'Chromatic drill',
      'Exam pace',
      'String by string',
    ])
    // Neck fluency runs 25 seconds past its named 12 minutes — the exam lap.
    expect(workouts.map((entry) => routineSeconds(entry))).toEqual([360, 745])
  })

  /**
   * The exam is a pace stated as a deadline: all 12 notes, 25 seconds, and the
   * block is exactly one lap long — pass is naming every note before it ends.
   */
  it('ends neck fluency on a 25-second exam over all 12 notes', () => {
    const fluency = SEEDED_ROUTINES.find((entry) => entry.id === 'seed-neck-fluency-12')!
    const exam = fluency.blocks[fluency.blocks.length - 1]

    expect(exam).toMatchObject({ name: 'Exam', poolKey: 'chromatic', dur: 25 })
    // One lap of the block's own pool takes the whole block, within rounding.
    expect(Math.round(blockCycleSeconds(exam))).toBe(25)
  })

  /**
   * The ladder used to be three hand-built rungs — a stepped imitation of the
   * ramp, free to drift from it. It is now the feature's own demonstration.
   */
  it('states the speed ladder as one ramping block rather than stacked rungs', () => {
    const ladder = SEEDED_ROUTINES.find((entry) => entry.id === 'seed-speed-ladder-9')!

    expect(ladder.blocks).toHaveLength(1)
    expect(ladder.blocks[0]).toMatchObject({ poolKey: 'chromatic', bpm: 70, ramp: true, rampTo: 110, dur: 540 })
    expect(routineMeta(ladder)).toContain('climbs to 110')
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
    // The block that survived keeps the duration it was stored with.
    expect(parsed![0].blocks[0].dur).toBe(120)
  })

  /**
   * Ids address routines — selection takes the first match, removal takes every
   * match — so a shelf holding two of one id has entries the user cannot reach.
   */
  it('keeps the first usable claimant of an id and drops the rest', () => {
    const stored = JSON.stringify([
      { id: 'a', name: 'First', blocks: [{ poolKey: 'naturals', bpm: 60, beats: 4 }] },
      { id: 'a', name: 'Second', blocks: [{ poolKey: 'chromatic', bpm: 90, beats: 2 }] },
      { id: 'b', name: 'Other', blocks: [{ poolKey: 'chromatic', bpm: 72, beats: 4 }] },
    ])

    expect(parseRoutines(stored)!.map((entry) => entry.name)).toEqual(['First', 'Other'])
  })

  /** A discarded entry never held the id, so a later one is still free to. */
  it('leaves an id free when the entry holding it has no usable blocks', () => {
    const stored = JSON.stringify([
      { id: 'a', name: 'Empty', blocks: [{ poolKey: 'nonsense', bpm: 60, beats: 4 }] },
      { id: 'a', name: 'Usable', blocks: [{ poolKey: 'naturals', bpm: 60, beats: 4 }] },
    ])

    expect(parseRoutines(stored)!.map((entry) => entry.name)).toEqual(['Usable'])
  })

  it('drops a routine whose id is blank, since nothing can address it', () => {
    const stored = JSON.stringify([
      { id: '', name: 'Nameless', blocks: [{ poolKey: 'naturals', bpm: 60, beats: 4 }] },
      { id: '   ', name: 'Spaces', blocks: [{ poolKey: 'naturals', bpm: 60, beats: 4 }] },
    ])

    expect(parseRoutines(stored)).toEqual([])
  })

  /** A repeat would be dealt twice a lap and give two chips the same key. */
  it('reduces a stored pool to one of each pitch class', () => {
    const stored = JSON.stringify([
      { id: 'a', name: 'A', blocks: [{ poolKey: 'custom', pool: [0, 0, 2, 12, 2], bpm: 60, beats: 4 }] },
    ])

    expect(parseRoutines(stored)![0].blocks[0].pool).toEqual([0, 2])
  })

  it('keeps the duration of a stored lone block', () => {
    const stored = JSON.stringify([{ id: 'a', name: 'A', blocks: [{ poolKey: 'chromatic', bpm: 60, beats: 4, dur: 90 }] }])
    expect(parseRoutines(stored)![0].blocks[0].dur).toBe(90)
  })

  /** Storage predates the ramp, so absence has to mean "off", never "unknown". */
  it('reads a block written before the ramp as one that does not climb', () => {
    const stored = JSON.stringify([{ id: 'a', name: 'A', blocks: [{ poolKey: 'chromatic', bpm: 60, beats: 4 }] }])
    expect(parseRoutines(stored)![0].blocks[0]).toMatchObject({ ramp: false, rampTo: 100 })
  })

  it('gives a block that ramps without a usable target a reachable one', () => {
    const stored = JSON.stringify([
      { id: 'a', name: 'A', blocks: [{ poolKey: 'chromatic', bpm: 80, beats: 4, ramp: true, rampTo: 'fast' }] },
    ])
    expect(parseRoutines(stored)![0].blocks[0]).toMatchObject({ ramp: true, rampTo: 120 })
  })

  it('floors a stored target that sits below its own tempo', () => {
    const stored = JSON.stringify([
      { id: 'a', name: 'A', blocks: [{ poolKey: 'chromatic', bpm: 100, beats: 4, ramp: true, rampTo: 60 }] },
    ])
    expect(parseRoutines(stored)![0].blocks[0].rampTo).toBe(102)
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

    it('collapses to the one timed block that survives, clock intact', () => {
      const parsed = parseRoutines(workoutWith(120, 0, 0))!

      expect(parsed[0].blocks).toHaveLength(1)
      expect(parsed[0].blocks[0].dur).toBe(120)
      expect(isOpenEnded(parsed[0])).toBe(false)
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
