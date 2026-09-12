import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ListWorkoutTimer } from './ListWorkoutTimer'

const renderTimer = (
  overrides: Partial<ComponentProps<typeof ListWorkoutTimer>> = {},
) => {
  const props: ComponentProps<typeof ListWorkoutTimer> = {
    isPlaying: false,
    isPaused: false,
    started: false,
    elapsedMs: 0,
    beatsPerNote: 4,
    beatInSpan: 0,
    countIn: null,
    playbackMessage: 'Press start.',
    onToggle: vi.fn(),
    onRestart: vi.fn(),
    ...overrides,
  }

  render(<ListWorkoutTimer {...props} />)
  return props
}

describe('ListWorkoutTimer', () => {
  it('starts as a plain stopwatch coupled to the metronome', () => {
    const props = renderTimer()

    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:00')
    expect(screen.getByText('Starts the timer and metronome')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }))
    expect(props.onToggle).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Reset timer' })).toBeNull()
  })

  it('shows the count-in without adding it to the workout result', () => {
    renderTimer({ isPlaying: true, started: true, countIn: 3 })

    expect(screen.getByText('Starting in 3')).toBeInTheDocument()
    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:00')
    expect(screen.getByText('Count-in')).toBeInTheDocument()
  })

  it('reports audio preparation before the count-in is ready', () => {
    renderTimer({ isPlaying: true, started: true, playbackMessage: 'Loading audio...' })

    expect(screen.getByText('Preparing audio')).toBeInTheDocument()
    expect(screen.getByText('Loading audio...')).toBeInTheDocument()
  })

  it('puts the stop action beside the running time and beat state', () => {
    const props = renderTimer({ isPlaying: true, started: true, elapsedMs: 42_000, beatInSpan: 1 })

    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:42')
    expect(screen.getByText('Beat 2 of 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(props.onToggle).toHaveBeenCalledOnce()
  })

  it('holds a finished result and distinguishes a fresh start from recovery', () => {
    const props = renderTimer({ isPaused: true, started: true, elapsedMs: 42_000 })

    expect(screen.getByText('Finished in')).toBeInTheDocument()
    expect(screen.getByText('Result ready to note down')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry same list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue attempt' }))
    expect(props.onToggle).toHaveBeenCalledOnce()
    expect(props.onRestart).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Reset timer' })).toBeNull()
  })

  it('keeps playback failures beside the timer action', () => {
    renderTimer({ playbackMessage: 'Failed to load audio. Please reload the page.' })

    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Failed to load audio. Please reload the page.')).toBeInTheDocument()
  })
})
