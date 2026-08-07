import { describe, expect, it } from 'vitest'
import { createTapTempo, TAP_RESET_MS } from './tapTempo'

const tapperAt = (times: number[], bounds = { minBpm: 30, maxBpm: 240 }) => {
  let index = 0
  return createTapTempo({ now: () => times[index++], ...bounds })
}

describe('createTapTempo', () => {
  it('returns null until there are two taps', () => {
    const tapper = tapperAt([0, 500])

    expect(tapper.tap()).toBeNull()
    expect(tapper.tap()).toBe(120)
  })

  it('averages the intervals of the last 4 taps', () => {
    // Intervals 600, 600, 500, 500 → the 5th tap averages all four → 550ms → 109 BPM.
    const tapper = tapperAt([0, 600, 1200, 1700, 2200])

    tapper.tap()
    tapper.tap()
    tapper.tap()
    tapper.tap()
    expect(tapper.tap()).toBe(109)
  })

  it('slides the window so old taps stop counting', () => {
    // A slow 1000ms first interval followed by steady 500ms taps.
    const tapper = tapperAt([0, 1000, 1500, 2000, 2500, 3000])

    for (let i = 0; i < 4; i++) {
      tapper.tap()
    }
    expect(tapper.tap()).toBe(96) // (1000+500+500+500)/4 = 625ms
    expect(tapper.tap()).toBe(120) // slow first tap dropped: 4 × 500ms
  })

  it('starts a fresh measurement after a long pause', () => {
    const tapper = tapperAt([0, 500, 500 + TAP_RESET_MS + 1, 500 + TAP_RESET_MS + 1 + 400])

    tapper.tap()
    expect(tapper.tap()).toBe(120)
    expect(tapper.tap()).toBeNull() // pause cleared the buffer
    expect(tapper.tap()).toBe(150)
  })

  it('ignores accidental double-fires under 100ms', () => {
    const tapper = tapperAt([0, 50, 500])

    tapper.tap()
    expect(tapper.tap()).toBeNull()
    expect(tapper.tap()).toBe(120)
  })

  it('clamps the result to the BPM bounds', () => {
    const fast = tapperAt([0, 100], { minBpm: 30, maxBpm: 240 })
    fast.tap()
    expect(fast.tap()).toBe(240)

    const slow = tapperAt([0, 2400], { minBpm: 30, maxBpm: 240 })
    slow.tap()
    expect(slow.tap()).toBe(30)
  })
})
