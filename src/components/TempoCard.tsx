import { BEAT_SPAN_OPTIONS, MAX_BPM, MIN_BPM, RAMP_BPM_STEP, RAMP_TARGET_STEP, rampRounds } from '../constants'
import { cycleSeconds, formatCycleLength } from '../lib/time'
import type { BeatsPerNote } from '../hooks/useSettings'
import { SegmentedControl } from './ui/SegmentedControl'
import { SwitchRow } from './ui/SwitchRow'

type TempoCardProps = {
  bpm: number
  beatsPerNote: BeatsPerNote
  poolSize: number
  rampEnabled: boolean
  rampTarget: number
  /** The ramp needs a second round to climb into, so looping has to be on. */
  rampAvailable: boolean
  onBpmChange: (bpm: number) => void
  onNudge: (delta: number) => void
  onTap: () => void
  onBeatsPerNoteChange: (value: BeatsPerNote) => void
  onRampToggle: () => void
  onRampTargetNudge: (delta: number) => void
}

const BEAT_SPAN_LABELS: Record<BeatsPerNote, string> = {
  1: 'beat',
  2: '2 beats',
  4: '4 beats',
  8: '8 beats',
  12: '12 beats',
}

/** Does the arithmetic out loud, so the target is a plan rather than a number. */
const rampHelper = (bpm: number, target: number) => {
  const rounds = rampRounds(bpm, target)
  if (rounds === 0) {
    return 'Target reached — holding here.'
  }

  return `${rounds} ${rounds === 1 ? 'round' : 'rounds'} from ${bpm}, then it holds.`
}

export function TempoCard({
  bpm,
  beatsPerNote,
  poolSize,
  rampEnabled,
  rampTarget,
  rampAvailable,
  onBpmChange,
  onNudge,
  onTap,
  onBeatsPerNoteChange,
  onRampToggle,
  onRampTargetNudge,
}: TempoCardProps) {
  return (
    <section className="panel tempo-card">
      <div className="panel-heading">
        <h2>Tempo</h2>
        <p>
          <span className="label">All {poolSize} notes take about</span>{' '}
          <span className="target-time">{formatCycleLength(cycleSeconds(poolSize, beatsPerNote, bpm))}</span>{' '}
          <span className="label">at this tempo</span>
        </p>
      </div>

      <div className="control-block">
        <div className="tempo-readout-row">
          <button
            type="button"
            className="ghost-button stepper-button"
            data-testid="bpm-down"
            aria-label="Slower by 1 BPM"
            onClick={() => onNudge(-1)}
          >
            −
          </button>
          <div className="tempo-readout">
            <output data-testid="bpm-value">{bpm}</output>
            <span className="tempo-unit">BPM</span>
          </div>
          <button
            type="button"
            className="ghost-button stepper-button"
            data-testid="bpm-up"
            aria-label="Faster by 1 BPM"
            onClick={() => onNudge(1)}
          >
            +
          </button>
          <button type="button" className="ghost-button tap-tempo" data-testid="tap-tempo" onClick={onTap}>
            Tap tempo
          </button>
        </div>

        <input
          id="bpm-slider"
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          aria-label="Tempo in BPM"
          onChange={(event) => onBpmChange(Number(event.target.value))}
        />
        <div className="range-hints">
          <span>{MIN_BPM}</span>
          <span>{MAX_BPM}</span>
        </div>
      </div>

      {/* The ramp is a rule about tempo, so it sits directly under the number it
          moves rather than off in a list of app-wide switches. */}
      <div className="control-block">
        <SwitchRow
          id="speed-ramp-mode"
          label="Speed ramp"
          subtitle={`Tempo climbs ${RAMP_BPM_STEP} BPM every time you get through all the notes.`}
          checked={rampEnabled}
          onChange={onRampToggle}
          disabled={!rampAvailable}
        />

        {rampEnabled ? (
          <div className="ramp-target" data-testid="ramp-target">
            <div className="control-label-row">
              <span className="label">Climb to</span>
            </div>
            <div className="tempo-readout-row">
              <button
                type="button"
                className="ghost-button stepper-button"
                data-testid="ramp-target-down"
                aria-label={`Lower the target by ${RAMP_TARGET_STEP} BPM`}
                onClick={() => onRampTargetNudge(-RAMP_TARGET_STEP)}
              >
                −
              </button>
              <div className="tempo-readout">
                <output data-testid="ramp-target-value">{rampTarget}</output>
                <span className="tempo-unit">BPM</span>
              </div>
              <button
                type="button"
                className="ghost-button stepper-button"
                data-testid="ramp-target-up"
                aria-label={`Raise the target by ${RAMP_TARGET_STEP} BPM`}
                onClick={() => onRampTargetNudge(RAMP_TARGET_STEP)}
              >
                +
              </button>
            </div>
            <p className="control-subtitle" data-testid="ramp-helper">
              {rampHelper(bpm, rampTarget)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="control-block">
        <div className="control-label-row">
          <span className="label">New note every</span>
        </div>
        <SegmentedControl
          ariaLabel="New note every"
          testId="note-every"
          options={BEAT_SPAN_OPTIONS.map((value) => ({ value, label: BEAT_SPAN_LABELS[value] }))}
          value={beatsPerNote}
          onChange={onBeatsPerNoteChange}
        />
        <p className="control-subtitle">
          Keep the click fast, change notes slowly — the dots below the note show where you are.
        </p>
      </div>
    </section>
  )
}
