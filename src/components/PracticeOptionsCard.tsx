import { isMicSupported } from '../lib/audio/mic'
import type { Settings, SettingsToggleKey } from '../hooks/useSettings'
import { SwitchRow } from './ui/SwitchRow'

type PracticeOptionsCardProps = {
  settings: Settings
  onToggle: (key: SettingsToggleKey) => void
}

export function PracticeOptionsCard({ settings, onToggle }: PracticeOptionsCardProps) {
  // A browser with no microphone API is a dead end the user would otherwise
  // only find on pressing play, so the reason takes the subtitle's place and
  // the switch — which describes itself with it — explains why it is off.
  const micSupported = isMicSupported()

  return (
    <section className="panel practice-options-card">
      <div className="panel-heading">
        <h2>How it runs</h2>
      </div>

      <SwitchRow
        id="continuous-mode"
        label="Keep going"
        subtitle="Off stops once every note has come up."
        checked={settings.continuousMode}
        onChange={() => onToggle('continuousMode')}
      />
      <SwitchRow
        id="count-in"
        label="Count in"
        subtitle="A four-beat lead-in before the first note and each new round."
        checked={settings.countInEnabled}
        onChange={() => onToggle('countInEnabled')}
      />
      <SwitchRow
        id="speak-notes"
        label="Say the note"
        subtitle="Off leaves the note on screen only — name it yourself before checking."
        checked={settings.speakNotes}
        onChange={() => onToggle('speakNotes')}
      />
      <SwitchRow
        id="mic-listen"
        label="Listen for my playing"
        subtitle={
          micSupported
            ? 'The mic verifies each note you play, with instant feedback.'
            : 'This browser has no microphone to listen with.'
        }
        checked={settings.micEnabled && micSupported}
        onChange={() => onToggle('micEnabled')}
        disabled={!micSupported}
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
