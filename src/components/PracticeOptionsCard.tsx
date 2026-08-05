import type { Settings, SettingsToggleKey } from '../hooks/useSettings'
import { SwitchRow } from './ui/SwitchRow'

type PracticeOptionsCardProps = {
  settings: Settings
  onToggle: (key: SettingsToggleKey) => void
}

export function PracticeOptionsCard({ settings, onToggle }: PracticeOptionsCardProps) {
  return (
    <section className="panel practice-options-card">
      <div className="panel-heading">
        <h2>Practice options</h2>
      </div>

      <SwitchRow
        id="count-in"
        label="Count-in"
        subtitle="Four clicks before the first note."
        checked={settings.countInEnabled}
        onChange={() => onToggle('countInEnabled')}
      />
      <SwitchRow
        id="continuous-mode"
        label="Loop continuously"
        subtitle="Off stops after one full cycle."
        checked={settings.continuousMode}
        onChange={() => onToggle('continuousMode')}
      />
      <SwitchRow
        id="speed-ramp-mode"
        label="Speed ramp"
        subtitle="+2 BPM after every cycle."
        checked={settings.speedRampMode}
        onChange={() => onToggle('speedRampMode')}
        disabled={!settings.continuousMode}
      />
      <SwitchRow
        id="speak-note"
        label="Speak the note"
        subtitle="Spoken name on the downbeat."
        checked={settings.speakNotes}
        onChange={() => onToggle('speakNotes')}
      />
      <SwitchRow
        id="reference-pitch"
        label="Reference pitch"
        subtitle="Sound the actual note to check yourself by ear."
        checked={settings.referencePitch}
        onChange={() => onToggle('referencePitch')}
      />
      <SwitchRow
        id="ear-only"
        label="Ear-only challenge"
        subtitle="Hide the note until the last beat of its span."
        checked={settings.earOnly}
        onChange={() => onToggle('earOnly')}
      />
    </section>
  )
}
