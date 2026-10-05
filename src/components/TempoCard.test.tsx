import type { ComponentProps } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_BPM, MIN_BPM, RAMP_BPM_STEP, RAMP_TARGET_STEP, STORAGE_KEYS, rampRounds } from '../constants'
import { useSettings } from '../hooks/useSettings'
import { cycleSeconds, formatCycleLength } from '../lib/time'
import { TAP_RESET_MS } from '../lib/tapTempo'
import { HOLD_REPEAT_DELAY_MS, HOLD_REPEAT_INTERVAL_MS, TAP_AGAIN_LABEL, TAP_RESTING_LABEL, TempoCard } from './TempoCard'

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

function ControlledTempoCard() {
  const [settings, dispatch] = useSettings()

  return (
    <TempoCard
      bpm={settings.bpm}
      beatsPerNote={settings.beatsPerNote}
      poolSize={settings.pool.length}
      rampEnabled={settings.speedRampMode}
      rampTarget={settings.rampTargetBpm}
      rampAvailable={settings.continuousMode}
      onBpmChange={(bpm) => dispatch({ type: 'setBpm', bpm })}
      onNudge={(delta) => dispatch({ type: 'nudgeBpm', delta })}
      onTap={vi.fn()}
      onBeatsPerNoteChange={(value) => dispatch({ type: 'setBeatsPerNote', value })}
      onRampToggle={() => dispatch({ type: 'setRamp', enabled: !settings.speedRampMode })}
      onRampTargetNudge={(delta) => dispatch({ type: 'nudgeRampTarget', delta })}
    />
  )
}

describe('TempoCard', () => {
  describe('half and double time', () => {
    it.each([
      { bpm: 100, action: 'Half time', destination: 50 },
      { bpm: 100, action: 'Double time', destination: 200 },
      { bpm: 101, action: 'Half time', destination: 51 },
      { bpm: 40, action: 'Half time', destination: 30 },
      { bpm: 180, action: 'Double time', destination: 240 },
    ])('$action at $bpm requests $destination once', async ({ bpm, action, destination }) => {
      const user = userEvent.setup()
      const { onBpmChange } = renderCard({ bpm })
      const button = screen.getByRole('button', { name: action })

      expect(button).toBeEnabled()
      await user.click(button)

      expect(onBpmChange).toHaveBeenCalledExactlyOnceWith(destination)
    })

    it.each([
      { bpm: 30, action: 'Half time', opposite: 'Double time', explanation: 'Already at minimum 30 BPM' },
      { bpm: 240, action: 'Double time', opposite: 'Half time', explanation: 'Already at maximum 240 BPM' },
    ])('disables and explains $action at $bpm', async ({ bpm, action, opposite, explanation }) => {
      const user = userEvent.setup()
      const { onBpmChange } = renderCard({ bpm })
      const button = screen.getByRole('button', { name: `${action}: ${explanation}` })

      expect(button).toHaveTextContent(action)
      expect(button).toHaveAttribute('title', `${action}: ${explanation}`)
      expect(button).toBeDisabled()
      expect(screen.getByRole('button', { name: opposite })).toBeEnabled()
      await user.click(button)
      expect(onBpmChange).not.toHaveBeenCalled()

      screen.getByTestId('tap-tempo').focus()
      await user.tab()
      expect(screen.getByRole('button', { name: opposite })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('slider', { name: 'Tempo in BPM' })).toHaveFocus()
    })

    it('reaches both actions with Tab and activates them with Enter and Space', async () => {
      const user = userEvent.setup()
      const { onBpmChange } = renderCard({ bpm: 100 })
      screen.getByTestId('tap-tempo').focus()

      await user.tab()
      expect(screen.getByRole('button', { name: 'Half time' })).toHaveFocus()
      await user.keyboard('{Enter}')
      await user.tab()
      expect(screen.getByRole('button', { name: 'Double time' })).toHaveFocus()
      await user.keyboard(' ')

      expect(onBpmChange).toHaveBeenCalledTimes(2)
      expect(onBpmChange).toHaveBeenNthCalledWith(1, 50)
      expect(onBpmChange).toHaveBeenNthCalledWith(2, 200)
    })

    describe('controlled settings', () => {
      beforeEach(() => {
        window.localStorage.clear()
      })

      it('updates the readout and slider from 120 to 60 and back', async () => {
        const user = userEvent.setup()
        window.localStorage.setItem(STORAGE_KEYS.bpm, '120')
        render(<ControlledTempoCard />)
        const readout = screen.getByTestId('bpm-value')
        const slider = screen.getByRole('slider', { name: 'Tempo in BPM' })

        expect(readout).toHaveTextContent(/^120$/)
        expect(slider).toHaveValue('120')
        await user.click(screen.getByRole('button', { name: 'Half time' }))
        expect(readout).toHaveTextContent(/^60$/)
        expect(slider).toHaveValue('60')
        await user.click(screen.getByRole('button', { name: 'Double time' }))
        expect(readout).toHaveTextContent(/^120$/)
        expect(slider).toHaveValue('120')
      })

      it.each([
        { bpm: 40, action: 'Half time', destination: 30 },
        { bpm: 180, action: 'Double time', destination: 240 },
      ])('updates both displays and disables $action on reaching $destination', async ({ bpm, action, destination }) => {
        const user = userEvent.setup()
        window.localStorage.setItem(STORAGE_KEYS.bpm, String(bpm))
        render(<ControlledTempoCard />)
        const button = screen.getByRole('button', { name: action })

        await user.click(button)

        expect(screen.getByTestId('bpm-value').textContent).toBe(String(destination))
        expect(screen.getByRole('slider', { name: 'Tempo in BPM' })).toHaveValue(String(destination))
        expect(button).toBeDisabled()
      })

      it('raises an overtaken ramp target and preserves it when halving back', async () => {
        const user = userEvent.setup()
        window.localStorage.setItem(STORAGE_KEYS.bpm, '80')
        window.localStorage.setItem(STORAGE_KEYS.continuousMode, 'true')
        window.localStorage.setItem(STORAGE_KEYS.speedRampMode, 'true')
        window.localStorage.setItem(STORAGE_KEYS.rampTarget, '120')
        render(<ControlledTempoCard />)

        expect(screen.getByTestId('ramp-target-value')).toHaveTextContent(/^120$/)
        await user.click(screen.getByRole('button', { name: 'Double time' }))
        expect(screen.getByTestId('bpm-value')).toHaveTextContent(/^160$/)
        expect(screen.getByTestId('ramp-target-value')).toHaveTextContent(/^200$/)
        await user.click(screen.getByRole('button', { name: 'Half time' }))
        expect(screen.getByTestId('bpm-value')).toHaveTextContent(/^80$/)
        expect(screen.getByTestId('ramp-target-value')).toHaveTextContent(/^200$/)
      })
    })
  })

  it('describes what the ramp does when it can be switched on', () => {
    renderCard({ rampAvailable: true })

    expect(
      screen.getByText(`Tempo climbs ${RAMP_BPM_STEP} BPM every time you get through all the notes.`),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Speed ramp' })).toBeEnabled()
  })

  it('names the missing prerequisite when the ramp is out of reach', () => {
    renderCard({ rampAvailable: false })

    expect(screen.getByText('Needs Loop switched on — the ramp climbs between rounds.')).toBeInTheDocument()
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

    it('does not double-nudge when pointerleave follows pointerup, as on touch devices', () => {
      const { onNudge } = renderCard()
      const button = screen.getByTestId('bpm-up')

      fireEvent.pointerDown(button)
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 3)
      expect(onNudge).toHaveBeenCalledTimes(4)

      fireEvent.pointerUp(button)
      fireEvent.pointerLeave(button)
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

  describe('tap tempo feedback', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows a keep-tapping state after the first tap, which does not yet produce a tempo', () => {
      const { onTap } = renderCard()
      const button = screen.getByTestId('tap-tempo')

      fireEvent.click(button)

      expect(button).toHaveTextContent(TAP_AGAIN_LABEL)
      expect(onTap).toHaveBeenCalledTimes(1)
    })

    it('clears the keep-tapping state once a second tap lands a tempo', () => {
      const { onTap } = renderCard()
      const button = screen.getByTestId('tap-tempo')

      fireEvent.click(button)
      act(() => {
        vi.advanceTimersByTime(500)
      })
      fireEvent.click(button)

      expect(button).toHaveTextContent(TAP_RESTING_LABEL)
      expect(onTap).toHaveBeenCalledTimes(2)
    })

    it('returns to the resting label after TAP_RESET_MS with no further tap', () => {
      renderCard()
      const button = screen.getByTestId('tap-tempo')

      fireEvent.click(button)

      act(() => {
        vi.advanceTimersByTime(TAP_RESET_MS - 1)
      })
      expect(button).toHaveTextContent(TAP_AGAIN_LABEL)

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(button).toHaveTextContent(TAP_RESTING_LABEL)

      fireEvent.click(button)
      expect(button).toHaveTextContent(TAP_AGAIN_LABEL)
    })
  })
})
