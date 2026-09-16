import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PracticeOptionsCard } from './PracticeOptionsCard'
import { isMicSupported } from '../lib/audio/mic'
import type { Settings } from '../hooks/useSettings'

// Support is read straight off the browser, so the capability check is the one
// thing faked here; the rest of the mic module is left alone.
vi.mock('../lib/audio/mic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/audio/mic')>()),
  isMicSupported: vi.fn(() => true),
}))

const SETTINGS: Settings = {
  bpm: 80,
  beatsPerNote: 4,
  continuousMode: true,
  countInEnabled: true,
  speakNotes: true,
  speedRampMode: false,
  rampTargetBpm: 120,
  showFretboard: true,
  noteListMode: false,
  listMetronomeEnabled: true,
  tuning: 'standard',
  leftHanded: false,
  micEnabled: false,
  advanceOnOctaves: false,
  spelling: 'flat',
  pool: [0, 2, 4, 5, 7, 9, 11],
  sessionGoalMin: 10,
  endSoundEnabled: true,
}

const renderCard = (
  overrides: Partial<Settings> = {},
  listModeUnavailable = false,
  fretboardUnavailable = false,
  earlyAdvanceUnavailable = false,
) => {
  const props = {
    settings: { ...SETTINGS, ...overrides },
    onToggle: vi.fn(),
    listModeUnavailable,
    fretboardUnavailable,
    earlyAdvanceUnavailable,
  }

  return { ...render(<PracticeOptionsCard {...props} />), props }
}

describe('PracticeOptionsCard layout', () => {
  it('groups the regular switches by purpose, in reading order', () => {
    renderCard()

    const groups = screen.getAllByRole('group')
    const names = (group: HTMLElement) =>
      within(group)
        .getAllByRole('switch')
        .map((control) => control.getAttribute('id'))

    expect(groups.map((group) => group.getAttribute('aria-labelledby'))).toEqual([
      'options-playing-label',
      'options-feedback-label',
      'options-list-label',
    ])
    expect(screen.getByRole('group', { name: 'While playing' })).toBe(groups[0])
    expect(screen.getByRole('group', { name: 'Feedback' })).toBe(groups[1])
    expect(screen.getByRole('group', { name: 'Or practise from a list' })).toBe(groups[2])
    expect(names(groups[0])).toEqual(['count-in', 'continuous-mode', 'speak-notes'])
    expect(names(groups[1])).toEqual(['mic-listen', 'advance-on-octaves', 'show-fretboard'])
    expect(names(groups[2])).toEqual(['note-list'])
    expect(screen.getByText('Switches for every session. Tempo and notes live in their own cards.')).toBeInTheDocument()
    expect(screen.queryByText(/are paused in List mode/)).toBeNull()
  })

  it('gathers the list-mode switches and says the rest are only paused', () => {
    renderCard({ noteListMode: true })

    const group = screen.getByRole('group', { name: 'Practising from a list' })

    expect(screen.getAllByRole('group')).toEqual([group])
    expect(
      within(group)
        .getAllByRole('switch')
        .map((control) => control.getAttribute('id')),
    ).toEqual(['note-list', 'list-metronome', 'count-in'])
    expect(screen.getByRole('switch', { name: 'List mode' })).toHaveAccessibleDescription(
      'All selected notes in one shuffled list, timed with a stopwatch. Order holds until you tap Shuffle list.',
    )
    expect(screen.getByRole('switch', { name: 'Metronome click' })).toHaveAccessibleDescription(
      'Click along while the stopwatch runs. Off makes it a silent timed workout.',
    )
    expect(screen.getByRole('switch', { name: 'Count-in' })).toHaveAccessibleDescription(
      'Four clicks before the stopwatch starts.',
    )
    expect(
      screen.getByText(
        'Loop, spoken notes, the mic, Skip ahead and the fretboard are paused in List mode. Their settings are kept.',
      ),
    ).toBeInTheDocument()
  })

  it('describes each regular switch on-state first', () => {
    renderCard()

    expect(screen.getByRole('switch', { name: 'Count-in' })).toHaveAccessibleDescription(
      'Four clicks before the first note and each new round.',
    )
    expect(screen.getByRole('switch', { name: 'Loop' })).toHaveAccessibleDescription(
      'Keep calling notes until you press stop, in a fresh order after each full set. Off stops once every note has been called. The speed ramp needs this on.',
    )
    expect(screen.getByRole('switch', { name: 'Show the fretboard' })).toHaveAccessibleDescription(
      'Show where the called note sits on the neck, open to 12th fret.',
    )
    expect(screen.getByRole('switch', { name: 'List mode' })).toHaveAccessibleDescription(
      'One shuffled list of all selected notes, timed with a stopwatch, instead of notes called one by one. Pauses spoken notes, the mic and the fretboard.',
    )
  })
})

describe('PracticeOptionsCard mic switch', () => {
  beforeEach(() => {
    vi.mocked(isMicSupported).mockReturnValue(true)
  })

  it('offers the switch when the browser can listen', () => {
    const { props } = renderCard()
    const micSwitch = screen.getByRole('switch', {
      name: 'Listen with the microphone',
    })

    expect(micSwitch).toBeEnabled()
    expect(micSwitch).toHaveAccessibleDescription(
      'Mark the note you play right or wrong against the one called. Asks for mic access.',
    )

    fireEvent.click(micSwitch)

    expect(props.onToggle).toHaveBeenCalledWith('micEnabled')
  })

  it('says why the switch is off when the browser cannot listen', () => {
    vi.mocked(isMicSupported).mockReturnValue(false)
    // Stored on from a browser that could listen: it still has to read as off.
    const { props } = renderCard({ micEnabled: true })
    const micSwitch = screen.getByRole('switch', {
      name: 'Listen with the microphone',
    })

    expect(micSwitch).toBeDisabled()
    expect(micSwitch).toHaveAttribute('aria-checked', 'false')
    expect(micSwitch).toHaveAccessibleDescription('This browser has no microphone to listen with.')

    fireEvent.click(micSwitch)

    expect(props.onToggle).not.toHaveBeenCalled()
  })

  it('leaves the other switches working without a microphone', () => {
    vi.mocked(isMicSupported).mockReturnValue(false)
    const { props } = renderCard()

    for (const name of ['Loop', 'Count-in', 'Say the note aloud', 'List mode', 'Show the fretboard']) {
      fireEvent.click(screen.getByRole('switch', { name }))
    }

    expect(props.onToggle.mock.calls).toEqual([
      ['continuousMode'],
      ['countInEnabled'],
      ['speakNotes'],
      ['noteListMode'],
      ['showFretboard'],
    ])
  })
})

describe('PracticeOptionsCard speak-notes switch', () => {
  it('offers List mode last as the alternative, and first once it is on', () => {
    const { rerender, props } = renderCard()

    expect(screen.getAllByRole('switch').at(-1)).toHaveAccessibleName('List mode')

    rerender(<PracticeOptionsCard {...props} settings={{ ...props.settings, noteListMode: true }} />)

    expect(screen.getAllByRole('switch')[0]).toHaveAccessibleName('List mode')
  })

  it('renders checked from settings and reports its subtitle', () => {
    const { props } = renderCard({ speakNotes: false })
    const speakSwitch = screen.getByRole('switch', {
      name: 'Say the note aloud',
    })

    expect(speakSwitch).toHaveAttribute('aria-checked', 'false')
    expect(speakSwitch).toHaveAccessibleDescription(
      "Speak each note's name as it's called. Off shows it on screen only.",
    )

    fireEvent.click(speakSwitch)

    expect(props.onToggle).toHaveBeenCalledWith('speakNotes')
  })

  it('shows only controls that apply to list-only workouts', () => {
    const { props } = renderCard({
      noteListMode: true,
      micEnabled: true,
      showFretboard: true,
    })

    expect(screen.getByRole('switch', { name: 'List mode' })).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Metronome click' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Count-in' })).toBeEnabled()
    expect(screen.queryByRole('switch', { name: 'Loop' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Say the note aloud' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Listen with the microphone' })).toBeNull()
    expect(screen.queryByRole('switch', { name: "Skip ahead once I've found it" })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Show the fretboard' })).toBeNull()

    fireEvent.click(screen.getByRole('switch', { name: 'Metronome click' }))
    expect(props.onToggle).toHaveBeenCalledWith('listMetronomeEnabled')
  })

  it('disables list-only during a challenge without disabling spoken calls', () => {
    const { props } = renderCard({ noteListMode: true, speakNotes: true }, true)
    const listSwitch = screen.getByRole('switch', { name: 'List mode' })
    const speakSwitch = screen.getByRole('switch', {
      name: 'Say the note aloud',
    })

    expect(listSwitch).toBeDisabled()
    expect(listSwitch).toHaveAttribute('aria-checked', 'false')
    expect(listSwitch).toHaveAccessibleDescription('Unavailable during a challenge, where each called note is scored.')
    expect(speakSwitch).toBeEnabled()
    expect(speakSwitch).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(listSwitch)
    expect(props.onToggle).not.toHaveBeenCalled()
  })

  it('disables the fretboard map during a challenge', () => {
    const { props } = renderCard({ showFretboard: true }, false, true)
    const fretboardSwitch = screen.getByRole('switch', {
      name: 'Show the fretboard',
    })

    expect(fretboardSwitch).toBeDisabled()
    expect(fretboardSwitch).toHaveAttribute('aria-checked', 'false')
    expect(fretboardSwitch).toHaveAccessibleDescription(
      'Unavailable during a challenge, where the map would give each scored note away.',
    )

    fireEvent.click(fretboardSwitch)
    expect(props.onToggle).not.toHaveBeenCalled()
  })
})

describe('PracticeOptionsCard early advance switch', () => {
  const name = "Skip ahead once I've found it"

  beforeEach(() => {
    vi.mocked(isMicSupported).mockReturnValue(true)
  })

  it('is off and unavailable until the mic is listening', () => {
    const { props } = renderCard({ advanceOnOctaves: true })
    const advance = screen.getByRole('switch', { name })

    expect(advance).toBeDisabled()
    expect(advance).toHaveAttribute('aria-checked', 'false')
    expect(advance).toHaveAccessibleDescription(
      'Once the mic hears the note in two octaves, the next one comes on the next click. Needs the microphone on.',
    )

    fireEvent.click(advance)
    expect(props.onToggle).not.toHaveBeenCalled()
  })

  it('toggles once the mic is on', () => {
    const { props } = renderCard({ micEnabled: true })
    const advance = screen.getByRole('switch', { name })

    expect(advance).toBeEnabled()
    expect(advance).toHaveAttribute('aria-checked', 'false')
    expect(advance).toHaveAccessibleDescription(
      'Once the mic hears the note in two octaves, the next one comes on the next click. Needs the microphone on.',
    )

    fireEvent.click(advance)
    expect(props.onToggle).toHaveBeenCalledWith('advanceOnOctaves')
  })

  it('says why it is off during a challenge', () => {
    renderCard({ micEnabled: true, advanceOnOctaves: true }, false, false, true)
    const advance = screen.getByRole('switch', { name })

    expect(advance).toBeDisabled()
    expect(advance).toHaveAttribute('aria-checked', 'false')
    expect(advance).toHaveAccessibleDescription(
      'Unavailable during a challenge, where every note runs its full length.',
    )
  })
})
