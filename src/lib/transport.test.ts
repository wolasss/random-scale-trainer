import { describe, expect, it } from 'vitest'
import { transportLabel } from './transport'

describe('transportLabel', () => {
  it('offers a pause while playing, whatever else is true', () => {
    expect(transportLabel(true, false, null, false)).toBe('Pause')
    expect(transportLabel(true, true, 'Fifths', true)).toBe('Pause')
  })

  it('offers a restart once the routine has finished, even when paused', () => {
    expect(transportLabel(false, false, 'Fifths', true)).toBe('Restart routine')
    expect(transportLabel(false, true, 'Fifths', true)).toBe('Restart routine')
  })

  it('resumes a paused transport', () => {
    expect(transportLabel(false, true, null, false)).toBe('Resume')
    expect(transportLabel(false, true, 'Fifths', false)).toBe('Resume')
  })

  it('names the selected routine when idle', () => {
    expect(transportLabel(false, false, 'Fifths', false)).toBe('Start Fifths')
  })

  it('falls back to a generic start with no routine selected', () => {
    expect(transportLabel(false, false, null, false)).toBe('Start practice')
    expect(transportLabel(false, false, undefined, undefined)).toBe('Start practice')
    expect(transportLabel(false, false, '', false)).toBe('Start practice')
  })
})
