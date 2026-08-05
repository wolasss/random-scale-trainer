import { BEAT_SPAN_OPTIONS, MAX_BPM, MIN_BPM } from '../constants'
import { cycleSeconds, formatCycleLength } from '../lib/time'
import type { BeatsPerNote } from '../hooks/useSettings'
import { SegmentedControl } from './ui/SegmentedControl'

type TempoCardProps = {
  bpm: number
  beatsPerNote: BeatsPerNote
  poolSize: number
  onBpmChange: (bpm: number) => void
  onNudge: (delta: number) => void
  onTap: () => void
  onBeatsPerNoteChange: (value: BeatsPerNote) => void
}

const BEAT_SPAN_LABELS: Record<BeatsPerNote, string> = {
  1: 'beat',
  2: '2 beats',
  4: '4 beats',
  8: '8 beats',
}

export function TempoCard({
  bpm,
  beatsPerNote,
  poolSize,
  onBpmChange,
  onNudge,
  onTap,
  onBeatsPerNoteChange,
}: TempoCardProps) {
  return (
    <section className="panel tempo-card">
      <div className="panel-heading">
        <h2>Tempo</h2>
        <p>
          <span className="label">One full cycle of {poolSize} notes</span>{' '}
          <span className="target-time">≈ {formatCycleLength(cycleSeconds(poolSize, beatsPerNote, bpm))}</span>
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
        <p className="control-subtitle">Keep the click fast, change notes slowly.</p>
      </div>
    </section>
  )
}
