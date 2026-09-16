import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { allowConsole } from '../test/consoleGuard'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

const Bomb = () => {
  throw new Error('chunk failed to load')
}

describe('ChunkErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ChunkErrorBoundary>
        <div data-testid="child">hi</div>
      </ChunkErrorBoundary>,
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a reload notice instead of taking the rest of the tree down with it', () => {
    allowConsole('error')

    render(
      <div data-testid="sibling">
        <ChunkErrorBoundary>
          <Bomb />
        </ChunkErrorBoundary>
      </div>,
    )

    expect(screen.getByTestId('sibling')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("The challenge couldn’t load")
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('reloads when the button is clicked', async () => {
    allowConsole('error')
    const reload = vi.fn()
    const user = userEvent.setup()

    render(
      <ChunkErrorBoundary reload={reload}>
        <Bomb />
      </ChunkErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: 'Reload' }))

    expect(reload).toHaveBeenCalledOnce()
  })

  it('pins the notice to the viewport when overlay is set', () => {
    allowConsole('error')

    render(
      <ChunkErrorBoundary overlay>
        <Bomb />
      </ChunkErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveClass('chunk-error-overlay')
  })

  it('leaves the notice inline without overlay', () => {
    allowConsole('error')

    render(
      <ChunkErrorBoundary>
        <Bomb />
      </ChunkErrorBoundary>,
    )

    expect(screen.getByRole('alert')).not.toHaveClass('chunk-error-overlay')
  })
})
