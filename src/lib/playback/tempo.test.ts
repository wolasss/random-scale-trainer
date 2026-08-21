import { describe, expect, it } from 'vitest'
import { createTempoControl, rampCeiling } from './tempo'
import { MAX_BPM, RAMP_BPM_STEP } from '../../constants'

describe('rampCeiling', () => {
  it('holds the requested target when it is inside the app limit', () => {
    expect(rampCeiling(120)).toBe(120)
  })

  it('never climbs above the app limit', () => {
    expect(rampCeiling(MAX_BPM + 40)).toBe(MAX_BPM)
  })
})

describe('tempo control', () => {
  it('seeds both the current and the last-seen tempo on reset', () => {
    const tempo = createTempoControl()
    tempo.reset(90)

    expect(tempo.bpm()).toBe(90)
    // Seeded as last-seen too, so the very first reconcile is a no-op.
    tempo.reconcile(90)
    expect(tempo.bpm()).toBe(90)
  })

  it('reports the beat duration of the tempo it is holding', () => {
    const tempo = createTempoControl()
    tempo.reset(120)

    expect(tempo.beatDuration()).toBeCloseTo(0.5, 9)
  })

  it('ignores an unchanged external value', () => {
    const tempo = createTempoControl()
    tempo.reset(60)
    tempo.applyRamp({ enabled: true, targetBpm: MAX_BPM })

    tempo.reconcile(60) // settings still read the pre-ramp value
    expect(tempo.bpm()).toBe(60 + RAMP_BPM_STEP)
  })

  it('takes an external change as the new authority', () => {
    const tempo = createTempoControl()
    tempo.reset(60)

    tempo.reconcile(100)
    expect(tempo.bpm()).toBe(100)
  })

  it('lets a user change win over a pending ramp write-back', () => {
    const tempo = createTempoControl()
    tempo.reset(60)
    expect(tempo.applyRamp({ enabled: true, targetBpm: MAX_BPM })).toBe(62)

    tempo.reconcile(100) // the slider moved before the ramp's own value landed
    expect(tempo.bpm()).toBe(100)

    // The pending write-back is forgotten: the next ramp climbs from 100.
    expect(tempo.applyRamp({ enabled: true, targetBpm: MAX_BPM })).toBe(102)
  })

  it('does not clobber the tempo when the ramp write-back lands', () => {
    const tempo = createTempoControl()
    tempo.reset(60)
    tempo.applyRamp({ enabled: true, targetBpm: MAX_BPM })

    tempo.reconcile(62) // React committed the ramp's own value
    expect(tempo.bpm()).toBe(62)

    // The write-back was consumed, so the next ramp starts from 62.
    expect(tempo.applyRamp({ enabled: true, targetBpm: MAX_BPM })).toBe(64)
  })

  it('leaves the tempo alone when the ramp is disabled', () => {
    const tempo = createTempoControl()
    tempo.reset(60)

    expect(tempo.applyRamp({ enabled: false, targetBpm: MAX_BPM })).toBeNull()
    expect(tempo.bpm()).toBe(60)
  })

  it('stops writing back once it is sitting on the target', () => {
    const tempo = createTempoControl()
    tempo.reset(60)

    expect(tempo.applyRamp({ enabled: true, targetBpm: 62 })).toBe(62)
    expect(tempo.applyRamp({ enabled: true, targetBpm: 62 })).toBeNull()
    expect(tempo.bpm()).toBe(62)
  })

  it('lands exactly on a target the step would otherwise stride past', () => {
    const tempo = createTempoControl()
    tempo.reset(60)

    expect(tempo.applyRamp({ enabled: true, targetBpm: 61 })).toBe(61)
  })

  it('clamps a target above the app limit to the limit', () => {
    const tempo = createTempoControl()
    tempo.reset(MAX_BPM - 1)

    expect(tempo.applyRamp({ enabled: true, targetBpm: MAX_BPM + 100 })).toBe(MAX_BPM)
    expect(tempo.applyRamp({ enabled: true, targetBpm: MAX_BPM + 100 })).toBeNull()
  })

  it('shortens the beat as the ramp climbs', () => {
    const tempo = createTempoControl()
    tempo.reset(60)
    const before = tempo.beatDuration()

    tempo.applyRamp({ enabled: true, targetBpm: MAX_BPM })

    expect(tempo.beatDuration()).toBeCloseTo(60 / 62, 9)
    expect(tempo.beatDuration()).toBeLessThan(before)
  })
})
