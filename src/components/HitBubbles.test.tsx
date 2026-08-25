import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE_CLOCKS } from '../test/fakeTimers'
import { HitBubbles } from './HitBubbles'

describe('HitBubbles', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('turns every new pluck pulse into its own short-lived check bubble', () => {
    const { rerender } = render(<HitBubbles pulses={0} />)

    expect(screen.queryByTestId('hit-bubble')).toBeNull()

    rerender(<HitBubbles pulses={1} />)
    expect(screen.getAllByTestId('hit-bubble')).toHaveLength(1)
    expect(screen.getByTestId('hit-bubble')).toHaveTextContent('✓')

    // More microphone frames from the same sustain leave the pulse unchanged.
    rerender(<HitBubbles pulses={1} />)
    expect(screen.getAllByTestId('hit-bubble')).toHaveLength(1)

    // Rapid or batched plucks each keep a bubble and overlap safely.
    rerender(<HitBubbles pulses={3} />)
    expect(screen.getAllByTestId('hit-bubble')).toHaveLength(3)
    expect(screen.getAllByTestId('hit-bubble').map((bubble) => bubble.textContent)).toEqual(['✓', '✓', '✓'])

    act(() => vi.advanceTimersByTime(800))
    expect(screen.queryByTestId('hit-bubble')).toBeNull()
  })

  it('does not replay old hits after a reset or remount', () => {
    const { rerender, unmount } = render(<HitBubbles pulses={0} />)

    rerender(<HitBubbles pulses={1} />)
    expect(screen.getAllByTestId('hit-bubble')).toHaveLength(1)

    // Reset dismisses even an effect that is still in flight.
    rerender(<HitBubbles pulses={0} />)
    expect(screen.queryByTestId('hit-bubble')).toBeNull()

    rerender(<HitBubbles pulses={1} />)
    expect(screen.getAllByTestId('hit-bubble')).toHaveLength(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)

    render(<HitBubbles pulses={2} />)
    expect(screen.queryByTestId('hit-bubble')).toBeNull()
  })

  it('clears an in-flight bubble when playback becomes inactive', () => {
    const { rerender } = render(<HitBubbles pulses={0} active />)

    rerender(<HitBubbles pulses={1} active />)
    expect(screen.getAllByTestId('hit-bubble')).toHaveLength(1)

    rerender(<HitBubbles pulses={1} active={false} />)
    expect(screen.queryByTestId('hit-bubble')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    rerender(<HitBubbles pulses={1} active />)
    expect(screen.queryByTestId('hit-bubble')).toBeNull()
  })
})
