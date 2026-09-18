import { afterEach, describe, expect, it } from 'vitest'
import { withBlockedStorage } from '../test/blockedStorage'
import {
  EMPTY_STRING_SPEED,
  hasStringSpeed,
  parseStringSpeed,
  parseStringSpeedKey,
  readStringSpeed,
  recordEarlyAdvance,
  stringSpeedKey,
  writeStringSpeed,
  type StringSpeedLog,
} from './stringSpeed'

afterEach(() => {
  window.localStorage.clear()
})

describe('stringSpeedKey', () => {
  it('joins the tuning and the open-string MIDI note', () => {
    expect(stringSpeedKey('standard', 40)).toBe('standard:40')
    expect(stringSpeedKey('dropD', 38)).toBe('dropD:38')
  })
})

describe('parseStringSpeedKey', () => {
  it('is the inverse of stringSpeedKey for every tuning', () => {
    for (const tuningId of ['standard', 'eflat', 'dropD', 'dadgad', 'openG'] as const) {
      expect(parseStringSpeedKey(stringSpeedKey(tuningId, 40))).toEqual({ tuningId, midi: 40 })
    }
  })

  it('rejects a key stringSpeedKey would not have built', () => {
    expect(parseStringSpeedKey('not-a-tuning:40')).toBeNull()
    expect(parseStringSpeedKey('standard:0')).toBeNull()
    expect(parseStringSpeedKey('standard:-1')).toBeNull()
    expect(parseStringSpeedKey('standard:1.5')).toBeNull()
    expect(parseStringSpeedKey('standard')).toBeNull()
  })
})

describe('recordEarlyAdvance', () => {
  it('starts a fresh entry at count 1, best and last both the first reading', () => {
    const log = recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 900)
    expect(log).toEqual({ 'standard:40': { count: 1, bestMs: 900, lastMs: 900 } })
  })

  it('keeps the lower of the two as best, but always moves last', () => {
    let log = recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 900)
    log = recordEarlyAdvance(log, 'standard:40', 1200)
    expect(log['standard:40']).toEqual({ count: 2, bestMs: 900, lastMs: 1200 })

    log = recordEarlyAdvance(log, 'standard:40', 400)
    expect(log['standard:40']).toEqual({ count: 3, bestMs: 400, lastMs: 400 })
  })

  it('keeps other strings apart', () => {
    let log = recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 900)
    log = recordEarlyAdvance(log, 'standard:45', 500)
    expect(Object.keys(log).sort()).toEqual(['standard:40', 'standard:45'])
  })

  it('does not mutate the log it was given', () => {
    const before: StringSpeedLog = { 'standard:40': { count: 1, bestMs: 900, lastMs: 900 } }
    const after = recordEarlyAdvance(before, 'standard:40', 400)
    expect(before['standard:40']).toEqual({ count: 1, bestMs: 900, lastMs: 900 })
    expect(after).not.toBe(before)
  })

  it('ignores a non-positive or non-finite reading', () => {
    expect(recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 0)).toBe(EMPTY_STRING_SPEED)
    expect(recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', -5)).toBe(EMPTY_STRING_SPEED)
    expect(recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', Number.NaN)).toBe(EMPTY_STRING_SPEED)
    expect(recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', Number.POSITIVE_INFINITY)).toBe(EMPTY_STRING_SPEED)
  })
})

describe('hasStringSpeed', () => {
  it('is false for an empty log and true once anything is recorded', () => {
    expect(hasStringSpeed(EMPTY_STRING_SPEED)).toBe(false)
    expect(hasStringSpeed(recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 900))).toBe(true)
  })
})

describe('parseStringSpeed', () => {
  it('reads back a value it wrote', () => {
    let log = recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 900)
    log = recordEarlyAdvance(log, 'dropD:38', 1500)
    expect(parseStringSpeed(JSON.stringify(log))).toEqual(log)
  })

  it('reads unparseable JSON as no record', () => {
    expect(parseStringSpeed('not json')).toEqual(EMPTY_STRING_SPEED)
  })

  it('reads a non-object, an array, or null as no record', () => {
    expect(parseStringSpeed('42')).toEqual(EMPTY_STRING_SPEED)
    expect(parseStringSpeed('[]')).toEqual(EMPTY_STRING_SPEED)
    expect(parseStringSpeed('null')).toEqual(EMPTY_STRING_SPEED)
  })

  it('drops a key that is not a real tuning and MIDI pair, keeping the rest', () => {
    const raw = JSON.stringify({
      'standard:40': { count: 1, bestMs: 900, lastMs: 900 },
      'not-a-tuning:40': { count: 1, bestMs: 900, lastMs: 900 },
      'standard:0': { count: 1, bestMs: 900, lastMs: 900 },
      'standard:-1': { count: 1, bestMs: 900, lastMs: 900 },
      standard: { count: 1, bestMs: 900, lastMs: 900 },
    })

    expect(parseStringSpeed(raw)).toEqual({ 'standard:40': { count: 1, bestMs: 900, lastMs: 900 } })
  })

  it('drops an entry with a bad count, keeping the rest', () => {
    const raw = JSON.stringify({
      'standard:40': { count: 1, bestMs: 900, lastMs: 900 },
      'standard:45': { count: 0, bestMs: 900, lastMs: 900 },
      'standard:50': { count: 1.5, bestMs: 900, lastMs: 900 },
      'standard:55': { count: -1, bestMs: 900, lastMs: 900 },
    })

    expect(parseStringSpeed(raw)).toEqual({ 'standard:40': { count: 1, bestMs: 900, lastMs: 900 } })
  })

  it('drops an entry whose times are not positive and finite', () => {
    const raw = JSON.stringify({
      'standard:40': { count: 1, bestMs: 900, lastMs: 900 },
      'standard:45': { count: 1, bestMs: 0, lastMs: 900 },
      'standard:50': { count: 1, bestMs: 900, lastMs: 0 },
      'standard:55': { count: 1, bestMs: Number.NaN, lastMs: 900 },
    })

    expect(parseStringSpeed(raw)).toEqual({ 'standard:40': { count: 1, bestMs: 900, lastMs: 900 } })
  })

  it('drops an entry whose best reads higher than its last', () => {
    const raw = JSON.stringify({
      'standard:40': { count: 1, bestMs: 900, lastMs: 900 },
      'standard:45': { count: 2, bestMs: 1500, lastMs: 900 },
    })

    expect(parseStringSpeed(raw)).toEqual({ 'standard:40': { count: 1, bestMs: 900, lastMs: 900 } })
  })

  it('drops an entry that is missing or not an object', () => {
    const raw = JSON.stringify({
      'standard:40': { count: 1, bestMs: 900, lastMs: 900 },
      'standard:45': null,
      'standard:50': 'soon',
      'standard:55': [1, 2, 3],
    })

    expect(parseStringSpeed(raw)).toEqual({ 'standard:40': { count: 1, bestMs: 900, lastMs: 900 } })
  })
})

describe('readStringSpeed / writeStringSpeed', () => {
  it('round-trips through localStorage', () => {
    const log = recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 900)
    expect(writeStringSpeed(log)).toBe(true)
    expect(readStringSpeed()).toEqual(log)
  })

  it('reads an absent key as no record', () => {
    expect(readStringSpeed()).toEqual(EMPTY_STRING_SPEED)
  })

  it('reports a blocked store rather than throwing', () => {
    const restore = withBlockedStorage()
    try {
      expect(writeStringSpeed(recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 900))).toBe(false)
      expect(readStringSpeed()).toEqual(EMPTY_STRING_SPEED)
    } finally {
      restore()
    }
  })
})
