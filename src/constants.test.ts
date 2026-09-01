// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clampBpm, clampRampTarget, defaultRampTarget, MAX_BPM, MIN_BPM, rampRounds } from './constants'

describe('clampBpm', () => {
  it('rounds to whole beats', () => {
    expect(clampBpm(72.4)).toBe(72)
    expect(clampBpm(72.5)).toBe(73)
  })

  it('leaves an in-range tempo alone', () => {
    expect(clampBpm(120)).toBe(120)
  })

  it('holds the floor', () => {
    expect(clampBpm(10)).toBe(MIN_BPM)
    // Rounding happens before the clamp, so a hair under the floor still lands on it.
    expect(clampBpm(29.6)).toBe(MIN_BPM)
  })

  it('holds the ceiling', () => {
    expect(clampBpm(500)).toBe(MAX_BPM)
  })
})

describe('clampRampTarget', () => {
  it('lifts a target at or below the tempo to one ramp step above it', () => {
    expect(clampRampTarget(80, 120)).toBe(122)
    expect(clampRampTarget(120, 120)).toBe(122)
  })

  it('keeps a target above that floor, rounded', () => {
    expect(clampRampTarget(150.6, 100)).toBe(151)
  })

  it('caps a target above the range', () => {
    expect(clampRampTarget(300, 100)).toBe(MAX_BPM)
  })

  it('collapses the floor onto the ceiling at the top of the range', () => {
    expect(clampRampTarget(100, MAX_BPM)).toBe(MAX_BPM)
    expect(clampRampTarget(300, MAX_BPM)).toBe(MAX_BPM)
    // One step above 239 is 241, which is itself capped — nothing escapes the range.
    expect(clampRampTarget(239, 239)).toBe(MAX_BPM)
  })
})

describe('defaultRampTarget', () => {
  it('lands the offset above a mid-range tempo', () => {
    expect(defaultRampTarget(72)).toBe(112)
  })

  it('caps rather than overshooting near the top of the range', () => {
    expect(defaultRampTarget(220)).toBe(MAX_BPM)
    expect(defaultRampTarget(MAX_BPM)).toBe(MAX_BPM)
  })
})

describe('rampRounds', () => {
  it('counts the rounds still to come, rounding up', () => {
    expect(rampRounds(100, 110)).toBe(5)
    expect(rampRounds(100, 105)).toBe(3)
  })

  it('is zero once the target is reached', () => {
    expect(rampRounds(120, 120)).toBe(0)
  })

  it('is zero, not negative, once the tempo is past the target', () => {
    expect(rampRounds(130, 120)).toBe(0)
  })
})
