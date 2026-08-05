import { SwitchRow } from './ui/SwitchRow'

type ControlsPanelProps = {
  continuousMode: boolean
  onToggleContinuousMode: () => void
  speedRampMode: boolean
  onToggleSpeedRampMode: () => void
}

export function ControlsPanel({
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
