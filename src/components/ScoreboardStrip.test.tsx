import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ScoreboardStrip } from './ScoreboardStrip'
import { STORAGE_KEYS } from '../constants'

const SCORES = [
  { nickname: 'ada', points: 300 },
  { nickname: 'bo', points: 120 },
  { nickname: 'cy', points: 40 },
]

type Extras = Partial<Pick<Parameters<typeof ScoreboardStrip>[0], 'nickname' | 'scores' | 'status' | 'notice'>>

const rail = (extras: Extras = {}) =>
  render(
    <ScoreboardStrip
      challenge="demo"
      nickname={null}
      scores={SCORES}
      status="ready"
      layout="rail"
      {...extras}
    />,
  )

const fold = (extras: Extras = {}) =>
  render(
    <ScoreboardStrip
      challenge="demo"
      nickname={null}
      scores={SCORES}
      status="ready"
      layout="fold"
      {...extras}
    />,
  )

afterEach(() => {
  window.localStorage.clear()
  document.body.style.overflow = ''
})

describe('the rail', () => {
  it('lists the board in the order it was given, ranked', () => {
    rail()

    const entries = document.querySelectorAll('.scoreboard-entry')
    expect(entries).toHaveLength(3)
    expect(entries[0]).toHaveTextContent('1ada300')
    expect(entries[2]).toHaveTextContent('3cy40')
  })

  it('is an ordered list, because a scoreboard is one', () => {
    rail()

    expect(document.querySelector('ol.scoreboard-list')).not.toBeNull()
  })

  /** Marked where it stands, never moved: a board that reorders is not a board. */
  it('marks your own row and nobody else’s', () => {
    rail({ nickname: 'bo' })

    const entries = document.querySelectorAll('.scoreboard-entry')
    expect(entries[0]).not.toHaveAttribute('data-you')
    expect(entries[1]).toHaveAttribute('data-you', 'true')
    expect(entries[2]).not.toHaveAttribute('data-you')
    // ...and says so in words as well as in fill, for anybody not reading the
    // colour.
    expect(entries[1]).toHaveTextContent('· you')
  })

  it('names the challenge, so a shared link is legible from the screen', () => {
    render(
      <ScoreboardStrip challenge="summer sprint" nickname={null} scores={[]} status="ready" layout="rail" />,
    )

    expect(screen.getByTestId('scoreboard')).toHaveAccessibleName('Scoreboard for summer sprint')
    expect(screen.getByTestId('scoreboard')).toHaveTextContent('summer sprint')
  })

  /** The board polls itself; without the dot a live board and a dead one look alike. */
  it('says it is live', () => {
    rail()

    expect(screen.getByTestId('scoreboard-live')).toHaveTextContent('live')
    expect(document.querySelector('.scoreboard-live-dot')).not.toBeNull()
  })

  it('says what an empty board means in each of the ways it can be empty', () => {
    const loading = rail({ scores: [], status: 'loading' })
    expect(screen.getByTestId('scoreboard-empty')).toHaveTextContent('Loading the board…')
    loading.unmount()

    const ready = rail({ scores: [], status: 'ready' })
    expect(screen.getByTestId('scoreboard-empty')).toHaveTextContent('No scores yet. Set the bar.')
    ready.unmount()

    rail({ scores: [], status: 'unavailable' })
    expect(screen.getByTestId('scoreboard-empty')).toHaveTextContent('Scoreboard unavailable')
  })

  /** A stale top ten says more than an empty one while the server is away. */
  it('keeps showing the board it has when the server has gone quiet', () => {
    rail({ status: 'unavailable' })

    expect(document.querySelectorAll('.scoreboard-entry')).toHaveLength(3)
    expect(screen.queryByTestId('scoreboard-empty')).toBeNull()
  })
})

describe('the nudge', () => {
  /** The row above you is the one you can catch; the leader is a number to give up at. */
  it('names the gap to the row above yours', () => {
    rail({ nickname: 'cy' })

    expect(screen.getByTestId('scoreboard-nudge')).toHaveTextContent('80 pts behind bo — keep going')
  })

  it('has something else to say to whoever is already top', () => {
    rail({ nickname: 'ada' })

    expect(screen.getByTestId('scoreboard-nudge')).toHaveTextContent('Top of the board — hold it.')
  })

  /** No row of your own is no gap to close, so there is nothing to say. */
  it('says nothing to somebody who is not on the board', () => {
    rail({ nickname: 'zed' })

    expect(screen.queryByTestId('scoreboard-nudge')).toBeNull()
  })
})

describe('folding the rail away', () => {
  it('collapses to a handle that still carries the challenge and your standing', () => {
    rail({ nickname: 'cy' })

    fireEvent.click(screen.getByTestId('scoreboard-hide'))

    const handle = screen.getByTestId('scoreboard-handle')
    expect(handle).toHaveTextContent('demo')
    expect(handle).toHaveTextContent('#3 · 40')
    expect(screen.queryByTestId('scoreboard')).toBeNull()
  })

  /** A rotated "#3 · 40" is a glance for a sighted reader and nothing for anybody else. */
  it('reads the whole standing out on the handle', () => {
    rail({ nickname: 'cy' })
    fireEvent.click(screen.getByTestId('scoreboard-hide'))

    expect(screen.getByTestId('scoreboard-handle')).toHaveAccessibleName(
      'Show the demo scoreboard — you are 3rd with 40 points',
    )
  })

  it('says only what it knows for somebody who is not on the board', () => {
    rail({ nickname: 'zed' })
    fireEvent.click(screen.getByTestId('scoreboard-hide'))

    expect(screen.getByTestId('scoreboard-handle')).toHaveAccessibleName('Show the demo scoreboard')
  })

  it('comes back on a tap', () => {
    rail()
    fireEvent.click(screen.getByTestId('scoreboard-hide'))
    fireEvent.click(screen.getByTestId('scoreboard-handle'))

    expect(screen.getByTestId('scoreboard')).toBeInTheDocument()
  })

  /** Per challenge: a board you dropped out of is not a board you are winning. */
  it('remembers the choice against the challenge it was made on', () => {
    const { unmount } = rail()
    fireEvent.click(screen.getByTestId('scoreboard-hide'))

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.challengeBoardHidden) ?? '{}')).toEqual({
      demo: true,
    })
    unmount()

    render(<ScoreboardStrip challenge="other" nickname={null} scores={SCORES} status="ready" layout="rail" />)
    expect(screen.getByTestId('scoreboard')).toBeInTheDocument()
  })

  it('opens folded again when that is what was stored', () => {
    window.localStorage.setItem(STORAGE_KEYS.challengeBoardHidden, JSON.stringify({ demo: true }))

    rail()

    expect(screen.getByTestId('scoreboard-handle')).toBeInTheDocument()
  })

  /** Whole-value rejection, as everything read through usePersistentState is. */
  it('opens expanded on a stored value that is not a map of booleans', () => {
    window.localStorage.setItem(STORAGE_KEYS.challengeBoardHidden, JSON.stringify({ demo: 'yes' }))

    rail()

    expect(screen.getByTestId('scoreboard')).toBeInTheDocument()
  })
})

describe('the fold', () => {
  it('is one line saying where you stand and who is next up', () => {
    fold({ nickname: 'cy' })

    const summary = screen.getByTestId('scoreboard-summary')
    expect(summary).toHaveTextContent('demo')
    expect(summary).toHaveTextContent('you #3 · 40')
    expect(summary).toHaveTextContent('bo +80')
  })

  /** Watching rather than playing: the number at the top is the only one that means anything. */
  it('shows the leader to somebody who is not on the board', () => {
    fold({ nickname: null })

    expect(screen.getByTestId('scoreboard-summary')).toHaveTextContent('ada · 300')
  })

  it('says what an empty board means, rather than nothing at all', () => {
    fold({ scores: [], status: 'ready' })

    expect(screen.getByTestId('scoreboard-summary')).toHaveTextContent('No scores yet. Set the bar.')
  })

  it('keeps the board itself behind a tap, and takes no column of the screen', () => {
    fold()

    expect(document.querySelectorAll('.scoreboard-entry')).toHaveLength(0)
    expect(screen.queryByTestId('scoreboard-sheet')).toBeNull()
  })

  it('unfolds into the same list and the same nudge', () => {
    fold({ nickname: 'cy' })

    fireEvent.click(screen.getByTestId('scoreboard-summary'))

    expect(document.querySelectorAll('.scoreboard-entry')).toHaveLength(3)
    expect(document.querySelector('.scoreboard-entry[data-you="true"]')).toHaveTextContent('cy')
    expect(screen.getByTestId('scoreboard-nudge')).toHaveTextContent('80 pts behind bo — keep going')
  })

  it('is a modal dialog while it is open, focus and all', () => {
    fold()
    fireEvent.click(screen.getByTestId('scoreboard-summary'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('closes three ways, and the strip is what comes back', () => {
    for (const close of [
      () => fireEvent.click(screen.getByTestId('scoreboard-sheet-close')),
      () => fireEvent.click(document.querySelector('.sheet-scrim')!),
      () => fireEvent.keyDown(window, { key: 'Escape' }),
    ]) {
      const { unmount } = fold()
      fireEvent.click(screen.getByTestId('scoreboard-summary'))
      expect(screen.getByTestId('scoreboard-sheet')).toBeInTheDocument()

      close()

      expect(screen.queryByTestId('scoreboard-sheet')).toBeNull()
      expect(screen.getByTestId('scoreboard-summary')).toBeInTheDocument()
      unmount()
    }
  })

  /** The hidden-rail preference is the rail's; the strip is always the folded state. */
  it('ignores a stored preference to hide the board', () => {
    window.localStorage.setItem(STORAGE_KEYS.challengeBoardHidden, JSON.stringify({ demo: true }))

    fold()

    expect(screen.getByTestId('scoreboard-summary')).toBeInTheDocument()
    expect(screen.queryByTestId('scoreboard-handle')).toBeNull()
  })
})

describe('the notice line', () => {
  /**
   * An expired session, a name this browser does not own, a rate limit: all
   * three leave the board readable, and all three are worth saying rather than
   * letting the player's row quietly stop moving.
   */
  it('says why this browser has stopped scoring, without hiding the board', () => {
    rail({ nickname: 'bo', notice: 'That run timed out.' })

    const notice = screen.getByTestId('scoreboard-notice')
    expect(notice).toHaveTextContent('That run timed out.')
    expect(notice).toHaveAttribute('role', 'status')
    expect(document.querySelectorAll('.scoreboard-entry')).toHaveLength(3)
  })

  /** A folded board that swallowed the reason it had stopped moving would be worse than none. */
  it('stays on screen beside the folded strip too', () => {
    fold({ nickname: 'bo', notice: 'That run timed out.' })

    expect(screen.getByTestId('scoreboard-notice')).toHaveTextContent('That run timed out.')
  })

  it('is absent when there is nothing to say', () => {
    rail()

    expect(screen.queryByTestId('scoreboard-notice')).toBeNull()
  })
})
