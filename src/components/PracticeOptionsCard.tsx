import { isMicSupported } from '../lib/audio/mic'
import type { Settings, SettingsToggleKey } from '../hooks/useSettings'
import { SwitchRow } from './ui/SwitchRow'

type PracticeOptionsCardProps = {
  settings: Settings
  onToggle: (key: SettingsToggleKey) => void
  /** Challenges call and score one note at a time, so a static list cannot run there. */
  listModeUnavailable?: boolean
  /** The map would show where every scored note lives, so a challenge hides it. */
  fretboardUnavailable?: boolean
  /** A challenge prices notes at their full span, so none may be cut short there. */
  earlyAdvanceUnavailable?: boolean
}

export function PracticeOptionsCard({
  settings,
  onToggle,
  listModeUnavailable = false,
  fretboardUnavailable = false,
  earlyAdvanceUnavailable = false,
}: PracticeOptionsCardProps) {
  // A browser with no microphone API is a dead end the user would otherwise
  // only find on pressing play, so the reason takes the subtitle's place and
  // the switch — which describes itself with it — explains why it is off.
  const micSupported = isMicSupported()
  const listModeActive = settings.noteListMode && !listModeUnavailable
  const micOn = settings.micEnabled && micSupported
  // Only the microphone can tell a note has been got, so the switch follows it.
  const earlyAdvanceAvailable = micOn && !earlyAdvanceUnavailable

  return (
    <section className="panel practice-options-card">
      <div className="panel-heading">
        <h2>How it runs</h2>
      </div>

      <SwitchRow
        id="note-list"
        label="List mode"
        subtitle={
          listModeUnavailable
            ? 'Unavailable during a challenge, where each called note is scored.'
            : listModeActive
              ? 'Shuffle all selected notes once; the list stays fixed until you replace it.'
              : 'Shuffle all selected notes once; ticks continue until you regenerate.'
        }
        checked={listModeActive}
        onChange={() => onToggle('noteListMode')}
        disabled={listModeUnavailable}
      />

      {listModeActive ? (
        <>
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
            checked={micOn}
            onChange={() => onToggle('micEnabled')}
            disabled={!micSupported}
          />
          <SwitchRow
            id="advance-on-octaves"
            label="Move on when I've got it"
            subtitle={
              earlyAdvanceUnavailable
                ? 'Unavailable during a challenge, where every note runs its full length.'
                : micOn
                  ? "Once you've played the note in two octaves, the next one comes on the next click."
                  : 'Needs Listen for my playing: the mic is what hears the two octaves.'
            }
            checked={settings.advanceOnOctaves && earlyAdvanceAvailable}
            onChange={() => onToggle('advanceOnOctaves')}
            disabled={!earlyAdvanceAvailable}
          />
          <SwitchRow
            id="show-fretboard"
            label="Fretboard map"
            subtitle={
              fretboardUnavailable
                ? 'Unavailable during a challenge, where the map would give each scored note away.'
                : 'Show the On the neck card with every position.'
            }
            checked={settings.showFretboard && !fretboardUnavailable}
            onChange={() => onToggle('showFretboard')}
            disabled={fretboardUnavailable}
          />
        </>
      )}
    </section>
  )
}
