import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotePoolCard } from './NotePoolCard'

const renderCard = (overrides: Partial<Parameters<typeof NotePoolCard>[0]> = {}) => {
  const props = {
    pool: [0, 2, 4, 5, 7, 9, 11],
    spelling: 'flat' as const,
    onTogglePc: vi.fn(),
    onPreset: vi.fn(),
    onSpelling: vi.fn(),
    ...overrides,
  }

  return { ...render(<NotePoolCard {...props} />), props }
}

const groupsOf = (select: HTMLElement) =>
  [...select.querySelectorAll('optgroup')].map((group) => ({
    label: group.label,
    options: [...group.querySelectorAll('option')].map((option) => option.textContent),
  }))

describe('NotePoolCard preset selector', () => {
  it('groups the presets by family', () => {
    renderCard()
    const groups = groupsOf(screen.getByTestId('preset-select'))

    expect(groups.map((group) => group.label)).toEqual([
      'Chromatic & naturals',
      'Major keys',
      'Minor keys',
      'Custom',
    ])
  })

  it('lists the flat major keys under the major keys', () => {
    renderCard()
    const majors = groupsOf(screen.getByTestId('preset-select')).find((group) => group.label === 'Major keys')

    expect(majors?.options).toContain('Key of B♭ major')
    expect(majors?.options).toContain('Key of E♭ major')
  })

  it('leaves every option inside a group', () => {
    renderCard()
    const select = screen.getByTestId('preset-select')
    const grouped = groupsOf(select).flatMap((group) => group.options)

    expect(grouped).toHaveLength(select.querySelectorAll('option').length)
  })

  it('dispatches the newly added presets', () => {
    const { props } = renderCard()

    fireEvent.change(screen.getByTestId('preset-select'), { target: { value: 'e-flat-major' } })

    expect(props.onPreset).toHaveBeenCalledWith('e-flat-major')
  })
})
