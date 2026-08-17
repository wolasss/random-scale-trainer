import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MicReadout } from './MicReadout'

describe('MicReadout', () => {
  it('names the note it is hearing and how far off it is', () => {
    render(<MicReadout status="listening" heard={{ pitchClass: 9, cents: 7.4 }} spelling="sharp" />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('A')
    expect(screen.getByTestId('heard-note')).toHaveTextContent('+7 cents')
  })

  it('shows a flat name to a player who asked for flats', () => {
    render(<MicReadout status="listening" heard={{ pitchClass: 1, cents: -12 }} spelling="flat" />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('D♭')
    expect(screen.getByTestId('heard-note')).toHaveTextContent('-12 cents')
  })

  it('spells mixed as sharps — there is no note being called to follow', () => {
    render(<MicReadout status="listening" heard={{ pitchClass: 1, cents: 0 }} spelling="mixed" />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('C♯')
  })

  it('never reads a note a hair flat as minus nothing', () => {
    render(<MicReadout status="listening" heard={{ pitchClass: 4, cents: -0.4 }} spelling="sharp" />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('0 cents')
    expect(screen.getByTestId('heard-note')).not.toHaveTextContent('-0 cents')
  })

  it('says so when it is listening and hearing nothing', () => {
    render(<MicReadout status="listening" heard={null} spelling="sharp" />)

    // The difference between a mic that is off and a mic that hears silence is
    // the whole reason this line exists.
    expect(screen.getByTestId('heard-note')).toHaveTextContent('no pitch')
  })

  it('says the microphone is blocked', () => {
    render(<MicReadout status="denied" heard={null} spelling="sharp" />)

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Mic blocked')
    expect(screen.queryByTestId('heard-note')).toBeNull()
  })

  it('says the browser cannot listen at all', () => {
    render(<MicReadout status="unsupported" heard={null} spelling="sharp" />)

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('no microphone')
  })

  it('says listening waits for playback', () => {
    render(<MicReadout status="idle" heard={null} spelling="sharp" />)

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Listening starts with playback.')
  })
})
