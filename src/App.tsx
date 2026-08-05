import { useEffect, useRef } from 'react'
import { TopBar, type Theme } from './components/TopBar'
import { Hero } from './components/Hero'
import { TransportBar } from './components/TransportBar'
import { TempoCard } from './components/TempoCard'
import { NotePoolCard } from './components/NotePoolCard'
import { FretboardCard } from './components/FretboardCard'
import { PracticeOptionsCard } from './components/PracticeOptionsCard'
import { SessionCard } from './components/SessionCard'
import { Footer } from './components/Footer'
import { createTapTempo, type TapTempo } from './lib/tapTempo'
import { usePersistentState } from './hooks/usePersistentState'
import { usePlayback } from './hooks/usePlayback'
import { useBeatPulse } from './hooks/useBeatPulse'
import { useSessionTimer } from './hooks/useSessionTimer'
import { useSettings } from './hooks/useSettings'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { STORAGE_KEYS } from './constants'

function App() {
  const [theme, setTheme] = usePersistentState<Theme>(STORAGE_KEYS.theme, {
    defaultValue: 'dark',
    deserialize: (raw) => (raw === 'light' || raw === 'dark' ? raw : undefined),
  })
  const [settings, dispatch] = useSettings()
  const sessionTimer = useSessionTimer()
  const beatPulse = useBeatPulse()
  const playback = usePlayback({
    settings,
    pool: settings.pool,
    spelling: settings.spelling,
    onBpmChange: (bpm) => dispatch({ type: 'setBpm', bpm }),
    onSessionStart: sessionTimer.start,
    onSessionPause: sessionTimer.pause,
    onBeat: beatPulse.handleBeat,
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const playOrPause = () => {
    if (playback.isPlaying) {
      playback.pause()
      return
    }

    void playback.start()
  }

  const resetSession = () => {
    playback.reset()
    sessionTimer.reset()
  }

  const tapTempoRef = useRef<TapTempo | null>(null)
  const handleTapTempo = () => {
    tapTempoRef.current ??= createTapTempo()
    const tapped = tapTempoRef.current.tap()
    if (tapped !== null) {
      dispatch({ type: 'setBpm', bpm: tapped })
    }
  }

  // Ear-only hides the answer (hero glyph and fretboard dots) until the last
  // beat of the note's span.
  const noteRevealed = !settings.earOnly || playback.snapshot.beatInSpan === settings.beatsPerNote - 1

  useKeyboardShortcuts({
    onSpace: playOrPause,
    onTempoUp: () => dispatch({ type: 'nudgeBpm', delta: 1 }),
    onTempoDown: () => dispatch({ type: 'nudgeBpm', delta: -1 }),
    onReset: resetSession,
  })

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <main className="app-grid">
        <TopBar
          theme={theme}
          onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
        />

        <Hero
          snapshot={playback.snapshot}
          beatsPerNote={settings.beatsPerNote}
          earOnly={settings.earOnly}
          ringRef={beatPulse.ringRef}
        />

        <TransportBar isPlaying={playback.isPlaying} onPlayPause={playOrPause} onReset={resetSession} />

        <div className="column-main">
          <TempoCard
            bpm={settings.bpm}
            beatsPerNote={settings.beatsPerNote}
            poolSize={settings.pool.length}
            onBpmChange={(bpm) => dispatch({ type: 'setBpm', bpm })}
            onNudge={(delta) => dispatch({ type: 'nudgeBpm', delta })}
            onTap={handleTapTempo}
            onBeatsPerNoteChange={(value) => dispatch({ type: 'setBeatsPerNote', value })}
          />

          <NotePoolCard
            pool={settings.pool}
            spelling={settings.spelling}
            onTogglePc={(pc) => dispatch({ type: 'togglePoolNote', pc })}
            onPreset={(preset) => dispatch({ type: 'setPreset', preset })}
            onSpelling={(value) => dispatch({ type: 'setSpelling', value })}
          />

          <FretboardCard currentPc={playback.snapshot.currentNote?.pc ?? null} revealed={noteRevealed} />
        </div>

        <div className="column-side">
          <PracticeOptionsCard settings={settings} onToggle={(key) => dispatch({ type: 'toggle', key })} />

          <SessionCard
            elapsedMs={sessionTimer.elapsedMs}
            goalMin={settings.sessionGoalMin}
            onGoal={(minutes) => dispatch({ type: 'setSessionGoal', minutes })}
            notesCalled={playback.snapshot.notesCalled}
            cyclesCompleted={playback.snapshot.cyclesCompleted}
          />
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default App
