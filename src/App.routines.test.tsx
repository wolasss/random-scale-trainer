import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

/** Every sound the machine schedules, with the audio-clock time it lands at. */
type ScheduledSound = { kind: 'click' | 'note'; key: string; time: number }
const scheduled: ScheduledSound[] = []
let stopScheduledCalls = 0

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
    playClickAt(time: number) {
      scheduled.push({ kind: 'click', key: 'click', time })
    }
    playNoteAt(key: string, time: number) {
      scheduled.push({ kind: 'note', key, time })
    }
    playSessionEndChime() {}
    stopScheduledSounds() {
      stopScheduledCalls += 1
    }
  },
}))

const chip = (id: string) => screen.getByTestId(`routine-chip-${id}`)
const selectRoutine = (id: string) => fireEvent.click(chip(id).querySelector('.routine-chip-body')!)

/** Deleting takes two taps: one to arm the button, one to answer it. */
const deleteRoutine = (id: string) => {
  const remove = chip(id).querySelector('.routine-chip-remove')!
  fireEvent.click(remove)
  fireEvent.click(remove)
}

const bpm = () => screen.getByTestId('bpm-value').textContent
const transport = () => screen.getByTestId('play-toggle').textContent

/** Runs playback far enough for the first real note, which starts the timer. */
const startPractice = async (bpmValue: number) => {
  fireEvent.click(screen.getByTestId('play-toggle'))
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    vi.advanceTimersByTime(4 * (60_000 / bpmValue) + 200)
  })
}

describe('Routines', () => {
  beforeEach(() => {
    scheduled.length = 0
    stopScheduledCalls = 0
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('seeds one shelf holding both shapes, with nothing selected', () => {
    render(<App />)

    expect(chip('seed-warmup-naturals')).toHaveTextContent('60 BPM · every 4 · 7 notes')
    expect(chip('seed-warmup-6')).toHaveTextContent('3 blocks · 6 min')
    // Free practice is simply no routine selected — never a chip of its own.
    expect(screen.getByTestId('routine-shelf').textContent).not.toContain('Free practice')

    expect(screen.getByTestId('routine-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('routine-timeline')).toBeNull()
    expect(screen.queryByTestId('routine-strip')).toBeNull()
    expect(transport()).toContain('Start practice')
  })

  /**
   * The card is tiered, not split into peers: setups are the card — presets,
   * under the heading itself — and workouts hang beneath as the labelled,
   * advanced shape a setup can grow into.
   */
  it('presents setups as the card and workouts as the labelled tier below', () => {
    render(<App />)

    const setups = screen.getByTestId('routine-group-setups')
    const workouts = screen.getByTestId('routine-group-workouts')

    // The heading names the setups; the group itself carries no second label.
    expect(screen.getByRole('heading', { name: 'Saved setups' })).toBeInTheDocument()
    expect(setups).not.toHaveTextContent('Saved setups')
    expect(setups).toContainElement(chip('seed-warmup-naturals'))
    expect(setups).toContainElement(chip('seed-chromatic-drill'))
    expect(setups).toContainElement(chip('seed-exam-pace'))
    expect(setups).toContainElement(chip('seed-string-by-string'))

    expect(workouts).toHaveTextContent('Workouts')
    expect(workouts).toContainElement(chip('seed-warmup-6'))
    expect(workouts).toContainElement(chip('seed-neck-fluency-12'))
    // One timed block is still a workout: it runs a session and stops itself.
    expect(workouts).toContainElement(chip('seed-speed-ladder-9'))
  })

  it('persists the seeds so they survive a reload', () => {
    const { unmount } = render(<App />)
    unmount()

    expect(JSON.parse(window.localStorage.getItem('fretboard-routines')!)).toHaveLength(7)
  })

  it('comes back to the routine it was left on', () => {
    const first = render(<App />)
    selectRoutine('seed-warmup-naturals')
    expect(transport()).toContain('Start Warm-up')
    first.unmount()

    // A cold launch that forgets the chosen routine makes an installed app feel
    // like a web page rather than an instrument.
    render(<App />)
    expect(chip('seed-warmup-naturals').className).toContain('selected')
    expect(transport()).toContain('Start Warm-up')
    expect(screen.getByTestId('routine-strip')).toBeInTheDocument()
  })

  it('forgets a routine that was deleted before the relaunch', () => {
    const first = render(<App />)
    selectRoutine('seed-warmup-naturals')
    deleteRoutine('seed-warmup-naturals')
    first.unmount()

    render(<App />)
    expect(transport()).toContain('Start practice')
    expect(screen.queryByTestId('routine-strip')).toBeNull()
  })

  it('applies block 0 on selection and names the start button', () => {
    render(<App />)

    selectRoutine('seed-warmup-naturals')

    expect(bpm()).toBe('60')
    expect(screen.getByTestId('note-every').querySelector('[aria-checked="true"]')).toHaveTextContent('4 beats')
    expect(screen.getByTestId('preset-select')).toHaveValue('naturals')
    expect(screen.getByTestId('spelling').querySelector('[aria-checked="true"]')).toHaveTextContent('flats')
    expect(transport()).toContain('Start Warm-up naturals')
  })

  it('reads a saved setup as one open-ended block', () => {
    render(<App />)

    selectRoutine('seed-chromatic-drill')

    expect(screen.getByTestId('routine-status')).toHaveTextContent('No timer — runs until you stop.')
    expect(screen.getByTestId('routine-strip-status')).toHaveTextContent('runs until you stop')
    expect(screen.getByTestId('routine-strip-progress')).toHaveAttribute('aria-valuenow', '0')
    // A lone block cannot be skipped, and a timeline of one is the chip again.
    expect(screen.queryByTestId('routine-skip-block')).toBeNull()
    expect(screen.queryByTestId('routine-timeline')).toBeNull()
    // The one control that names the setup → workout step for what it is.
    expect(screen.getByTestId('routine-add-block')).toHaveTextContent('Turn into a workout')
  })

  it('reads a workout as a timeline of blocks proportional to their length', () => {
    render(<App />)

    selectRoutine('seed-neck-fluency-12')

    const segments = screen.getAllByTestId(/^routine-segment-\d+$/)
    expect(segments).toHaveLength(5)
    // The 25s exam is floored to 90 flex-seconds so its label stays readable.
    expect(segments.map((segment) => segment.style.flexGrow)).toEqual(['240', '180', '180', '120', '90'])
    expect(segments[0].dataset.state).toBe('active')
    expect(segments[1].dataset.state).toBe('upcoming')
    expect(segments[1]).toHaveTextContent('66 BPM · every 4 · accidentals')
    expect(segments[1]).toHaveTextContent('3:00')
    // The cycle line is why BPM alone can't order the blocks: 'quicker' runs at
    // 48 BPM against Settle in's 60, yet laps all 12 in 0:30 to its 0:48.
    expect(segments[1].querySelector('.routine-segment-cycle')).toHaveTextContent('0:18 / cycle')
    expect(segments[2].querySelector('.routine-segment-cycle')).toHaveTextContent('0:30 / cycle')
    expect(segments[0].querySelector('.routine-segment-cycle')).toHaveTextContent('0:48 / cycle')
    // The sprint and the exam are lap targets stated as pace: 0:20 and 0:25.
    expect(segments[3].querySelector('.routine-segment-cycle')).toHaveTextContent('0:20 / cycle')
    expect(segments[4].querySelector('.routine-segment-cycle')).toHaveTextContent('0:25 / cycle')

    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 1 of 5 · 4:00 left of 12:25')
    expect(screen.getByTestId('routine-strip-status')).toHaveTextContent('block 1 of 5 · 4:00 left')
  })

  it('deselects when the selected chip is clicked again, keeping the settings', () => {
    render(<App />)

    selectRoutine('seed-warmup-naturals')
    selectRoutine('seed-warmup-naturals')

    expect(screen.getByTestId('routine-empty')).toBeInTheDocument()
    expect(bpm()).toBe('60')
    expect(transport()).toContain('Start practice')
  })

  it('clears from the card header and from the hero strip', () => {
    render(<App />)

    selectRoutine('seed-warmup-naturals')
    fireEvent.click(screen.getByTestId('routine-clear'))
    expect(screen.getByTestId('routine-empty')).toBeInTheDocument()

    selectRoutine('seed-warmup-naturals')
    fireEvent.click(screen.getByTestId('routine-strip-clear'))
    expect(screen.getByTestId('routine-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('routine-clear')).toBeNull()
  })

  it('skips to the next block from the hero strip, and hides the button when there is nothing to skip', () => {
    render(<App />)

    selectRoutine('seed-neck-fluency-12')

    fireEvent.click(screen.getByTestId('routine-strip-skip'))
    expect(screen.getByTestId('routine-strip-status')).toHaveTextContent('block 2 of 5 · 3:00 left')
    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 2 of 5')

    // Three more lands on the last block; one after that ends the workout.
    fireEvent.click(screen.getByTestId('routine-strip-skip'))
    fireEvent.click(screen.getByTestId('routine-strip-skip'))
    fireEvent.click(screen.getByTestId('routine-strip-skip'))
    expect(screen.getByTestId('routine-strip-status')).toHaveTextContent('block 5 of 5')

    fireEvent.click(screen.getByTestId('routine-strip-skip'))
    expect(screen.getByTestId('routine-strip-status')).toHaveTextContent('complete')
    expect(screen.queryByTestId('routine-strip-skip')).toBeNull()

    // A saved setup is one block: the strip keeps its clear, drops its skip.
    fireEvent.click(screen.getByTestId('routine-strip-clear'))
    selectRoutine('seed-chromatic-drill')
    expect(screen.getByTestId('routine-strip-clear')).toBeInTheDocument()
    expect(screen.queryByTestId('routine-strip-skip')).toBeNull()
  })

  /**
   * The delete is final, so one tap can never be enough: the first only turns
   * the X into a question, and the storage behind it is untouched until the
   * same button is pressed again.
   */
  it('deletes a routine on the second tap, clearing the selection when it was the selected one', () => {
    render(<App />)

    selectRoutine('seed-chromatic-drill')
    const remove = screen.getByLabelText('Delete Chromatic drill')
    fireEvent.click(remove)

    expect(remove).toHaveTextContent('Delete?')
    // The question is on the button for anyone who can see it, and in its
    // accessible name for anyone who can't.
    expect(remove).toHaveAccessibleName('Delete Chromatic drill? Press again to confirm')
    expect(screen.getByTestId('routine-chip-seed-chromatic-drill')).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('fretboard-routines')!)).toHaveLength(7)

    fireEvent.click(remove)

    expect(screen.queryByTestId('routine-chip-seed-chromatic-drill')).toBeNull()
    expect(screen.getByTestId('routine-empty')).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('fretboard-routines')!)).toHaveLength(6)
  })

  /** An armed button that loses focus has been left behind — it has to relax. */
  it('disarms a stray delete tap when focus moves away', () => {
    render(<App />)

    const remove = screen.getByLabelText('Delete Chromatic drill')
    fireEvent.click(remove)
    fireEvent.blur(remove)
    fireEvent.click(remove)

    expect(screen.getByTestId('routine-chip-seed-chromatic-drill')).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('fretboard-routines')!)).toHaveLength(7)

    // Still armed from that last tap, so one more answer finishes the job.
    fireEvent.click(remove)
    expect(screen.queryByTestId('routine-chip-seed-chromatic-drill')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('fretboard-routines')!)).toHaveLength(6)
  })

  /**
   * The card is never remounted when another routine is loaded, so an armed
   * block delete must not travel with it and greet the next workout primed at
   * the same position.
   */
  it('does not carry an armed block delete over to another workout', () => {
    render(<App />)

    selectRoutine('seed-warmup-6')
    fireEvent.click(screen.getAllByLabelText(/^Remove block /)[1])

    selectRoutine('seed-neck-fluency-12')
    const remove = screen.getAllByLabelText(/^Remove block /)[1]
    fireEvent.click(remove)

    // It armed rather than fired: all five blocks are still there.
    expect(screen.getAllByTestId(/^routine-segment-\d+$/)).toHaveLength(5)
    expect(remove).toHaveTextContent('Remove?')
    expect(remove).toHaveAccessibleName(/^Remove block .+\? Press again to confirm$/)

    fireEvent.click(remove)
    expect(screen.getAllByTestId(/^routine-segment-\d+$/)).toHaveLength(4)
  })

  it('forks out to Custom when the controls are touched while stopped', () => {
    render(<App />)

    selectRoutine('seed-warmup-naturals')
    fireEvent.click(screen.getByTestId('bpm-up'))

    expect(screen.getByTestId('routine-empty')).toBeInTheDocument()
    // The settings are kept — only their tie to the routine is cut.
    expect(bpm()).toBe('61')
    expect(screen.getByTestId('preset-select')).toHaveValue('naturals')
  })

  it('forks out on a pool edit too, matching the note chips', () => {
    render(<App />)

    selectRoutine('seed-warmup-naturals')
    fireEvent.click(screen.getByTestId('note-chip-1'))

    expect(screen.getByTestId('routine-empty')).toBeInTheDocument()
    expect(screen.getByTestId('preset-select')).toHaveValue('custom')
  })

  /**
   * The other half of the rule: only what a block owns can drift. The session
   * goal and the how-it-runs switches are app-wide, so touching them has to
   * leave the routine exactly where it was.
   */
  it('keeps the routine when app-wide settings are changed', () => {
    render(<App />)

    selectRoutine('seed-warmup-naturals')
    fireEvent.click(screen.getByTestId('session-goal').querySelector('[data-value="5"]')!)
    fireEvent.click(document.getElementById('show-fretboard')!)

    // Both settings really did change — the routine simply does not care.
    expect(screen.getByTestId('session-goal').querySelector('[aria-checked="true"]')).toHaveTextContent('5 min')
    expect(screen.queryByTestId('fretboard')).toBeNull()

    expect(screen.queryByTestId('routine-empty')).toBeNull()
    expect(chip('seed-warmup-naturals').className).toContain('selected')
    expect(screen.getByTestId('routine-strip')).toBeInTheDocument()
    expect(transport()).toContain('Start Warm-up naturals')
    // Nor is it an override: there is nothing for the next block to reclaim.
    expect(screen.getByTestId('routine-status')).not.toHaveTextContent('adjusted')
  })

  it('treats a mid-playback nudge as an override, not an exit', async () => {
    render(<App />)

    selectRoutine('seed-warmup-6')
    await startPractice(60)

    fireEvent.click(screen.getByTestId('bpm-up'))

    expect(screen.queryByTestId('routine-empty')).toBeNull()
    expect(screen.getByTestId('routine-strip')).toBeInTheDocument()
    expect(screen.getByTestId('routine-status')).toHaveTextContent('· adjusted, next block resets it')
    expect(bpm()).toBe('61')
  })

  it('advances to the next block when a block runs out, reclaiming the settings', async () => {
    render(<App />)

    selectRoutine('seed-warmup-6')
    await startPractice(60)
    fireEvent.click(screen.getByTestId('bpm-up'))
    expect(bpm()).toBe('61')

    await act(async () => {
      vi.advanceTimersByTime(120_000)
    })

    expect(screen.getAllByTestId(/^routine-segment-\d+$/)[0].dataset.state).toBe('done')
    expect(screen.getByTestId('routine-segment-1').dataset.state).toBe('active')
    // Block 2 is naturals at 76, every 2 — the nudge is reclaimed.
    expect(bpm()).toBe('76')
    expect(screen.getByTestId('note-every').querySelector('[aria-checked="true"]')).toHaveTextContent('2 beats')
    expect(screen.getByTestId('routine-status')).not.toHaveTextContent('adjusted')
    expect(screen.getByTestId('playback-message')).toHaveTextContent('Warm-up (6 min) · block 2 of 3')
  })

  it('skips a block on demand', () => {
    render(<App />)

    selectRoutine('seed-neck-fluency-12')
    fireEvent.click(screen.getByTestId('routine-skip-block'))

    expect(bpm()).toBe('66')
    expect(screen.getByTestId('note-every').querySelector('[aria-checked="true"]')).toHaveTextContent('4 beats')
    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 2 of 5')
  })

  it('stops at the end and offers to run the routine again', () => {
    render(<App />)

    selectRoutine('seed-warmup-6')
    fireEvent.click(screen.getByTestId('routine-skip-block'))
    fireEvent.click(screen.getByTestId('routine-skip-block'))
    fireEvent.click(screen.getByTestId('routine-skip-block'))

    expect(screen.getByTestId('routine-status')).toHaveTextContent('Finished — 6 min done.')
    expect(screen.getByTestId('routine-strip-status')).toHaveTextContent('complete')
    expect(screen.getByTestId('routine-strip-progress')).toHaveAttribute('aria-valuenow', '100')
    expect(transport()).toContain('Restart workout')

    fireEvent.click(screen.getByTestId('play-toggle'))
    expect(bpm()).toBe('60')
    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 1 of 3')
  })

  /**
   * The seeded ladder is the ramp's own demonstration: one block that climbs,
   * where three hand-built rungs used to imitate it.
   */
  it('applies the speed ladder as a single ramping block', () => {
    render(<App />)

    selectRoutine('seed-speed-ladder-9')

    expect(bpm()).toBe('70')
    expect(document.getElementById('speed-ramp-mode')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('ramp-target-value')).toHaveTextContent('110')
    expect(screen.getByTestId('ramp-helper')).toHaveTextContent('20 rounds from 70, then it holds.')

    expect(chip('seed-speed-ladder-9')).toHaveTextContent('70 BPM · every 4 · 12 notes · climbs to 110')
    // One timed block is a countdown, not a sequence of one — no timeline, and
    // the status says so.
    expect(screen.queryByTestId('routine-timeline')).toBeNull()
    expect(screen.getByTestId('routine-status')).toHaveTextContent('One block · 9:00 left of 9:00')
    expect(screen.getByTestId('routine-strip-status')).toHaveTextContent('9:00 left')
    expect(screen.queryByTestId('routine-skip-block')).toBeNull()
  })

  it('forks out to Custom when the ramp target is retuned while stopped', () => {
    render(<App />)

    selectRoutine('seed-speed-ladder-9')
    fireEvent.click(screen.getByTestId('ramp-target-up'))

    expect(screen.getByTestId('routine-empty')).toBeInTheDocument()
    // The settings are kept — only their tie to the routine is cut.
    expect(screen.getByTestId('ramp-target-value')).toHaveTextContent('115')
  })

  it('treats a mid-playback retune of the ceiling as an override, not an exit', async () => {
    render(<App />)

    selectRoutine('seed-warmup-6')
    await startPractice(60)

    fireEvent.click(document.getElementById('speed-ramp-mode')!)

    expect(screen.queryByTestId('routine-empty')).toBeNull()
    expect(screen.getByTestId('routine-status')).toHaveTextContent('· adjusted, next block resets it')
  })

  it('reclaims a ramp the previous block turned on', () => {
    render(<App />)

    selectRoutine('seed-speed-ladder-9')
    expect(document.getElementById('speed-ramp-mode')).toHaveAttribute('aria-checked', 'true')

    selectRoutine('seed-warmup-6')
    expect(document.getElementById('speed-ramp-mode')).toHaveAttribute('aria-checked', 'false')
  })

  it('grows a saved setup into a workout in one click, and back down again', () => {
    render(<App />)

    selectRoutine('seed-warmup-naturals')
    fireEvent.click(screen.getByTestId('routine-add-block'))

    const segments = screen.getAllByTestId(/^routine-segment-\d+$/)
    expect(segments).toHaveLength(2)
    // The formerly open block had to gain a timer, or nothing could follow it.
    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 1 of 2 · 2:00 left of 4:00')
    expect(screen.getByTestId('routine-skip-block')).toBeInTheDocument()
    // It is a workout now, so the button stops offering to make one.
    expect(screen.getByTestId('routine-add-block')).toHaveTextContent('Add a block from current settings')

    const remove = screen.getAllByLabelText(/^Remove block /)[1]
    fireEvent.click(remove)
    fireEvent.click(remove)
    // Down to one block the sequence is gone, and with it the timeline.
    expect(screen.queryByTestId('routine-timeline')).toBeNull()
    // The survivor keeps the clock it was given — a lone block may be timed.
    expect(screen.getByTestId('routine-status')).toHaveTextContent('One block · 2:00 left of 2:00')
    expect(screen.queryByTestId('routine-skip-block')).toBeNull()
  })

  it('saves the current settings as a one-block routine and selects it', () => {
    render(<App />)

    fireEvent.change(document.getElementById('bpm-slider')!, { target: { value: '84' } })
    fireEvent.change(screen.getByTestId('preset-select'), { target: { value: 'accidentals' } })
    fireEvent.click(screen.getByTestId('routine-save'))

    expect(screen.getByTestId('routine-name-input')).toHaveValue('Accidentals @ 84')

    fireEvent.change(screen.getByTestId('routine-name-input'), { target: { value: 'Sharp corners' } })
    fireEvent.click(screen.getByTestId('routine-save-confirm'))

    expect(screen.queryByTestId('routine-save-form')).toBeNull()
    expect(screen.getByTestId('routine-shelf')).toHaveTextContent('Sharp corners')
    expect(screen.getByTestId('routine-status')).toHaveTextContent('No timer — runs until you stop.')
    // A saved setup lands on the setups shelf, never among the workouts.
    expect(screen.getByTestId('routine-group-setups')).toHaveTextContent('Sharp corners')
    expect(screen.getByTestId('routine-group-workouts')).not.toHaveTextContent('Sharp corners')
    expect(transport()).toContain('Start Sharp corners')

    const stored = JSON.parse(window.localStorage.getItem('fretboard-routines')!)
    expect(stored).toHaveLength(8)
    expect(stored[7]).toMatchObject({
      name: 'Sharp corners',
      blocks: [{ poolKey: 'accidentals', bpm: 84, beats: 4, ramp: false, dur: null }],
    })
  })

  /** A ramp tuned by hand in free practice has to survive being saved. */
  it('captures the ramp and its ceiling when the settings are saved', () => {
    render(<App />)

    fireEvent.change(document.getElementById('bpm-slider')!, { target: { value: '80' } })
    fireEvent.click(document.getElementById('speed-ramp-mode')!)
    fireEvent.click(screen.getByTestId('ramp-target-up'))
    fireEvent.click(screen.getByTestId('routine-save'))
    fireEvent.click(screen.getByTestId('routine-save-confirm'))

    const stored = JSON.parse(window.localStorage.getItem('fretboard-routines')!)
    expect(stored[7].blocks[0]).toMatchObject({ bpm: 80, ramp: true, rampTo: 117 })
    expect(screen.getByTestId('routine-shelf')).toHaveTextContent('climbs to 117')
  })

  it('cancels a save without touching the shelf', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('routine-save'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByTestId('routine-save-form')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('fretboard-routines')!)).toHaveLength(7)
  })

  /**
   * The scheduler runs a 250ms look-ahead, so a block boundary always lands
   * with some of the previous block already committed to the audio clock. What
   * must never happen is a note being *drawn* from the old pool after the
   * switch — that would mean the deck was re-seeded from stale settings.
   */
  // The fake clock is driven coarsely — one jump to just short of the computed
  // boundary, then a short poll for the switch — so the test pays for a handful
  // of renders rather than hundreds. The explicit timeout is headroom only.
  it('draws nothing from the old pool once a block boundary passes', { timeout: 15_000 }, async () => {
    // Disjoint pools, so every sounded note names the block it came from.
    const NATURAL_KEYS = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
    window.localStorage.setItem(
      'fretboard-routines',
      JSON.stringify([
        {
          id: 'boundary',
          name: 'Boundary',
          blocks: [
            { name: 'Naturals', poolKey: 'naturals', pool: null, bpm: 120, beats: 1, acc: 'flats', dur: 6 },
            { name: 'Accidentals', poolKey: 'accidentals', pool: null, bpm: 120, beats: 1, acc: 'sharps', dur: 6 },
          ],
        },
      ]),
    )

    render(<App />)
    selectRoutine('boundary')
    await startPractice(120)

    // The block clock starts on the first real note and runs for the block's
    // 6s, so one coarse jump gets to within half a second of the switch without
    // paying for a render in between. The guard makes an overshoot loud.
    const firstNoteMs = scheduled.find((sound) => sound.kind === 'note')!.time * 1_000
    await act(async () => {
      vi.advanceTimersByTime(firstNoteMs + 6_000 - 500 - performance.now())
    })
    expect(screen.getByTestId('routine-segment-1').dataset.state).not.toBe('active')

    // Then creep up on the switch, which the session timer quantises to 200ms.
    let boundaryAt: number | null = null
    for (let step = 0; step < 20 && boundaryAt === null; step++) {
      await act(async () => {
        vi.advanceTimersByTime(100)
      })
      if (screen.getByTestId('routine-segment-1').dataset.state === 'active') {
        boundaryAt = performance.now() / 1000
      }
    }
    expect(boundaryAt).not.toBeNull()

    // The preview is the deck's head: it must already belong to the new block.
    expect(NATURAL_KEYS.has(screen.getByTestId('next-note').textContent ?? '')).toBe(false)

    // Drain well past the look-ahead window.
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })

    const notes = scheduled.filter((sound) => sound.kind === 'note')
    const afterBoundary = notes.filter((sound) => sound.time > boundaryAt!)
    expect(afterBoundary.length).toBeGreaterThan(0)
    expect(afterBoundary.filter((sound) => NATURAL_KEYS.has(sound.key))).toEqual([])

    // Queued audio is deliberately left to drain rather than cancelled: killing
    // it mid-flight would break the click's pulse at every boundary, which is
    // the one thing the look-ahead scheduler exists to prevent.
    expect(stopScheduledCalls).toBe(0)
    const clicks = scheduled
      .filter((sound) => sound.kind === 'click' && sound.time > boundaryAt! - 1 && sound.time < boundaryAt! + 1)
      .map((sound) => sound.time)
    const gaps = clicks.slice(1).map((time, index) => time - clicks[index])
    // 120 BPM either side of the boundary — an unbroken half-second pulse.
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(0.5, 5)
    }
  })

  it('restores a workout with a corrupt duration as one that can still finish', () => {
    // A block with no duration never auto-advances, so a restored workout
    // holding one would stall there forever. Storage is not to be trusted.
    window.localStorage.setItem(
      'fretboard-routines',
      JSON.stringify([
        {
          id: 'skewed',
          name: 'Skewed',
          blocks: [
            { name: 'One', poolKey: 'naturals', bpm: 60, beats: 4, dur: 120 },
            { name: 'Stalls', poolKey: 'chromatic', bpm: 80, beats: 2 },
            { name: 'Three', poolKey: 'accidentals', bpm: 90, beats: 2, dur: 60 },
          ],
        },
      ]),
    )

    render(<App />)
    selectRoutine('skewed')

    expect(screen.getAllByTestId(/^routine-segment-\d+$/)).toHaveLength(2)
    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 1 of 2 · 2:00 left of 3:00')

    // Every block still advances, and the routine can reach its end.
    fireEvent.click(screen.getByTestId('routine-skip-block'))
    expect(bpm()).toBe('90')
    fireEvent.click(screen.getByTestId('routine-skip-block'))
    expect(screen.getByTestId('routine-status')).toHaveTextContent('Finished — 3 min done.')
    expect(transport()).toContain('Restart workout')
  })

  it('resets the routine to block 0 with the session', () => {
    render(<App />)

    selectRoutine('seed-neck-fluency-12')
    fireEvent.click(screen.getByTestId('routine-skip-block'))
    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 2 of 5')

    fireEvent.click(screen.getByTestId('reset'))
    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 1 of 5')
    expect(bpm()).toBe('60')
  })

  it('keeps a block on time when the practice log clears the session clock', async () => {
    render(<App />)

    selectRoutine('seed-warmup-6')
    await startPractice(60)

    // Halfway through the two-minute first block, the session clock goes back
    // to zero underneath it.
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    fireEvent.click(screen.getByTestId('practice-log-clear'))
    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 1 of 3')

    // The block still hands over at its own two minutes, not two minutes after
    // the clear.
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })

    expect(screen.getByTestId('routine-status')).toHaveTextContent('Block 2 of 3')
    expect(bpm()).toBe('76')
  })
})
