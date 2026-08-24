import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MicReadout } from './MicReadout'

/** The heard-note line is about a session in progress, so it is playing. */
const heardProps = { isPlaying: true, isPaused: false, score: null } as const

describe('MicReadout', () => {
  it('names the note it is hearing', () => {
    render(<MicReadout status="listening" {...heardProps} heard={{ pitchClass: 9 }} spelling="sharp" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('A')
  })

  it('shows a flat name to a player who asked for flats', () => {
    render(<MicReadout status="listening" {...heardProps} heard={{ pitchClass: 1 }} spelling="flat" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('D♭')
  })

  it('spells mixed as sharps — there is no note being called to follow', () => {
    render(<MicReadout status="listening" {...heardProps} heard={{ pitchClass: 1 }} spelling="mixed" called={null} />)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('C♯')
  })

  /**
   * The whole point of the readout is to tell the player they hit it. Naming
   * the same fret differently from the call is the one way to fail at that.
   */
  it('names a note that matches the call exactly as the call named it', () => {
    render(
      <MicReadout
        status="listening" {...heardProps}
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
        status="listening" {...heardProps}
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
        status="listening" {...heardProps}
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
        status="listening" {...heardProps}
        heard={{ pitchClass: 5 }}
        spelling="sharp"
        called={{ pc: 3, display: 'E♭' }}
      />,
    )

    expect(screen.getByTestId('heard-note')).toHaveAttribute('data-match', 'false')
    expect(screen.getByTestId('heard-verdict')).toHaveAccessibleName('F — not the note called, E♭')
  })

  it('judges nothing while no note is being called', () => {
    render(<MicReadout status="listening" {...heardProps} heard={{ pitchClass: 5 }} spelling="sharp" called={null} />)

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
        status="listening" {...heardProps}
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
    render(<MicReadout status="listening" {...heardProps} heard={null} spelling="sharp" called={null} />)

    // The difference between a mic that is off and a mic that hears silence is
    // the whole reason this line exists.
    expect(screen.getByTestId('heard-note')).toHaveTextContent('nothing yet')
  })

  it('says the microphone is blocked', () => {
    render(
      <MicReadout status="denied" isPlaying={false} isPaused={false} score={null} heard={null} spelling="sharp" called={null} />,
    )

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Mic blocked')
    expect(screen.queryByTestId('heard-note')).toBeNull()
  })

  it('says the browser cannot listen at all', () => {
    render(
      <MicReadout
        status="unsupported"
        isPlaying={false}
        isPaused={false}
        score={null}
        heard={null}
        spelling="sharp"
        called={null}
      />,
    )

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('no microphone')
  })

  it('says listening waits for playback', () => {
    render(
      <MicReadout status="idle" isPlaying={false} isPaused={false} score={null} heard={null} spelling="sharp" called={null} />,
    )

    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Listening starts with playback.')
  })

  /**
   * Mid-phrase there is one glance to spend and the note on screen has first
   * claim on it, so the score is down to the total and what just landed on it.
   */
  describe('while playing', () => {
    const props = { status: 'listening', isPlaying: true, isPaused: false, heard: null, spelling: 'sharp', called: null } as const
    /** A session with a tally and nothing earned on the last note. */
    const QUIET = { points: 0, bestStreak: 0, bonuses: [], multiplier: 1 }

    it('stays out until there is something to report', () => {
      // A session that has not scored a note yet is a session that is starting,
      // not one that is going badly.
      render(<MicReadout {...props} score={{ lastVerdict: null, hits: 0, scored: 0, ...QUIET }} />)

      expect(screen.queryByTestId('score-play')).toBeNull()
      expect(screen.queryByTestId('score-points')).toBeNull()
    })

    it('stays out entirely when nothing is being scored', () => {
      render(<MicReadout {...props} score={null} />)

      expect(screen.queryByTestId('score-play')).toBeNull()
    })

    it('shows the session total, named for anyone who cannot read it by its size', () => {
      render(
        <MicReadout
          {...props}
          score={{ lastVerdict: null, hits: 18, scored: 21, points: 896, bestStreak: 5, bonuses: [], multiplier: 1 }}
        />,
      )

      expect(screen.getByTestId('score-points')).toHaveTextContent('896')
      expect(screen.getByTestId('score-points')).toHaveAccessibleName('896 points')
    })

    it('shows what the last note put on the total', () => {
      // A hit at ×1 is 10, and the streak bonus beside it was banked as 5.
      render(
        <MicReadout
          {...props}
          score={{
            lastVerdict: { hit: true, responseMs: 320 },
            hits: 3,
            scored: 3,
            points: 45,
            bestStreak: 3,
            bonuses: [{ kind: 'streak', points: 5 }],
            multiplier: 1,
          }}
        />,
      )

      expect(screen.getByTestId('score-delta')).toHaveTextContent('+15')
      expect(screen.getByTestId('score-delta')).toHaveAccessibleName('plus 15 points')
    })

    /** The figure is the whole of the news; the word behind it is not. */
    it('replaces the named bonus strings with the figure they added up to', () => {
      render(
        <MicReadout
          {...props}
          score={{
            lastVerdict: { hit: true, responseMs: 320 },
            hits: 2,
            scored: 2,
            points: 35,
            bestStreak: 2,
            bonuses: [{ kind: 'octaves', points: 15 }],
            multiplier: 1,
          }}
        />,
      )

      expect(screen.getByTestId('score-delta')).toHaveTextContent('+25')
      expect(screen.getByTestId('mic-readout')).not.toHaveTextContent('two octaves')
      expect(screen.getByTestId('mic-readout')).not.toHaveTextContent('streak')
    })

    it('prices the note at what its call was priced at', () => {
      // ×1.38 makes the hit 14, and the streak bonus was banked as 7.
      render(
        <MicReadout
          {...props}
          score={{
            lastVerdict: { hit: true, responseMs: 320 },
            hits: 3,
            scored: 3,
            points: 49,
            bestStreak: 3,
            bonuses: [{ kind: 'streak', points: 7 }],
            multiplier: 1.38,
          }}
        />,
      )

      expect(screen.getByTestId('score-delta')).toHaveTextContent('+21')
    })

    it('says nothing for a note that earned nothing', () => {
      render(
        <MicReadout
          {...props}
          score={{ lastVerdict: { hit: false, responseMs: null }, hits: 0, scored: 1, ...QUIET }}
        />,
      )

      // "+0" is not news, and a miss is already told by the heard line above.
      expect(screen.queryByTestId('score-delta')).toBeNull()
      expect(screen.getByTestId('score-points')).toHaveTextContent('0')
    })

    /**
     * A milestone belongs to the clock rather than to a note, but it is banked
     * in the total beside it, so it has to be visible in the same reading.
     */
    it('counts a practice milestone into the delta beside the total', () => {
      render(
        <MicReadout
          {...props}
          score={{
            lastVerdict: { hit: false, responseMs: null },
            hits: 4,
            scored: 8,
            points: 190,
            bestStreak: 2,
            bonuses: [{ kind: 'practice30', points: 150 }],
            multiplier: 1,
          }}
        />,
      )

      expect(screen.getByTestId('score-delta')).toHaveTextContent('+150')
    })

    /** Three readings, and the other three wait for a pause. */
    it('keeps the multiplier, the run and the accuracy off the row', () => {
      render(
        <MicReadout
          {...props}
          score={{
            lastVerdict: { hit: true, responseMs: 320 },
            hits: 18,
            scored: 21,
            points: 896,
            bestStreak: 5,
            bonuses: [],
            multiplier: 1.32,
          }}
        />,
      )

      expect(screen.queryByTestId('score-multiplier')).toBeNull()
      expect(screen.queryByTestId('score-streak')).toBeNull()
      expect(screen.queryByTestId('score-tally')).toBeNull()
      expect(screen.queryByTestId('score-summary')).toBeNull()
      expect(screen.getByTestId('mic-readout')).not.toHaveTextContent('×')
      expect(screen.getByTestId('mic-readout')).not.toHaveTextContent('in a row')
      expect(screen.getByTestId('mic-readout')).not.toHaveTextContent('86%')
    })

    it('never shows the board line while there is playing to do', () => {
      render(
        <MicReadout
          {...props}
          board={{ leading: false, leader: 'ada', gap: 120 }}
          score={{ lastVerdict: null, hits: 3, scored: 3, points: 30, bestStreak: 3, bonuses: [], multiplier: 1 }}
        />,
      )

      expect(screen.queryByTestId('score-nudge')).toBeNull()
    })
  })

  /**
   * The tally outlives the microphone, and a session that has just stopped is
   * the one someone actually wants the numbers from — so a pause is where the
   * readings held back mid-phrase are finally spent.
   */
  describe('while paused or stopped', () => {
    const paused = { status: 'idle', isPlaying: false, isPaused: true, heard: null, spelling: 'sharp', called: null } as const
    const stopped = { ...paused, isPaused: false } as const
    const SESSION = {
      lastVerdict: null,
      hits: 18,
      scored: 21,
      points: 896,
      bestStreak: 5,
      bonuses: [],
      multiplier: 1,
    }

    it('stays out until there is something to report', () => {
      render(
        <MicReadout
          {...paused}
          score={{ lastVerdict: null, hits: 0, scored: 0, points: 0, bestStreak: 0, bonuses: [], multiplier: 1 }}
        />,
      )

      expect(screen.queryByTestId('score-summary')).toBeNull()
    })

    it('stays out while the microphone has nothing to report either way', () => {
      render(<MicReadout {...paused} status="denied" score={null} />)

      expect(screen.queryByTestId('score-summary')).toBeNull()
    })

    it('says a paused session is still going', () => {
      render(<MicReadout {...paused} score={SESSION} />)

      expect(screen.getByTestId('score-summary')).toHaveTextContent('Paused — how it’s going')
    })

    it('says a stopped one is over', () => {
      render(<MicReadout {...stopped} score={SESSION} />)

      expect(screen.getByTestId('score-summary')).toHaveTextContent('How it went')
      expect(screen.getByTestId('score-summary')).not.toHaveTextContent('Paused')
    })

    it('keeps the numbers up once the microphone has closed', () => {
      render(<MicReadout {...stopped} score={SESSION} />)

      expect(screen.getByTestId('score-points')).toHaveTextContent('896')
      expect(screen.getByTestId('mic-readout')).toHaveTextContent('Listening starts with playback.')
    })

    it('counts the session as an accuracy over the notes it was judged on', () => {
      render(<MicReadout {...paused} score={SESSION} />)

      expect(screen.getByTestId('score-tally')).toHaveTextContent('86%')
      expect(screen.getByTestId('score-summary')).toHaveTextContent('18 of 21 hit')
    })

    /** The run a miss cannot take away, which is the one worth reporting after. */
    it('reports the best run of the session rather than the one in force', () => {
      render(<MicReadout {...paused} score={SESSION} />)

      expect(screen.getByTestId('score-streak')).toHaveTextContent('×5')
      expect(screen.getByTestId('score-summary')).toHaveTextContent('best streak')
    })

    it('names the difficulty the settings are pricing a note at', () => {
      render(<MicReadout {...paused} score={{ ...SESSION, multiplier: 1.32 }} />)

      expect(screen.getByTestId('score-multiplier')).toHaveTextContent('×1.32')
      expect(screen.getByTestId('score-summary')).toHaveTextContent('note price')
    })

    it('rounds the reading rather than printing the float behind it', () => {
      render(<MicReadout {...paused} score={{ ...SESSION, multiplier: 1.2071 }} />)

      expect(screen.getByTestId('score-multiplier')).toHaveTextContent('×1.21')
    })

    it('says so when the settings price a note below the flat rate', () => {
      render(<MicReadout {...paused} score={{ ...SESSION, multiplier: 0.85 }} />)

      expect(screen.getByTestId('score-multiplier')).toHaveTextContent('×0.85')
    })

    it('drops the price tile at the flat rate, where it would change no total', () => {
      render(<MicReadout {...paused} score={SESSION} />)

      expect(screen.queryByTestId('score-multiplier')).toBeNull()
    })

    /**
     * A milestone is as likely to land on the very update that pauses playback
     * as on any other, and one already counted in the total it sits beside
     * should not vanish from the reading.
     */
    it('gives a practice milestone a tile of its own', () => {
      render(<MicReadout {...paused} score={{ ...SESSION, bonuses: [{ kind: 'practice30', points: 150 }] }} />)

      expect(screen.getByTestId('score-milestone')).toHaveTextContent('+150')
      expect(screen.getByTestId('score-summary')).toHaveTextContent('30 min played')
    })

    it('leaves the milestone tile out until the clock has paid one', () => {
      render(<MicReadout {...paused} score={{ ...SESSION, bonuses: [{ kind: 'streak', points: 5 }] }} />)

      expect(screen.queryByTestId('score-milestone')).toBeNull()
    })

    /** Pausing is when the queued events flush, so the line is literally true. */
    it('names the gap to the leader on a challenge', () => {
      render(<MicReadout {...paused} score={SESSION} board={{ leading: false, leader: 'ada', gap: 120 }} />)

      expect(screen.getByTestId('score-nudge')).toHaveTextContent('120 pts behind ada')
      expect(screen.getByTestId('score-nudge')).toHaveTextContent('your score just went up on the board')
    })

    it('has nothing to chase when the leader is you', () => {
      render(<MicReadout {...paused} score={SESSION} board={{ leading: true }} />)

      expect(screen.getByTestId('score-nudge')).toHaveTextContent('Top of the board — hold it.')
      expect(screen.getByTestId('score-nudge')).not.toHaveTextContent('behind')
    })

    it('says nothing about a board off a challenge', () => {
      render(<MicReadout {...paused} score={SESSION} />)

      expect(screen.queryByTestId('score-nudge')).toBeNull()
      expect(screen.getByTestId('score-summary')).not.toHaveTextContent('board')
    })
  })
})
