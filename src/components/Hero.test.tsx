import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Hero } from './Hero'
import { PLAYBACK_MESSAGES } from '../constants'
import { HOVER_FINE_QUERY } from '../hooks/useDisplayMode'
import { INITIAL_PLAYBACK_SNAPSHOT } from '../lib/playback/machine'

/** jsdom's own matchMedia never matches anything, so each test says what kind
 * of pointer the browser reports. */
const installMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === HOVER_FINE_QUERY && matches,
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

  it('names the Space shortcut on a hover-and-fine-pointer browser', () => {
    installMatchMedia(true)

    renderHero()

    expect(screen.getByTestId('playback-message')).toHaveTextContent(PLAYBACK_MESSAGES.idle)
  })

  it('drops the shortcut where there is no keyboard to press it with', () => {
    installMatchMedia(false)

    renderHero()

    const line = screen.getByTestId('playback-message')
    expect(line).toHaveTextContent(PLAYBACK_MESSAGES.idleTouch)
    expect(line.textContent).not.toContain('Space')
  })

  it('assumes touch where the browser cannot answer the query at all', () => {
    renderHero()

    expect(screen.getByTestId('playback-message')).toHaveTextContent(PLAYBACK_MESSAGES.idleTouch)
  })

  it('passes every other machine message straight through', () => {
    installMatchMedia(false)

    renderHero({ snapshot: { ...INITIAL_PLAYBACK_SNAPSHOT, message: PLAYBACK_MESSAGES.playing } })

    expect(screen.getByTestId('playback-message')).toHaveTextContent(PLAYBACK_MESSAGES.playing)
  })

  it('lets a routine block keep the line it asked for', () => {
    installMatchMedia(false)

    renderHero({ message: 'Block 2 of 3 — string skipping' })

    expect(screen.getByTestId('playback-message')).toHaveTextContent('Block 2 of 3 — string skipping')
  })
})
