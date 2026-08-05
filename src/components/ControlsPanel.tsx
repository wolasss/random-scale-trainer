import { MAX_BPM, MIN_BPM } from '../constants'
import { cycleSeconds, formatCycleLength } from '../lib/time'
import { SwitchRow } from './ui/SwitchRow'

type ControlsPanelProps = {
  bpm: number
  beatsPerNote: number
  onBpmChange: (bpm: number) => void
  continuousMode: boolean
  onToggleContinuousMode: () => void
  speedRampMode: boolean
  onToggleSpeedRampMode: () => void
}

export function ControlsPanel({
  bpm,
  beatsPerNote,
  onBpmChange,
  continuousMode,
  onToggleContinuousMode,
  speedRampMode,
  onToggleSpeedRampMode,
}: ControlsPanelProps) {
  return (
    <section className="panel controls-panel">
      <div className="panel-heading">
        <h2>Practice settings</h2>
        <p>The metronome sets the tempo. Each note is spoken on the beat.</p>
      </div>

      <div className="control-block">
        <div className="slider-row">
          <label htmlFor="bpm-slider">Metronome BPM</label>
          <output data-testid="bpm-value">{bpm}</output>
        </div>
        <input
          id="bpm-slider"
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          onChange={(event) => onBpmChange(Number(event.target.value))}
        />
        <div className="range-hints">
          <span>{MIN_BPM}</span>
          <span>{MAX_BPM}</span>
        </div>

        <div className="target-time-info">
          <span className="label">One full cycle of 12 notes</span>
          <span className="target-time">≈ {formatCycleLength(cycleSeconds(12, beatsPerNote, bpm))}</span>
        </div>
      </div>

      <SwitchRow
        id="continuous-mode"
        label="Loop continuously"
        subtitle="Off stops after one full cycle."
        checked={continuousMode}
        onChange={onToggleContinuousMode}
      />
      <SwitchRow
        id="speed-ramp-mode"
        label="Speed ramp"
        subtitle="+2 BPM after every cycle."
        checked={speedRampMode}
        onChange={onToggleSpeedRampMode}
        disabled={!continuousMode}
      />
    </section>
  )
}
