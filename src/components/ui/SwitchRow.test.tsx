import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SwitchRow } from './SwitchRow'

const ENABLED_SUBTITLE = 'Tempo climbs 5 BPM every time you get through all the notes.'
const DISABLED_SUBTITLE = 'Needs Keep going switched on — the ramp climbs between rounds.'

/** The tempo card's speed-ramp row, in either of the two states it ships in. */
function renderRow(disabled: boolean) {
  const subtitle = disabled ? DISABLED_SUBTITLE : ENABLED_SUBTITLE

  render(
    <SwitchRow
      id="speed-ramp-mode"
      label="Speed ramp"
      subtitle={subtitle}
      checked={false}
      onChange={() => {}}
      disabled={disabled}
    />,
  )

  return { switchEl: screen.getByRole('switch', { name: 'Speed ramp' }), subtitle }
}

describe('SwitchRow', () => {
  it('points the switch at its own subtitle', () => {
    const { switchEl, subtitle } = renderRow(false)

    expect(document.getElementById(switchEl.getAttribute('aria-describedby') ?? '')).toBe(
      screen.getByText(subtitle),
    )
    expect(switchEl).toHaveAccessibleDescription(subtitle)
  })

  it('still announces the reason when the switch is disabled', () => {
    const { switchEl, subtitle } = renderRow(true)

    expect(switchEl).toBeDisabled()
    expect(document.getElementById(switchEl.getAttribute('aria-describedby') ?? '')).toBe(
      screen.getByText(subtitle),
    )
    expect(switchEl).toHaveAccessibleDescription(subtitle)
  })
})
