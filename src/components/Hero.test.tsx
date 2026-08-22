import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Hero } from './Hero'
import { PLAYBACK_MESSAGES } from '../constants'
import { TOUCH_INPUT_QUERY } from '../hooks/useHardwareKeyboard'
import { INITIAL_PLAYBACK_SNAPSHOT } from '../lib/playback/machine'
import { installMatchMedia } from '../test/matchMedia'

/** jsdom's own matchMedia never matches anything, so each test says whether the
 * browser reports a touchscreen among its inputs. */
const installTouchInput = (touchInput: boolean) => installMatchMedia({ [TOUCH_INPUT_QUERY]: touchInput })

const renderHero = (props: Partial<Parameters<typeof Hero>[0]> = {}) =>
  render(
    <Hero
      snapshot={INITIAL_PLAYBACK_SNAPSHOT}
      beatsPerNote={4}
      poolSize={12}
      ringRef={{ current: null }}
      {...props}
    />,
  )

const playing = (overrides: Partial<(typeof INITIAL_PLAYBACK_SNAPSHOT)['currentNote'] & object> = {}) => ({
  ...INITIAL_PLAYBACK_SNAPSHOT,
  status: 'playing' as const,
  currentNote: { pc: 0, display: 'C', audioKey: 'C', cycleStart: true, bagSize: 12, ...overrides },
  positionInCycle: 1,
  cycleLength: 12,
})

describe('Hero string call', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('stays out of the way when the call names no string', () => {
    installTouchInput(false)

    renderHero({ snapshot: playing() })

    expect(screen.queryByTestId('called-string')).toBeNull()
    expect(screen.queryByTestId('next-string')).toBeNull()
  })

  it('badges the string the note is asked for on', () => {
    installTouchInput(false)

    renderHero({ snapshot: playing({ stringIndex: 4 }) })

    const badge = screen.getByTestId('called-string')
    expect(badge).toHaveTextContent('5th · A')
    expect(badge).toHaveAccessibleName('5th string (A)')
  })

  it('shows it on the stage too', () => {
    installTouchInput(true)

    renderHero({ snapshot: playing({ stringIndex: 0 }), variant: 'stage' })

    expect(screen.getByTestId('called-string')).toHaveAccessibleName('1st string (e)')
  })

  /** The e2e page object reads this span, so it stays the bare note name. */
  it('keeps the next string beside the next note rather than inside it', () => {
    installTouchInput(false)

    renderHero({
      snapshot: {
        ...playing({ stringIndex: 4 }),
        nextNote: { pc: 7, display: 'G', audioKey: 'G', cycleStart: false, bagSize: 12, stringIndex: 2 },
      },
    })

    expect(screen.getByTestId('next-note')).toHaveTextContent('G')
    expect(screen.getByTestId('next-note').textContent).toBe('G')
    expect(screen.getByTestId('next-string')).toHaveAccessibleName('on the 3rd string (G)')
  })
})

describe('Hero coaching line', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('names the Space shortcut on a browser with no touch input', () => {
    installTouchInput(false)

    renderHero()

    expect(screen.getByTestId('playback-message')).toHaveTextContent(PLAYBACK_MESSAGES.idle)
  })

  it('drops the shortcut until there is a keyboard to press it with', () => {
    installTouchInput(true)

    renderHero()

    const line = screen.getByTestId('playback-message')
    expect(line).toHaveTextContent(PLAYBACK_MESSAGES.idleTouch)
    expect(line.textContent).not.toContain('Space')
  })

  it('passes every other machine message straight through', () => {
    installTouchInput(true)

    renderHero({ snapshot: { ...INITIAL_PLAYBACK_SNAPSHOT, message: PLAYBACK_MESSAGES.playing } })

    expect(screen.getByTestId('playback-message')).toHaveTextContent(PLAYBACK_MESSAGES.playing)
  })

  it('lets a routine block keep the line it asked for', () => {
    installTouchInput(true)

    renderHero({ message: 'Block 2 of 3 — string skipping' })

    expect(screen.getByTestId('playback-message')).toHaveTextContent('Block 2 of 3 — string skipping')
  })
})
