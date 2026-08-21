import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotePoolCard } from './NotePoolCard'
import { STORAGE_KEYS } from '../constants'

const renderCard = (overrides: Partial<Parameters<typeof NotePoolCard>[0]> = {}) => {
  const props = {
    pool: [0, 2, 4, 5, 7, 9, 11],
    spelling: 'flat' as const,
    onTogglePc: vi.fn(),
    onPreset: vi.fn(),
    onPool: vi.fn(),
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

/** Opens the save form, types a name and submits it. */
const savePool = (name: string) => {
  fireEvent.click(screen.getByTestId('preset-save'))
  fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: name } })
  fireEvent.submit(screen.getByTestId('preset-save-form'))
}

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

describe('NotePoolCard saved presets', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saves the current notes under a name and selects them', () => {
    renderCard({ pool: [0, 1, 2] })
    expect(screen.getByTestId('preset-select')).toHaveValue('custom')

    savePool('Two-string drill')

    const groups = groupsOf(screen.getByTestId('preset-select'))
    expect(groups[0]).toEqual({ label: 'Saved', options: ['Two-string drill'] })
    expect(screen.getByTestId('preset-select')).toHaveValue('saved:Two-string drill')
    expect(screen.queryByTestId('preset-save-form')).toBeNull()
  })

  it('applies a saved preset as a pool rather than a preset id', () => {
    const onPool = vi.fn()
    const onPreset = vi.fn()
    renderCard({ pool: [0, 1, 2], onPool, onPreset })
    savePool('Two-string drill')

    fireEvent.change(screen.getByTestId('preset-select'), { target: { value: 'saved:Two-string drill' } })

    expect(onPool).toHaveBeenCalledWith([0, 1, 2])
    expect(onPreset).not.toHaveBeenCalled()
  })

  it('deletes the selected saved preset and leaves the notes alone', () => {
    const { props } = renderCard({ pool: [0, 1, 2] })
    savePool('Two-string drill')

    fireEvent.click(screen.getByRole('button', { name: 'Delete “Two-string drill”' }))

    expect(groupsOf(screen.getByTestId('preset-select')).map((group) => group.label)).not.toContain('Saved')
    expect(screen.getByTestId('preset-select')).toHaveValue('custom')
    expect(props.onPool).not.toHaveBeenCalled()
    expect(props.onTogglePc).not.toHaveBeenCalled()
  })

  it('refuses a name that is already taken and keeps the form open', () => {
    const { rerender, props } = renderCard({ pool: [0, 1, 2] })
    savePool('Drill')

    rerender(<NotePoolCard {...props} pool={[0, 1, 3]} />)
    savePool('drill')

    expect(screen.getByTestId('preset-save-error')).toHaveTextContent('You already have a saved preset by that name.')
    expect(screen.getByTestId('preset-save-form')).toBeInTheDocument()
    expect(groupsOf(screen.getByTestId('preset-select'))[0].options).toEqual(['Drill'])
  })

  it('refuses a name with nothing in it', () => {
    renderCard({ pool: [0, 1, 2] })

    savePool('   ')

    expect(screen.getByTestId('preset-save-error')).toHaveTextContent('Give this set of notes a name first.')
  })

  it('offers no save for notes that already are a preset', () => {
    renderCard({ pool: [0, 2, 4, 5, 7, 9, 11] })

    expect(screen.getByTestId('preset-save')).toBeDisabled()
    expect(screen.getByText('These notes are already a preset.')).toBeInTheDocument()
  })

  it('reads the saved presets back from storage on the next visit', () => {
    const { unmount } = renderCard({ pool: [0, 1, 2] })
    savePool('Two-string drill')
    unmount()

    renderCard({ pool: [0, 1, 2] })

    expect(screen.getByTestId('preset-select')).toHaveValue('saved:Two-string drill')
  })

  it('ignores a stored list it cannot read', () => {
    window.localStorage.setItem(STORAGE_KEYS.savedPresets, 'not json')
    renderCard({ pool: [0, 1, 2] })

    expect(groupsOf(screen.getByTestId('preset-select')).map((group) => group.label)).not.toContain('Saved')
    expect(screen.getByTestId('preset-select')).toHaveValue('custom')
  })

  it('labels the naming form and closes it on Escape', () => {
    renderCard({ pool: [0, 1, 2] })

    fireEvent.click(screen.getByRole('button', { name: 'Save these notes' }))
    const input = screen.getByLabelText('Preset name')
    expect(input).toHaveFocus()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByTestId('preset-save-form')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save these notes' })).toBeInTheDocument()
  })
})
