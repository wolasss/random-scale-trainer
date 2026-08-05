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
        id="show-fretboard"
        label="Fretboard map"
        subtitle="Show the On the neck card with every position."
        checked={settings.showFretboard}
        onChange={() => onToggle('showFretboard')}
      />
    </section>
  )
}
