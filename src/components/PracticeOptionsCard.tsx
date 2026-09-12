import { isMicSupported } from '../lib/audio/mic'
import type { Settings, SettingsToggleKey } from '../hooks/useSettings'
import { SwitchRow } from './ui/SwitchRow'

type PracticeOptionsCardProps = {
  settings: Settings
  onToggle: (key: SettingsToggleKey) => void
  /** Challenges call and score one note at a time, so a static list cannot run there. */
  listModeUnavailable?: boolean
}

export function PracticeOptionsCard({ settings, onToggle, listModeUnavailable = false }: PracticeOptionsCardProps) {
  // A browser with no microphone API is a dead end the user would otherwise
  // only find on pressing play, so the reason takes the subtitle's place and
  // the switch — which describes itself with it — explains why it is off.
  const micSupported = isMicSupported()
  const listModeActive = settings.noteListMode && !listModeUnavailable

  return (
    <section className="panel practice-options-card">
      <div className="panel-heading">
        <h2>How it runs</h2>
      </div>

      {listModeActive ? (
        <>
          <SwitchRow
            id="note-list"
            label="List only"
            subtitle="Shuffle all selected notes once; the list stays fixed until you replace it."
            checked
            onChange={() => onToggle('noteListMode')}
          />
          <SwitchRow
            id="list-metronome"
            label="Metronome"
            subtitle="Tick while the workout timer runs."
            checked={settings.listMetronomeEnabled}
            onChange={() => onToggle('listMetronomeEnabled')}
          />
          <SwitchRow
            id="count-in"
            label="Count in"
            subtitle="A four-beat lead-in before the workout timer starts."
            checked={settings.countInEnabled}
            onChange={() => onToggle('countInEnabled')}
          />
        </>
      ) : (
        <>
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
            id="note-list"
            label="List only"
            subtitle={
              listModeUnavailable
                ? 'Unavailable during a challenge, where each called note is scored.'
                : 'Shuffle all selected notes once; ticks continue until you regenerate.'
            }
            checked={false}
            onChange={() => onToggle('noteListMode')}
            disabled={listModeUnavailable}
          />
          <SwitchRow
            id="show-fretboard"
            label="Fretboard map"
            subtitle="Show the On the neck card with every position."
            checked={settings.showFretboard}
            onChange={() => onToggle('showFretboard')}
          />
        </>
      )}
    </section>
  )
}
