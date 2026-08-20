import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScoreboardStrip } from './ScoreboardStrip'

const SCORES = [
  { nickname: 'ada', points: 300 },
  { nickname: 'bo', points: 120 },
  { nickname: 'cy', points: 40 },
]

describe('ScoreboardStrip', () => {
  it('lists the board in the order it was given, ranked', () => {
    render(<ScoreboardStrip challenge="demo" nickname={null} scores={SCORES} status="ready" />)

    const entries = document.querySelectorAll('.scoreboard-entry')
    expect(entries).toHaveLength(3)
    expect(entries[0]).toHaveTextContent('1ada300')
    expect(entries[2]).toHaveTextContent('3cy40')
  })

  it('is an ordered list, because a scoreboard is one', () => {
    render(<ScoreboardStrip challenge="demo" nickname={null} scores={SCORES} status="ready" />)

    expect(document.querySelector('ol.scoreboard-list')).not.toBeNull()
  })

  /** Marked where it stands, never moved: a board that reorders is not a board. */
  it('marks your own row and nobody else’s', () => {
    render(<ScoreboardStrip challenge="demo" nickname="bo" scores={SCORES} status="ready" />)

    const entries = document.querySelectorAll('.scoreboard-entry')
    expect(entries[0]).not.toHaveAttribute('data-you')
    expect(entries[1]).toHaveAttribute('data-you', 'true')
    expect(entries[2]).not.toHaveAttribute('data-you')
  })

  it('names the challenge, so a shared link is legible from the screen', () => {
    render(<ScoreboardStrip challenge="summer sprint" nickname={null} scores={[]} status="ready" />)

    expect(screen.getByTestId('scoreboard')).toHaveAccessibleName('Scoreboard for summer sprint')
    expect(screen.getByTestId('scoreboard')).toHaveTextContent('summer sprint')
  })

  it('says what an empty board means in each of the ways it can be empty', () => {
    const loading = render(<ScoreboardStrip challenge="demo" nickname={null} scores={[]} status="loading" />)
    expect(screen.getByTestId('scoreboard-empty')).toHaveTextContent('Loading the board…')
    loading.unmount()

    const ready = render(<ScoreboardStrip challenge="demo" nickname={null} scores={[]} status="ready" />)
    expect(screen.getByTestId('scoreboard-empty')).toHaveTextContent('Nobody has scored yet')
    ready.unmount()

    render(<ScoreboardStrip challenge="demo" nickname={null} scores={[]} status="unavailable" />)
    expect(screen.getByTestId('scoreboard-empty')).toHaveTextContent('Scoreboard unavailable')
  })

  /** A stale top ten says more than an empty one while the server is away. */
  it('keeps showing the board it has when the server has gone quiet', () => {
    render(<ScoreboardStrip challenge="demo" nickname={null} scores={SCORES} status="unavailable" />)

    expect(document.querySelectorAll('.scoreboard-entry')).toHaveLength(3)
    expect(screen.queryByTestId('scoreboard-empty')).toBeNull()
  })
})
