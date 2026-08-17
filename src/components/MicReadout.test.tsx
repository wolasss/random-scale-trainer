import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MicReadout } from './MicReadout'

describe('MicReadout', () => {
  it('names the note it is hearing and how far off it is', () => {
    render(<MicReadout status="listening" heard={{ pitchClass: 9, cents: 7.4 }} spelling="sharp" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('A')
    expect(screen.getByTestId('heard-note')).toHaveTextContent('7 cents sharp')
  })

  it('shows a flat name to a player who asked for flats', () => {
    render(<MicReadout status="listening" heard={{ pitchClass: 1, cents: -12 }} spelling="flat" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('D♭')
    expect(screen.getByTestId('heard-note')).toHaveTextContent('12 cents flat')
  })

  it('spells mixed as sharps — there is no note being called to follow', () => {
    render(<MicReadout status="listening" heard={{ pitchClass: 1, cents: 0 }} spelling="mixed" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('C♯')
  })

  /**
   * The whole point of the readout is to tell the player they hit it. Naming
   * the same fret differently from the call is the one way to fail at that.
   */
  it('names a note that matches the call exactly as the call named it', () => {
    render(
      <MicReadout
        status="listening"
        heard={{ pitchClass: 3, cents: 4 }}
        spelling="mixed"
        called={{ pc: 3, display: 'E♭' }}
      />,
    )

    expect(screen.getByTestId('heard-note')).toHaveTextContent('E♭')
    expect(screen.getByTestId('heard-note')).not.toHaveTextContent('D♯')
  })

  it('falls back to the preference for a note that is not the one called', () => {
    render(
      <MicReadout
        status="listening"
        heard={{ pitchClass: 6, cents: 0 }}
        spelling="flat"
        called={{ pc: 3, display: 'E♭' }}
      />,
    )

    expect(screen.getByTestId('heard-note')).toHaveTextContent('G♭')
  })

  /**
   * The verdict has to survive a player who cannot tell the two colours apart,
   * so it is carried by the glyph and by a label — the colour only agrees.
   */
  it('marks a note that matches the call as a hit', () => {
    render(
      <MicReadout
        status="listening"
        heard={{ pitchClass: 3, cents: 2 }}
        spelling="sharp"
        called={{ pc: 3, display: 'E♭' }}
      />,
    )

    expect(screen.getByTestId('heard-note')).toHaveAttribute('data-match', 'true')
    expect(screen.getByTestId('heard-verdict')).toHaveAccessibleName('E♭ — the note called')
  })

  it('marks anything else as a miss, and says what was asked for', () => {
    render(
      <MicReadout
        status="listening"
        heard={{ pitchClass: 5, cents: 2 }}
        spelling="sharp"
        called={{ pc: 3, display: 'E♭' }}
      />,
    )

    expect(screen.getByTestId('heard-note')).toHaveAttribute('data-match', 'false')
    expect(screen.getByTestId('heard-verdict')).toHaveAccessibleName('F — not the note called, E♭')
    // "F, in tune" under a call for E♭ is a right answer to a question nobody
    // asked. The miss is the whole of the news.
    expect(screen.getByTestId('heard-note')).not.toHaveTextContent('in tune')
  })

  it('judges nothing while no note is being called', () => {
    render(<MicReadout status="listening" heard={{ pitchClass: 5, cents: 2 }} spelling="sharp" called={null} />)

    // A count-in has a note on its way and none on screen. There is nothing to
    // be right or wrong about yet, and a cross would be a lie.
    expect(screen.queryByTestId('heard-verdict')).toBeNull()
    expect(screen.getByTestId('heard-note')).not.toHaveAttribute('data-match')
  })

  it('calls a note inside the tolerance in tune rather than counting cents at it', () => {
    render(<MicReadout status="listening" heard={{ pitchClass: 4, cents: -0.4 }} spelling="sharp" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('in tune')
    expect(screen.getByTestId('heard-note')).not.toHaveTextContent('cents')
  })

  it('says so when it is listening and has heard nothing yet', () => {
    render(<MicReadout status="listening" heard={null} spelling="sharp" called={null} />)

    // The difference between a mic that is off and a mic that hears silence is
    // the whole reason this line exists.
    expect(screen.getByTestId('heard-note')).toHaveTextContent('nothing yet')
  })

  it('says the microphone is blocked', () => {
    render(<MicReadout status="denied" heard={null} spelling="sharp" called={null} />)

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Mic blocked')
    expect(screen.queryByTestId('heard-note')).toBeNull()
  })

  it('says the browser cannot listen at all', () => {
    render(<MicReadout status="unsupported" heard={null} spelling="sharp" called={null} />)

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('no microphone')
  })

  it('says listening waits for playback', () => {
    render(<MicReadout status="idle" heard={null} spelling="sharp" called={null} />)

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Listening starts with playback.')
  })
})
