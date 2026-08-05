import { describe, expect, it } from 'vitest'
import { cycleSeconds, formatCycleLength, formatElapsed } from './time'

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

})

describe('cycleSeconds', () => {
  it('multiplies pool size by beat span at the given tempo', () => {
    expect(cycleSeconds(12, 4, 72)).toBe(40)
    expect(cycleSeconds(12, 4, 240)).toBe(12)
    expect(cycleSeconds(12, 4, 30)).toBe(96)
    expect(cycleSeconds(5, 1, 60)).toBe(5)
  })
})

describe('formatCycleLength', () => {
  it('formats compact minutes:seconds', () => {
    expect(formatCycleLength(40)).toBe('00:40')
    expect(formatCycleLength(96)).toBe('01:36')
    expect(formatCycleLength(12)).toBe('00:12')
  })

  it('rounds fractional seconds', () => {
    expect(formatCycleLength(39.6)).toBe('00:40')
    expect(formatCycleLength(60.4)).toBe('01:00')
  })
})
