import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHitBubble } from './useHitBubble'
import { FAKE_CLOCKS } from '../test/fakeTimers'

const BUBBLE_MS = 900
const MAX_BUBBLES = 6

/** A view with the layer mounted, and a button standing in for a hit. */
const View = () => {
  const { layerRef, spawn } = useHitBubble()

  return (
    <>
      <button type="button" onClick={() => spawn()}>
        hit
      </button>
      <div className="hit-bubble-layer" ref={layerRef} />
    </>
  )
}

const mountLayer = () => {
  const view = render(<View />)
  const hit = screen.getByRole('button', { name: 'hit' })

  return {
    ...view,
    spawn: (times = 1) => {
      for (let index = 0; index < times; index += 1) {
        fireEvent.click(hit)
      }
    },
  }
}

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const live = () => screen.queryAllByTestId('hit-bubble')

describe('useHitBubble', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('floats a point off a hit and takes it back out when the float is over', () => {
    const { spawn } = mountLayer()

    spawn()

    expect(live()).toHaveLength(1)
    expect(live()[0]).toHaveTextContent('+1')

    advance(BUBBLE_MS + 10)

    expect(live()).toHaveLength(0)
  })

  it('overlaps notes played back to back, each on its own line', () => {
    const { spawn } = mountLayer()

    spawn(3)

    expect(live()).toHaveLength(3)
    const drifts = live().map((node) => node.style.getPropertyValue('--hit-bubble-drift'))
    expect(new Set(drifts).size).toBe(3)
  })

  it('never lets the layer grow past its ceiling, however fast the hits come', () => {
    const { spawn } = mountLayer()

    spawn(MAX_BUBBLES + 12)

    expect(live()).toHaveLength(MAX_BUBBLES)

    advance(BUBBLE_MS + 10)

    expect(live()).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves neither a node nor a pending timer behind on unmount', () => {
    const { spawn, unmount } = mountLayer()

    // Past the ceiling, so the evicted nodes' timers are in the count too: an
    // eviction that orphaned a timer would show up right here.
    spawn(MAX_BUBBLES + 3)
    unmount()

    expect(live()).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
