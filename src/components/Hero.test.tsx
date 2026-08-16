import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Hero } from './Hero'
import { PLAYBACK_MESSAGES } from '../constants'
import { TOUCH_INPUT_QUERY } from '../hooks/useHardwareKeyboard'
import { INITIAL_PLAYBACK_SNAPSHOT } from '../lib/playback/machine'

/** jsdom's own matchMedia never matches anything, so each test says whether the
 * browser reports a touchscreen among its inputs. */
const installMatchMedia = (touchInput: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === TOUCH_INPUT_QUERY && touchInput,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
}

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

describe('Hero coaching line', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('names the Space shortcut on a browser with no touch input', () => {
    installMatchMedia(false)

    renderHero()

    expect(screen.getByTestId('playback-message')).toHaveTextContent(PLAYBACK_MESSAGES.idle)
  })

  it('drops the shortcut until there is a keyboard to press it with', () => {
    installMatchMedia(true)

    renderHero()

    const line = screen.getByTestId('playback-message')
    expect(line).toHaveTextContent(PLAYBACK_MESSAGES.idleTouch)
    expect(line.textContent).not.toContain('Space')
  })

  it('passes every other machine message straight through', () => {
    installMatchMedia(true)

    renderHero({ snapshot: { ...INITIAL_PLAYBACK_SNAPSHOT, message: PLAYBACK_MESSAGES.playing } })

    expect(screen.getByTestId('playback-message')).toHaveTextContent(PLAYBACK_MESSAGES.playing)
  })

  it('lets a routine block keep the line it asked for', () => {
    installMatchMedia(true)

    renderHero({ message: 'Block 2 of 3 — string skipping' })

    expect(screen.getByTestId('playback-message')).toHaveTextContent('Block 2 of 3 — string skipping')
  })
})
