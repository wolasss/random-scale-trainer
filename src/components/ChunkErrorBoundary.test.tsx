import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

const Bomb = () => {
  throw new Error('chunk failed to load')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChunkErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ChunkErrorBoundary>
        <div data-testid="child">hi</div>
      </ChunkErrorBoundary>,
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('swallows a failed child instead of taking the rest of the tree down with it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <div data-testid="sibling">
        <ChunkErrorBoundary>
          <Bomb />
        </ChunkErrorBoundary>
      </div>,
    )

    expect(screen.getByTestId('sibling')).toBeInTheDocument()
  })
})
