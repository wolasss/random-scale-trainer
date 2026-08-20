import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MicReadout } from './MicReadout'

describe('MicReadout', () => {
  it('names the note it is hearing', () => {
    render(<MicReadout status="listening" score={null} heard={{ pitchClass: 9 }} spelling="sharp" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('A')
  })

  it('shows a flat name to a player who asked for flats', () => {
    render(<MicReadout status="listening" score={null} heard={{ pitchClass: 1 }} spelling="flat" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('D♭')
  })

  it('spells mixed as sharps — there is no note being called to follow', () => {
    render(<MicReadout status="listening" score={null} heard={{ pitchClass: 1 }} spelling="mixed" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('C♯')
  })

  /**
   * The whole point of the readout is to tell the player they hit it. Naming
   * the same fret differently from the call is the one way to fail at that.
   */
  it('names a note that matches the call exactly as the call named it', () => {
    render(
      <MicReadout
        status="listening" score={null}
        heard={{ pitchClass: 3 }}
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
        status="listening" score={null}
        heard={{ pitchClass: 6 }}
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
        status="listening" score={null}
        heard={{ pitchClass: 3 }}
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
        status="listening" score={null}
        heard={{ pitchClass: 5 }}
        spelling="sharp"
        called={{ pc: 3, display: 'E♭' }}
      />,
    )

    expect(screen.getByTestId('heard-note')).toHaveAttribute('data-match', 'false')
    expect(screen.getByTestId('heard-verdict')).toHaveAccessibleName('F — not the note called, E♭')
  })

  it('judges nothing while no note is being called', () => {
    render(<MicReadout status="listening" score={null} heard={{ pitchClass: 5 }} spelling="sharp" called={null} />)

    // A count-in has a note on its way and none on screen. There is nothing to
    // be right or wrong about yet, and a cross would be a lie.
    expect(screen.queryByTestId('heard-verdict')).toBeNull()
    expect(screen.getByTestId('heard-note')).not.toHaveAttribute('data-match')
  })

  // This app calls note names to be found on the neck. How sharp the string was
  // is a tuner's business, and a second reading to parse is a cost with no use.
  it('says nothing about how in tune the note was', () => {
    render(
      <MicReadout
        status="listening" score={null}
        heard={{ pitchClass: 3 }}
        spelling="sharp"
        called={{ pc: 3, display: 'E♭' }}
      />,
    )

    expect(screen.getByTestId('heard-note')).toHaveTextContent('E♭')
    expect(screen.getByTestId('heard-note')).not.toHaveTextContent('cents')
    expect(screen.getByTestId('heard-note')).not.toHaveTextContent('tune')
  })

  it('says so when it is listening and has heard nothing yet', () => {
    render(<MicReadout status="listening" score={null} heard={null} spelling="sharp" called={null} />)

    // The difference between a mic that is off and a mic that hears silence is
    // the whole reason this line exists.
    expect(screen.getByTestId('heard-note')).toHaveTextContent('nothing yet')
  })

  it('says the microphone is blocked', () => {
    render(<MicReadout status="denied" score={null} heard={null} spelling="sharp" called={null} />)

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Mic blocked')
    expect(screen.queryByTestId('heard-note')).toBeNull()
  })

  it('says the browser cannot listen at all', () => {
    render(<MicReadout status="unsupported" score={null} heard={null} spelling="sharp" called={null} />)

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('no microphone')
  })

  it('says listening waits for playback', () => {
    render(<MicReadout status="idle" score={null} heard={null} spelling="sharp" called={null} />)

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Listening starts with playback.')
  })

  describe('the score line', () => {
    const props = { status: 'listening', heard: null, spelling: 'sharp', called: null } as const
    /** A session with a tally but nothing earned, for the accuracy assertions. */
    const NO_POINTS = { points: 0, streak: 0, bonuses: [] }

    it('stays out until there is something to report', () => {
      // A session that has not scored a note yet is a session that is starting,
      // not one that is going badly.
      render(<MicReadout {...props} score={{ lastVerdict: null, hits: 0, scored: 0, ...NO_POINTS }} />)

      expect(screen.queryByTestId('score-verdict')).toBeNull()
      expect(screen.queryByTestId('score-tally')).toBeNull()
    })

    it('stays out entirely when nothing is being scored', () => {
      render(<MicReadout {...props} score={null} />)

      expect(screen.queryByTestId('score-tally')).toBeNull()
    })

    /**
     * Stopping playback closes the microphone, and a session that has just
     * stopped is the one someone actually wants the number from.
     */
    it('keeps the session count up once the microphone has closed', () => {
      render(<MicReadout {...props} status="idle" score={{ lastVerdict: null, hits: 2, scored: 3, ...NO_POINTS }} />)

      expect(screen.getByTestId('score-tally')).toHaveTextContent('2/3')
      expect(screen.getByTestId('mic-readout')).toHaveTextContent('Listening starts with playback.')
    })

    it('drops the last note’s verdict once the microphone has closed', () => {
      // It answers the note that was on screen when it was played, and a
      // stopped session has no such note to answer.
      render(
        <MicReadout {...props} status="idle" score={{ lastVerdict: { hit: false, responseMs: null }, hits: 2, scored: 3, ...NO_POINTS }} />,
      )

      expect(screen.queryByTestId('score-verdict')).toBeNull()
      expect(screen.getByTestId('score-tally')).toHaveTextContent('2/3')
    })

    it('stays out while the microphone has nothing to report either way', () => {
      render(<MicReadout {...props} status="denied" score={{ lastVerdict: null, hits: 0, scored: 0, ...NO_POINTS }} />)

      expect(screen.queryByTestId('score-tally')).toBeNull()
    })

    it('reports a hit and how long it took', () => {
      render(
        <MicReadout {...props} score={{ lastVerdict: { hit: true, responseMs: 320 }, hits: 1, scored: 1, ...NO_POINTS }} />,
      )

      expect(screen.getByTestId('score-verdict')).toHaveTextContent('0.32 s')
      expect(screen.getByTestId('score-verdict')).toHaveAttribute('data-hit', 'true')
      expect(screen.getByTestId('score-verdict')).toHaveAccessibleName('Played it in 0.32 seconds')
    })

    it('reports a note that never came', () => {
      render(
        <MicReadout {...props} score={{ lastVerdict: { hit: false, responseMs: null }, hits: 0, scored: 1, ...NO_POINTS }} />,
      )

      expect(screen.getByTestId('score-verdict')).toHaveTextContent('missed')
      expect(screen.getByTestId('score-verdict')).toHaveAttribute('data-hit', 'false')
      expect(screen.getByTestId('score-verdict')).toHaveAccessibleName('Not played in time')
    })

    it('counts the session as hits out of notes scored', () => {
      render(<MicReadout {...props} score={{ lastVerdict: null, hits: 2, scored: 3, ...NO_POINTS }} />)

      expect(screen.getByTestId('score-tally')).toHaveTextContent('2/3')
      expect(screen.getByTestId('score-tally')).toHaveTextContent('67%')
    })

    it('shows the points beside the accuracy rather than instead of it', () => {
      render(
        <MicReadout {...props} score={{ lastVerdict: null, hits: 3, scored: 3, points: 40, streak: 3, bonuses: [] }} />,
      )

      expect(screen.getByTestId('score-points')).toHaveTextContent('40 pts')
      expect(screen.getByTestId('score-tally')).toHaveTextContent('3/3')
    })

    it('shows the run once there is one, and its reading says what it counts', () => {
      render(
        <MicReadout {...props} score={{ lastVerdict: null, hits: 4, scored: 4, points: 55, streak: 4, bonuses: [] }} />,
      )

      expect(screen.getByTestId('score-points')).toHaveTextContent('×4')
      expect(screen.getByTestId('score-points')).toHaveAccessibleName('55 points, 4 in a row')
    })

    it('keeps the run out until one note has become two', () => {
      render(
        <MicReadout {...props} score={{ lastVerdict: null, hits: 1, scored: 1, points: 10, streak: 1, bonuses: [] }} />,
      )

      expect(screen.getByTestId('score-points')).not.toHaveTextContent('×')
      expect(screen.getByTestId('score-points')).toHaveAccessibleName('10 points')
    })

    it('names the bonus the last note earned', () => {
      render(
        <MicReadout
          {...props}
          score={{
            lastVerdict: { hit: true, responseMs: 320 },
            hits: 3,
            scored: 3,
            points: 45,
            streak: 3,
            bonuses: [{ kind: 'streak', points: 5 }],
          }}
        />,
      )

      expect(screen.getByTestId('score-bonus')).toHaveTextContent('+5 streak')
    })

    it('names the octaves bonus as two octaves, not two places on the neck', () => {
      render(
        <MicReadout
          {...props}
          score={{
            lastVerdict: { hit: true, responseMs: 320 },
            hits: 2,
            scored: 2,
            points: 35,
            streak: 2,
            bonuses: [{ kind: 'octaves', points: 15 }],
          }}
        />,
      )

      expect(screen.getByTestId('score-bonus')).toHaveTextContent('+15 two octaves')
    })

    it('keeps the points out while there is nothing scored to add them to', () => {
      render(<MicReadout {...props} score={{ lastVerdict: null, hits: 0, scored: 0, ...NO_POINTS }} />)

      expect(screen.queryByTestId('score-points')).toBeNull()
      expect(screen.queryByTestId('score-bonus')).toBeNull()
    })

    it('keeps the points up once the microphone has closed', () => {
      render(
        <MicReadout
          {...props}
          status="idle"
          score={{ lastVerdict: null, hits: 2, scored: 3, points: 25, streak: 2, bonuses: [] }}
        />,
      )

      expect(screen.getByTestId('score-points')).toHaveAccessibleName('25 points, 2 in a row')
    })
  })
})
