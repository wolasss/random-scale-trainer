import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotePoolCard } from './NotePoolCard'
import { useSavedPresets } from '../hooks/useSavedPresets'
import { STORAGE_KEYS } from '../constants'

const LOCKED_TITLE = 'The last note stays selected — add another to remove this one'

type CardProps = Parameters<typeof NotePoolCard>[0]
type OwnProps = Omit<CardProps, 'saved' | 'onSaved' | 'savedPersisted'>

/**
 * Stands in for App, which owns the saved list so it outlives the card: the
 * installed layout unmounts the card with the practice sheet, and `mounted`
 * lets a test do exactly that.
 */
function Harness({ mounted = true, ...props }: OwnProps & { mounted?: boolean }) {
  const [saved, setSaved, savedPersisted] = useSavedPresets()

  return mounted ? (
    <NotePoolCard {...props} saved={saved} onSaved={setSaved} savedPersisted={savedPersisted} />
  ) : null
}

const renderCard = (overrides: Partial<OwnProps> = {}) => {
  const props = {
    pool: [0, 2, 4, 5, 7, 9, 11],
    spelling: 'flat' as const,
    onTogglePc: vi.fn(),
    onPreset: vi.fn(),
    onPool: vi.fn(),
    onSpelling: vi.fn(),
    ...overrides,
  }

  return { ...render(<Harness {...props} />), props }
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

describe('NotePoolCard', () => {
  it('counts the notes you get before a repeat', () => {
    renderCard({ pool: [0, 4, 7], spelling: 'sharp' })

    expect(screen.getByTestId('pool-guarantee')).toHaveTextContent('Shuffled — you get all 3 before any repeats.')
    expect(screen.getByTestId('note-chip-0')).not.toHaveAttribute('aria-disabled')
  })

  it('says a single note just repeats', () => {
    renderCard({ pool: [0], spelling: 'sharp' })

    expect(screen.getByTestId('pool-guarantee')).toHaveTextContent('One note — it repeats until you add another.')
  })

  it('marks the last remaining chip as locked', () => {
    renderCard({ pool: [0], spelling: 'sharp' })

    const last = screen.getByTestId('note-chip-0')
    expect(last).toHaveAttribute('aria-disabled', 'true')
    expect(last).toHaveAttribute('title', LOCKED_TITLE)

    const unselected = screen.getByTestId('note-chip-4')
    expect(unselected).not.toHaveAttribute('aria-disabled')
    expect(unselected).not.toHaveAttribute('title')
  })
})

describe('NotePoolCard saved presets', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

    rerender(<Harness {...props} pool={[0, 1, 3]} />)
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

  // The practice sheet closes on any Escape that reaches the window, so an
  // escaping keypress would take the whole of setup down with the form.
  it('keeps the naming Escape from reaching the sheet around it', () => {
    const onWindowKeyDown = vi.fn()
    window.addEventListener('keydown', onWindowKeyDown)
    renderCard({ pool: [0, 1, 2] })
    fireEvent.click(screen.getByRole('button', { name: 'Save these notes' }))

    fireEvent.keyDown(screen.getByLabelText('Preset name'), { key: 'Escape' })
    window.removeEventListener('keydown', onWindowKeyDown)

    expect(onWindowKeyDown).not.toHaveBeenCalled()
    expect(screen.queryByTestId('preset-save-form')).toBeNull()
  })

  it('keeps a preset the browser refused to store while the card is away', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    const { rerender, props } = renderCard({ pool: [0, 1, 2] })
    savePool('Two-string drill')
    expect(screen.getByTestId('preset-ephemeral-notice')).toBeInTheDocument()

    // What closing and reopening the practice sheet does to this card.
    rerender(<Harness {...props} mounted={false} />)
    rerender(<Harness {...props} />)

    expect(screen.getByTestId('preset-select')).toHaveValue('saved:Two-string drill')
  })
})
