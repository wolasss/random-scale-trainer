import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_BPM, MIN_BPM, RAMP_BPM_STEP, RAMP_TARGET_STEP, rampRounds } from '../constants'
import { cycleSeconds, formatCycleLength } from '../lib/time'
import { HOLD_REPEAT_DELAY_MS, HOLD_REPEAT_INTERVAL_MS, TempoCard } from './TempoCard'

const renderCard = (overrides: Partial<ComponentProps<typeof TempoCard>> = {}) => {
  const spies = {
    onBpmChange: vi.fn(),
    onNudge: vi.fn(),
    onTap: vi.fn(),
    onBeatsPerNoteChange: vi.fn(),
    onRampToggle: vi.fn(),
    onRampTargetNudge: vi.fn(),
  }

  const { unmount } = render(
    <TempoCard
      bpm={60}
      beatsPerNote={4}
      poolSize={12}
      rampEnabled={false}
      rampTarget={80}
      rampAvailable={true}
      onBpmChange={spies.onBpmChange}
      onNudge={spies.onNudge}
      onTap={spies.onTap}
      onBeatsPerNoteChange={spies.onBeatsPerNoteChange}
      onRampToggle={spies.onRampToggle}
      onRampTargetNudge={spies.onRampTargetNudge}
      {...overrides}
    />,
  )

  return { ...spies, unmount }
}

describe('TempoCard', () => {
  it('describes what the ramp does when it can be switched on', () => {
    renderCard({ rampAvailable: true })

    expect(
      screen.getByText(`Tempo climbs ${RAMP_BPM_STEP} BPM every time you get through all the notes.`),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Speed ramp' })).toBeEnabled()
  })

  it('names the missing prerequisite when the ramp is out of reach', () => {
    renderCard({ rampAvailable: false })

    expect(screen.getByText('Needs Keep going switched on — the ramp climbs between rounds.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Speed ramp' })).toBeDisabled()
  })

  it('shows the cycle length for the given pool size, note span and tempo', () => {
    renderCard({ poolSize: 12, beatsPerNote: 4, bpm: 60 })

    expect(screen.getByText('All 12 notes take about')).toBeInTheDocument()
    expect(screen.getByText(formatCycleLength(cycleSeconds(12, 4, 60)))).toBeInTheDocument()
  })

  it('nudges the tempo down then up by 1 BPM', async () => {
    const user = userEvent.setup()
    const { onNudge } = renderCard()

    await user.click(screen.getByTestId('bpm-down'))
    await user.click(screen.getByTestId('bpm-up'))

    expect(onNudge).toHaveBeenNthCalledWith(1, -1)
    expect(onNudge).toHaveBeenNthCalledWith(2, 1)
    expect(screen.getByTestId('bpm-value')).toHaveTextContent('60')
  })

  it('carries the BPM range on the slider and reports a numeric change', () => {
    const { onBpmChange } = renderCard()
    const slider = screen.getByRole('slider', { name: 'Tempo in BPM' })

    expect(slider).toHaveAttribute('min', String(MIN_BPM))
    expect(slider).toHaveAttribute('max', String(MAX_BPM))

    // jsdom range inputs don't respond to userEvent gestures, so drive the change directly.
    fireEvent.change(slider, { target: { value: '120' } })

    expect(onBpmChange).toHaveBeenCalledWith(120)
  })

  it('taps the tempo', async () => {
    const user = userEvent.setup()
    const { onTap } = renderCard()

    await user.click(screen.getByTestId('tap-tempo'))

    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('hides the ramp target block when the ramp is off', () => {
    renderCard({ rampEnabled: false })

    expect(screen.queryByTestId('ramp-target')).not.toBeInTheDocument()
  })

  it('shows the ramp target block when the ramp is on', () => {
    renderCard({ rampEnabled: true })

    expect(screen.getByTestId('ramp-target')).toBeInTheDocument()
  })

  it('nudges the ramp target down then up by RAMP_TARGET_STEP', async () => {
    const user = userEvent.setup()
    const { onRampTargetNudge } = renderCard({ rampEnabled: true })

    await user.click(screen.getByTestId('ramp-target-down'))
    await user.click(screen.getByTestId('ramp-target-up'))

    expect(onRampTargetNudge).toHaveBeenNthCalledWith(1, -RAMP_TARGET_STEP)
    expect(onRampTargetNudge).toHaveBeenNthCalledWith(2, RAMP_TARGET_STEP)
  })

  it('says the target is reached when it sits at the current tempo', () => {
    renderCard({ rampEnabled: true, bpm: 80, rampTarget: 80 })

    expect(screen.getByTestId('ramp-helper')).toHaveTextContent('Target reached — holding here.')
  })

  it('says the target is reached when it is below the current tempo', () => {
    renderCard({ rampEnabled: true, bpm: 80, rampTarget: 70 })

    expect(screen.getByTestId('ramp-helper')).toHaveTextContent('Target reached — holding here.')
  })

  it('uses the singular round when a single climb reaches the target', () => {
    const bpm = 60
    const rampTarget = bpm + RAMP_BPM_STEP
    renderCard({ rampEnabled: true, bpm, rampTarget })

    expect(screen.getByTestId('ramp-helper')).toHaveTextContent(`1 round from ${bpm}, then it holds.`)
  })

  it('uses the plural rounds wording further out from the target', () => {
    const bpm = 60
    const rampTarget = bpm + RAMP_BPM_STEP * 3
    const rounds = rampRounds(bpm, rampTarget)
    renderCard({ rampEnabled: true, bpm, rampTarget })

    expect(screen.getByTestId('ramp-helper')).toHaveTextContent(`${rounds} rounds from ${bpm}, then it holds.`)
  })

  describe('hold to repeat', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('nudges once when the press is released before the delay', () => {
      const { onNudge } = renderCard()
      const button = screen.getByTestId('bpm-up')

      fireEvent.pointerDown(button)
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS - 1)
      fireEvent.pointerUp(button)
      fireEvent.click(button)

      expect(onNudge).toHaveBeenCalledTimes(1)
      expect(onNudge).toHaveBeenCalledWith(1)

      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 3)
      expect(onNudge).toHaveBeenCalledTimes(1)
    })

    it('repeats while held and stops on release', () => {
      const { onNudge } = renderCard()
      const button = screen.getByTestId('bpm-up')

      fireEvent.pointerDown(button)
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 3)

      expect(onNudge).toHaveBeenCalledTimes(4)
      expect(onNudge).toHaveBeenLastCalledWith(1)

      fireEvent.pointerUp(button)
      fireEvent.click(button)
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 3)

      expect(onNudge).toHaveBeenCalledTimes(4)
    })

    it('stops repeating on pointercancel without poisoning the next click', () => {
      const { onNudge } = renderCard()
      const button = screen.getByTestId('bpm-up')

      fireEvent.pointerDown(button)
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 2)
      expect(onNudge).toHaveBeenCalledTimes(3)

      fireEvent.pointerCancel(button)
      vi.advanceTimersByTime(HOLD_REPEAT_INTERVAL_MS * 3)
      expect(onNudge).toHaveBeenCalledTimes(3)

      fireEvent.click(button)
      expect(onNudge).toHaveBeenCalledTimes(4)
    })

    it('stops repeating on pointerleave without poisoning the next click', () => {
      const { onNudge } = renderCard()
      const button = screen.getByTestId('bpm-up')

      fireEvent.pointerDown(button)
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 2)
      expect(onNudge).toHaveBeenCalledTimes(3)

      fireEvent.pointerLeave(button)
      vi.advanceTimersByTime(HOLD_REPEAT_INTERVAL_MS * 3)
      expect(onNudge).toHaveBeenCalledTimes(3)

      fireEvent.click(button)
      expect(onNudge).toHaveBeenCalledTimes(4)
    })

    it('tears down the repeat timers on unmount', () => {
      const { onNudge, unmount } = renderCard()
      const button = screen.getByTestId('bpm-up')

      fireEvent.pointerDown(button)
      unmount()
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 5)

      expect(onNudge).not.toHaveBeenCalled()
    })

    it('repeats the ramp target stepper the same way', () => {
      const { onRampTargetNudge } = renderCard({ rampEnabled: true })
      const button = screen.getByTestId('ramp-target-up')

      fireEvent.pointerDown(button)
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 2)

      expect(onRampTargetNudge).toHaveBeenCalledTimes(3)
      expect(onRampTargetNudge).toHaveBeenLastCalledWith(RAMP_TARGET_STEP)

      fireEvent.pointerUp(button)
      fireEvent.click(button)
      vi.advanceTimersByTime(HOLD_REPEAT_INTERVAL_MS * 3)

      expect(onRampTargetNudge).toHaveBeenCalledTimes(3)
    })
  })
})
