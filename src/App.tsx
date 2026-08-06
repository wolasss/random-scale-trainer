import { useCallback, useEffect, useRef } from 'react'
import { TopBar, type Theme } from './components/TopBar'
import { Hero } from './components/Hero'
import { TransportBar } from './components/TransportBar'
import { TempoCard } from './components/TempoCard'
import { NotePoolCard } from './components/NotePoolCard'
import { FretboardCard } from './components/FretboardCard'
import { PracticeOptionsCard } from './components/PracticeOptionsCard'
import { SessionCard } from './components/SessionCard'
import { RoutineCard } from './components/RoutineCard'
import { RoutineStrip } from './components/RoutineStrip'
import { Footer } from './components/Footer'
import { createTapTempo, type TapTempo } from './lib/tapTempo'
import { usePersistentState } from './hooks/usePersistentState'
import { usePlayback } from './hooks/usePlayback'
import { useBeatPulse } from './hooks/useBeatPulse'
import { useSessionTimer } from './hooks/useSessionTimer'
import { useSettings, type SettingsAction } from './hooks/useSettings'
import { useRoutine } from './hooks/useRoutine'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { PLAYBACK_MESSAGES, STORAGE_KEYS } from './constants'

function App() {
  const [theme, setTheme] = usePersistentState<Theme>(STORAGE_KEYS.theme, {
    defaultValue: 'dark',
    deserialize: (raw) => (raw === 'light' || raw === 'dark' ? raw : undefined),
  })
  const [settings, dispatch] = useSettings()

  // The session timer, playback and the routine all need handles on each
  // other, so they go through refs that are refreshed on every render.
  const playbackRef = useRef<ReturnType<typeof usePlayback> | null>(null)
  const routineRef = useRef<ReturnType<typeof useRoutine> | null>(null)

  // The block clock rides the session timer's tick, so it pauses with playback.
  const sessionTimer = useSessionTimer({ onTick: (elapsedMs) => routineRef.current?.tick(elapsedMs) })
  const beatPulse = useBeatPulse()

  const playback = usePlayback({
    // Count-in and the spoken note are always on; only the listed settings vary.
    settings: { ...settings, countInEnabled: true, speakNotes: true },
    pool: settings.pool,
    spelling: settings.spelling,
    // The speed ramp's write-back goes to the raw dispatch: it is the routine's
    // own doing, never the user drifting off one.
    onBpmChange: (bpm) => dispatch({ type: 'setBpm', bpm }),
    onSessionStart: sessionTimer.start,
    onSessionPause: sessionTimer.pause,
    onBeat: beatPulse.handleBeat,
  })

  const routine = useRoutine({
    settings,
    dispatch,
    sessionElapsedMs: sessionTimer.elapsedMs,
    isPlaying: playback.isPlaying,
    onFinish: useCallback(() => playbackRef.current?.stop(PLAYBACK_MESSAGES.routineComplete), []),
  })

  useEffect(() => {
    playbackRef.current = playback
    routineRef.current = routine
  })

  /**
   * Every settings change made by hand goes through here, so the routine can
   * tell the user's edits apart from its own block changes.
   */
  const userDispatch = (action: SettingsAction) => {
    routine.notifyManualChange(action)
    dispatch(action)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const playOrPause = () => {
    if (playback.isPlaying) {
      playback.pause()
      return
    }

    // Starting a finished routine runs it again from block 0.
    if (routine.finished) {
      routine.restart()
    }

    void playback.start()
  }

  const resetSession = () => {
    playback.reset()
    sessionTimer.reset()
    routine.reset()
  }

  const tapTempoRef = useRef<TapTempo | null>(null)
  const handleTapTempo = () => {
    tapTempoRef.current ??= createTapTempo()
    const tapped = tapTempoRef.current.tap()
    if (tapped !== null) {
      userDispatch({ type: 'setBpm', bpm: tapped })
    }
  }

  useKeyboardShortcuts({
    onSpace: playOrPause,
    onTempoUp: () => userDispatch({ type: 'nudgeBpm', delta: 1 }),
    onTempoDown: () => userDispatch({ type: 'nudgeBpm', delta: -1 }),
    onReset: resetSession,
  })

  const activeBlock = routine.selected?.blocks[routine.blockIndex] ?? null
  // A multi-block routine names its current block; anything else keeps the
  // existing coaching lines.
  const heroMessage =
    playback.isPlaying && routine.selected !== null && routine.selected.blocks.length > 1 && activeBlock !== null
      ? `${routine.selected.name} · block ${routine.blockIndex + 1} of ${routine.selected.blocks.length} — ${activeBlock.name}`
      : undefined

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <main className="app-grid">
        <TopBar
          theme={theme}
          onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
        />

        <div className="column-main">
          <Hero
            snapshot={playback.snapshot}
            beatsPerNote={settings.beatsPerNote}
            poolSize={settings.pool.length}
            ringRef={beatPulse.ringRef}
            message={heroMessage}
            strip={
              routine.selected !== null ? (
                <RoutineStrip
                  routine={routine.selected}
                  blockIndex={routine.blockIndex}
                  blockElapsedMs={routine.blockElapsedMs}
                  finished={routine.finished}
                  onClear={routine.clear}
                />
              ) : null
            }
          />

          <TransportBar
            isPlaying={playback.isPlaying}
            isPaused={playback.isPaused}
            routineName={routine.selected?.name ?? null}
            routineFinished={routine.finished}
            onPlayPause={playOrPause}
            onReset={resetSession}
          />

          <TempoCard
            bpm={settings.bpm}
            beatsPerNote={settings.beatsPerNote}
            poolSize={settings.pool.length}
            onBpmChange={(bpm) => userDispatch({ type: 'setBpm', bpm })}
            onNudge={(delta) => userDispatch({ type: 'nudgeBpm', delta })}
            onTap={handleTapTempo}
            onBeatsPerNoteChange={(value) => userDispatch({ type: 'setBeatsPerNote', value })}
          />

          <NotePoolCard
            pool={settings.pool}
            spelling={settings.spelling}
            onTogglePc={(pc) => userDispatch({ type: 'togglePoolNote', pc })}
            onPreset={(preset) => userDispatch({ type: 'setPreset', preset })}
            onSpelling={(value) => userDispatch({ type: 'setSpelling', value })}
          />
        </div>

        <div className="column-side">
          <SessionCard
            elapsedMs={sessionTimer.elapsedMs}
            goalMin={settings.sessionGoalMin}
            onGoal={(minutes) => dispatch({ type: 'setSessionGoal', minutes })}
            notesCalled={playback.snapshot.notesCalled}
            cyclesCompleted={playback.snapshot.cyclesCompleted}
          />

          {settings.showFretboard ? (
            <FretboardCard
              currentPc={playback.snapshot.currentNote?.pc ?? null}
              currentDisplay={playback.snapshot.currentNote?.display ?? null}
            />
          ) : null}

          <PracticeOptionsCard settings={settings} onToggle={(key) => dispatch({ type: 'toggle', key })} />
        </div>

        {/* Below the practice controls: a pre-flight choice, not the product. */}
        <RoutineCard routine={routine} />
      </main>

      <Footer />
    </div>
  )
}

export default App
