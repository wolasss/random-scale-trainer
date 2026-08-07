import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, STANDALONE_QUERY } from './hooks/useDisplayMode'

vi.mock('./lib/audio/engine', () => ({
  AudioEngine: class FakeAudioEngine {
    async ensureContext() {
      return {}
    }
    async loadNoteBuffers() {}
    hasBuffers() {
      return true
    }
    getCurrentTime() {
      return performance.now() / 1000
    }
    playClickAt() {}
    playNoteAt() {}
    playSessionEndChime() {}
    stopScheduledSounds() {}
  },
}))

/**
 * The installed-on-a-stand reading is gated on two media queries, so it can only
 * be exercised by answering them. jsdom's own matchMedia always says false —
 * which is exactly why the desktop layout is safe from all of this.
 */
const installMatchMedia = (matching: Record<string, boolean>) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: matching[query] ?? false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
}

const PHONE_PORTRAIT = {
  [STANDALONE_QUERY]: true,
  [COARSE_POINTER_QUERY]: true,
  [LANDSCAPE_QUERY]: false,
}

const PHONE_LANDSCAPE = { ...PHONE_PORTRAIT, [LANDSCAPE_QUERY]: true }

describe('the stand reading', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(window, 'matchMedia')
    document.documentElement.removeAttribute('data-stage')
  })

  it('leaves the desktop layout completely alone', () => {
    installMatchMedia({})
    render(<App />)

    expect(document.querySelector('.app-grid')).not.toBeNull()
    expect(document.querySelector('.stage')).toBeNull()
    expect(document.documentElement.hasAttribute('data-stage')).toBe(false)
    // The cards are all on the page, exactly where they have always been.
    expect(screen.getByTestId('bpm-value')).toBeInTheDocument()
    expect(screen.queryByTestId('open-setup')).toBeNull()
  })

  it('marks the document so the stylesheet and the tree agree', () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    expect(document.documentElement.hasAttribute('data-stage')).toBe(true)
    expect(document.querySelector('.stage')).not.toBeNull()
    expect(document.querySelector('.app-grid')).toBeNull()
  })

  it('leads with the note and puts the setup behind one button', () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    expect(screen.getByTestId('now-playing')).toBeInTheDocument()
    expect(screen.getByTestId('next-note')).toBeInTheDocument()
    expect(screen.getByTestId('beat-dots')).toBeInTheDocument()
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')

    // Pre-flight choices do not compete with the note.
    expect(screen.getByTestId('open-setup')).toBeInTheDocument()
    expect(screen.queryByTestId('bpm-value')).toBeNull()
    expect(screen.queryByTestId('practice-sheet')).toBeNull()
  })

  it('brings tempo, notes, options and routine back on demand', () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    fireEvent.click(screen.getByTestId('open-setup'))

    expect(screen.getByTestId('practice-sheet')).toBeInTheDocument()
    expect(screen.getByTestId('bpm-value')).toHaveTextContent('72')
    expect(screen.getByTestId('note-every')).toBeInTheDocument()
    expect(screen.getByTestId('preset-select')).toBeInTheDocument()
    expect(document.getElementById('continuous-mode')).toBeInTheDocument()
    expect(screen.getByTestId('session-goal')).toBeInTheDocument()
  })

  it('closes on the close button and on Escape', () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    fireEvent.click(screen.getByTestId('open-setup'))
    fireEvent.click(screen.getByTestId('practice-sheet-close'))
    expect(screen.queryByTestId('practice-sheet')).toBeNull()

    fireEvent.click(screen.getByTestId('open-setup'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('practice-sheet')).toBeNull()
  })

  it('hands focus back to the setup button when the sheet closes', () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    const openSetup = screen.getByTestId('open-setup')
    openSetup.focus()
    fireEvent.click(openSetup)
    expect(document.activeElement).toBe(screen.getByTestId('practice-sheet-close'))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(openSetup)

    openSetup.focus()
    fireEvent.click(openSetup)
    fireEvent.click(screen.getByTestId('practice-sheet-close'))
    expect(document.activeElement).toBe(openSetup)
  })

  it('keeps Tab inside the sheet instead of walking into the transport', () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    fireEvent.click(screen.getByTestId('open-setup'))

    const sheet = document.querySelector<HTMLElement>('.sheet')
    expect(sheet).not.toBeNull()
    const focusable = Array.from(
      sheet!.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'),
    ).filter((element) => element.tabIndex >= 0)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    expect(first).toBe(screen.getByTestId('practice-sheet-close'))
    expect(last).not.toBe(first)

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('gives the page back its scroll when the sheet closes', () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    fireEvent.click(screen.getByTestId('open-setup'))
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByTestId('practice-sheet-close'))
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('still starts, counts in and calls notes', async () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {})

    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')

    await act(async () => {
      // Default 72 BPM: four count-in beats of 60/72s, then the first note.
      vi.advanceTimersByTime(4 * (60_000 / 72) + 200)
    })

    expect(screen.getByTestId('current-note').textContent).toMatch(/^[A-G][♯♭]?$/)
  })

  it('keeps the neck beside the note in landscape and in the sheet in portrait', () => {
    installMatchMedia(PHONE_LANDSCAPE)
    const landscape = render(<App />)

    expect(document.querySelector('.stage-side')).not.toBeNull()
    expect(document.querySelector('.stage-side .fretboard')).not.toBeNull()
    landscape.unmount()

    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    // Portrait has no room for it beside the glyph, so it goes back to setup.
    expect(document.querySelector('.stage-side')).toBeNull()
    expect(document.querySelector('.fretboard')).toBeNull()

    fireEvent.click(screen.getByTestId('open-setup'))
    expect(document.querySelector('.fretboard')).not.toBeNull()
  })

  it('keeps the routine strip above the transport', () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    fireEvent.click(screen.getByTestId('open-setup'))
    const firstRoutine = document.querySelector<HTMLButtonElement>('.routine-chip-body')
    expect(firstRoutine).not.toBeNull()
    fireEvent.click(firstRoutine!)
    fireEvent.click(screen.getByTestId('practice-sheet-close'))

    const strip = document.querySelector('.stage-foot .routine-strip')
    expect(strip).not.toBeNull()
  })
})
