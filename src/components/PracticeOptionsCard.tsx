import type { ReactNode } from 'react'
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

/** A labelled run of switches that share a purpose, so the card reads as a few questions rather than one long list. */
function OptionGroup({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const labelId = `${id}-label`

  return (
    <div className="control-block option-group" role="group" aria-labelledby={labelId}>
      <h3 id={labelId} className="label option-group-label">
        {label}
      </h3>
      {children}
    </div>
  )
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

  const listModeSwitch = (
    <SwitchRow
      id="note-list"
      label="List mode"
      subtitle={
        listModeUnavailable
          ? 'Unavailable during a challenge, where each called note is scored.'
          : listModeActive
            ? 'All selected notes in one shuffled list, timed with a stopwatch. Order holds until you tap Shuffle list.'
            : 'One shuffled list of all selected notes, timed with a stopwatch, instead of notes called one by one. Pauses spoken notes, the mic and the fretboard.'
      }
      checked={listModeActive}
      onChange={() => onToggle('noteListMode')}
      disabled={listModeUnavailable}
    />
  )

  return (
    <section className="panel practice-options-card">
      <div className="panel-heading">
        <h2>How it runs</h2>
        <p>Switches for every session. Tempo and notes live in their own cards.</p>
      </div>

      {listModeActive ? (
        <>
          <OptionGroup id="options-list" label="Practising from a list">
            {listModeSwitch}
            <SwitchRow
              id="list-metronome"
              label="Metronome click"
              subtitle="Click along while the stopwatch runs. Off makes it a silent timed workout."
              checked={settings.listMetronomeEnabled}
              onChange={() => onToggle('listMetronomeEnabled')}
            />
            <SwitchRow
              id="count-in"
              label="Count-in"
              subtitle="Four clicks before the stopwatch starts."
              checked={settings.countInEnabled}
              onChange={() => onToggle('countInEnabled')}
            />
          </OptionGroup>
          {/* The hidden switches keep their stored values, so say they are waiting rather than gone. */}
          <p className="dashed-notice options-paused-notice">
            Loop, spoken notes, the mic, Skip ahead and the fretboard are paused in List mode. Their settings are kept.
          </p>
        </>
      ) : (
        <>
          <OptionGroup id="options-playing" label="While playing">
            <SwitchRow
              id="count-in"
              label="Count-in"
              subtitle="Four clicks before the first note and each new round."
              checked={settings.countInEnabled}
              onChange={() => onToggle('countInEnabled')}
            />
            <SwitchRow
              id="continuous-mode"
              label="Loop"
              subtitle="Keep calling notes until you press stop, in a fresh order after each full set. Off stops once every note has been called. The speed ramp needs this on."
              checked={settings.continuousMode}
              onChange={() => onToggle('continuousMode')}
            />
            <SwitchRow
              id="speak-notes"
              label="Say the note aloud"
              subtitle="Speak each note's name as it's called. Off shows it on screen only."
              checked={settings.speakNotes}
              onChange={() => onToggle('speakNotes')}
            />
          </OptionGroup>

          <OptionGroup id="options-feedback" label="Feedback">
            <SwitchRow
              id="mic-listen"
              label="Listen with the microphone"
              subtitle={
                micSupported
                  ? 'Mark the note you play right or wrong against the one called. Asks for mic access.'
                  : 'This browser has no microphone to listen with.'
              }
              checked={micOn}
              onChange={() => onToggle('micEnabled')}
              disabled={!micSupported}
            />
            {/* Hangs off the mic row: it only works while the mic is listening. */}
            <div className="switch-row-nested">
              <SwitchRow
                id="advance-on-octaves"
                label="Skip ahead once I've found it"
                subtitle={
                  earlyAdvanceUnavailable
                    ? 'Unavailable during a challenge, where every note runs its full length.'
                    : 'Once the mic hears the note in two octaves, the next one comes on the next click. Needs the microphone on.'
                }
                checked={settings.advanceOnOctaves && earlyAdvanceAvailable}
                onChange={() => onToggle('advanceOnOctaves')}
                disabled={!earlyAdvanceAvailable}
              />
            </div>
            <SwitchRow
              id="show-fretboard"
              label="Show the fretboard"
              subtitle={
                fretboardUnavailable
                  ? 'Unavailable during a challenge, where the map would give each scored note away.'
                  : 'Show where the called note sits on the neck, open to 12th fret.'
              }
              checked={settings.showFretboard && !fretboardUnavailable}
              onChange={() => onToggle('showFretboard')}
              disabled={fretboardUnavailable}
            />
          </OptionGroup>

          <OptionGroup id="options-list" label="Or practise from a list">
            {listModeSwitch}
          </OptionGroup>
        </>
      )}
    </section>
  )
}
