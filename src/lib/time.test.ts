import { describe, expect, it } from 'vitest'
import { formatElapsed } from './time'

describe('formatElapsed', () => {
  it('formats zero', () => {
    expect(formatElapsed(0)).toBe('00:00')
  })

  it('floors sub-second remainders', () => {
    expect(formatElapsed(999)).toBe('00:00')
    expect(formatElapsed(1_000)).toBe('00:01')
  })

  it('rolls over at the minute boundary', () => {
    expect(formatElapsed(59_999)).toBe('00:59')
    expect(formatElapsed(60_000)).toBe('01:00')
  })

  it('pads minutes and seconds to two digits', () => {
    expect(formatElapsed(9 * 60_000 + 5_000)).toBe('09:05')
  })

  it('keeps counting minutes past one hour', () => {
    expect(formatElapsed(3_600_000)).toBe('60:00')
    expect(formatElapsed(3_660_000 + 1_000)).toBe('61:01')
  })

  it('formats the 12-note cycle time across the BPM range', () => {
    expect(formatElapsed((12 * 60_000) / 10)).toBe('01:12')
    expect(formatElapsed((12 * 60_000) / 30)).toBe('00:24')
    expect(formatElapsed((12 * 60_000) / 100)).toBe('00:07')
  })
})
