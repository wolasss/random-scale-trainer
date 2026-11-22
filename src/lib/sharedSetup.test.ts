// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BEAT_SPAN_OPTIONS, MAX_BPM, MIN_BPM } from '../constants'
import { encodeSharedSetup, parseSharedSetup, type SharedSetup } from './sharedSetup'

const setup: SharedSetup = { pool: [0, 4, 7], bpm: 90, beatsPerNote: 2 }
const query = 'pool=0,4,7&bpm=90&beats=2'

describe('shared setups', () => {
  it('round trips only the three public fields', () => {
    const settings = { ...setup, nickname: 'private', token: 'synthetic', log: [123] }
    const encoded = encodeSharedSetup(settings)
    expect(encoded).toBe('pool=0%2C4%2C7&bpm=90&beats=2')
    expect([...new URLSearchParams(encoded).keys()]).toEqual(['pool', 'bpm', 'beats'])
    expect(parseSharedSetup(encoded)).toEqual(setup)
    expect(parseSharedSetup(`?${query}&unrelated=keep`)).toEqual(setup)
  })

  it('sorts without changing the input pool', () => {
    const pool = [7, 0, 4]
    expect(parseSharedSetup(encodeSharedSetup({ ...setup, pool }))?.pool).toEqual([0, 4, 7])
    expect(pool).toEqual([7, 0, 4])
  })

  it.each(BEAT_SPAN_OPTIONS)('accepts beat span %i and both BPM bounds', (beatsPerNote) => {
    for (const bpm of [MIN_BPM, MAX_BPM]) {
      expect(parseSharedSetup(encodeSharedSetup({ ...setup, bpm, beatsPerNote }))).toEqual({ ...setup, bpm, beatsPerNote })
    }
  })

  it.each(['', ' ', '0,,4', ',0', '0,', '0, 4', '-1', '+1', '12', '1.5', 'NaN', 'C', '1e0', '0,0', '1,01', 'Infinity'])('rejects invalid pool %j', (pool) => {
    expect(parseSharedSetup(new URLSearchParams({ pool, bpm: '90', beats: '2' }).toString())).toBeNull()
  })

  it.each(['', ' ', '29', '241', '90.5', 'fast', 'NaN', 'Infinity', '-Infinity'])('rejects invalid BPM %j', (bpm) => {
    expect(parseSharedSetup(new URLSearchParams({ pool: '0,4,7', bpm, beats: '2' }).toString())).toBeNull()
  })

  it.each(['', ' ', '0', '3', '2.5', 'NaN', 'Infinity', 'two'])('rejects invalid beats %j', (beats) => {
    expect(parseSharedSetup(new URLSearchParams({ pool: '0,4,7', bpm: '90', beats }).toString())).toBeNull()
  })

  it.each(['pool', 'bpm', 'beats'])('requires exactly one %s', (key) => {
    const params = new URLSearchParams(query)
    params.append(key, params.get(key)!)
    expect(parseSharedSetup(params.toString())).toBeNull()
    params.delete(key)
    expect(parseSharedSetup(params.toString())).toBeNull()
  })

  it.each(['challenge', 'challenge=', 'challenge=band', 'challenge=%21%21%21'])('ignores setups with %s', (challenge) => {
    expect(parseSharedSetup(`${query}&${challenge}`)).toBeNull()
  })
})
