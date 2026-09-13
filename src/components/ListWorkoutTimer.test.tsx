import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ListWorkoutTimer } from './ListWorkoutTimer'

const renderTimer = (
  overrides: Partial<ComponentProps<typeof ListWorkoutTimer>> = {},
) => {
  const props: ComponentProps<typeof ListWorkoutTimer> = {
    isPlaying: false,
    started: false,
    elapsedMs: 0,
    countIn: null,
    playbackMessage: 'Press start.',
    onToggle: vi.fn(),
    onRestart: vi.fn(),
    ...overrides,
  }

  const view = render(<ListWorkoutTimer {...props} />)
  return { ...view, props }
}

describe('ListWorkoutTimer', () => {
  it('starts as a compact ready stopwatch', () => {
    const { props } = renderTimer()

    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:00')
    fireEvent.click(screen.getByRole('button', { name: 'Start timed attempt' }))
    expect(props.onToggle).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Reset timer' })).toBeNull()
  })

  it('shows the count-in without adding it to the workout result', () => {
    renderTimer({ isPlaying: true, started: true, countIn: 3 })

    expect(screen.getByText('Starting in 3')).toBeInTheDocument()
    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:00')
  })

  it('reports audio preparation before the count-in is ready', () => {
    renderTimer({ isPlaying: true, started: true, playbackMessage: 'Loading audio...' })

    expect(screen.getByText('Preparing')).toBeInTheDocument()
  })

  it('puts the stop action beside the running time', () => {
    const { props } = renderTimer({ isPlaying: true, started: true, elapsedMs: 42_000 })

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:42')
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(props.onToggle).toHaveBeenCalledOnce()
  })

  it('holds a result with one clear next attempt action', () => {
    const { props } = renderTimer({ started: true, elapsedMs: 42_000 })

    expect(screen.getByText('Result')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry same list' }))
    expect(props.onRestart).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Continue attempt' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset timer' })).toBeNull()
  })

  it('keeps playback failures beside the timer action', () => {
    renderTimer({ playbackMessage: 'Failed to load audio. Please reload the page.' })

    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Failed to load audio. Please reload the page.')).toBeInTheDocument()
  })

  it('keeps the same primary control node through ready, running and result states', () => {
    const { rerender } = renderTimer()
    const primary = screen.getByTestId('play-toggle')

    rerender(
      <ListWorkoutTimer
        isPlaying
        started
        elapsedMs={2_000}
        countIn={null}
        playbackMessage="Calling notes."
        onToggle={vi.fn()}
        onRestart={vi.fn()}
      />,
    )
    expect(screen.getByTestId('play-toggle')).toBe(primary)
    expect(primary).toHaveAccessibleName('Stop')

    rerender(
      <ListWorkoutTimer
        isPlaying={false}
        started
        elapsedMs={2_000}
        countIn={null}
        playbackMessage="Press start."
        onToggle={vi.fn()}
        onRestart={vi.fn()}
      />,
    )
    expect(screen.getByTestId('play-toggle')).toBe(primary)
    expect(primary).toHaveAccessibleName('Retry same list')
  })
})
