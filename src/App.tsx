import { useEffect } from 'react'
import { TopBar, type Theme } from './components/TopBar'
import { HeroCard } from './components/HeroCard'
import { ControlsPanel } from './components/ControlsPanel'
import { TimerPanel } from './components/TimerPanel'
import { Footer } from './components/Footer'
import { usePersistentState } from './hooks/usePersistentState'
import { usePlayback } from './hooks/usePlayback'
import { useSessionTimer } from './hooks/useSessionTimer'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { DEFAULT_BPM, MAX_BPM, MIN_BPM, STORAGE_KEYS } from './constants'

function App() {
  const [theme, setTheme] = usePersistentState<Theme>(STORAGE_KEYS.theme, {
    defaultValue: 'dark',
    deserialize: (raw) => (raw === 'light' || raw === 'dark' ? raw : undefined),
  })
  const [bpm, setBpm] = usePersistentState<number>(STORAGE_KEYS.bpm, {
    defaultValue: DEFAULT_BPM,
    deserialize: (raw) => {
      const stored = Number(raw)
      return Number.isFinite(stored) ? Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(stored))) : undefined
    },
  })
  const [continuousMode, setContinuousMode] = usePersistentState<boolean>(STORAGE_KEYS.continuousMode, {
    defaultValue: true,
    deserialize: (raw) => raw === 'true',
  })
  // Speed ramp only applies while looping: a stored "true" is discarded when
  // continuous mode starts off (continuousMode is initialized just above).
  const [speedRampMode, setSpeedRampMode] = usePersistentState<boolean>(STORAGE_KEYS.speedRampMode, {
    defaultValue: false,
    deserialize: (raw) => raw === 'true' && continuousMode,
  })
  // Stored setting without UI: deliberately kept read-only for now.
  const [endSoundEnabled] = usePersistentState<boolean>(STORAGE_KEYS.endSound, {
    defaultValue: true,
    deserialize: (raw) => raw === 'true',
  })
  const sessionTimer = useSessionTimer()
  const playback = usePlayback({
    settings: { bpm, continuousMode, speedRampMode, endSoundEnabled },
    onBpmChange: setBpm,
    onSessionStart: sessionTimer.start,
    onSessionPause: sessionTimer.pause,
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

  const toggleContinuousMode = () => {
    setContinuousMode((currentValue) => {
      const nextValue = !currentValue
      if (!nextValue) {
        setSpeedRampMode(false)
      }

      return nextValue
    })
  }

  useKeyboardShortcuts({
    onSpace: playOrPause,
    onArrowUp: () => setBpm((current) => Math.min(MAX_BPM, current + 1)),
    onArrowDown: () => setBpm((current) => Math.max(MIN_BPM, current - 1)),
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

        <HeroCard
          note={playback.snapshot.note}
          message={playback.snapshot.message}
          isPlaying={playback.isPlaying}
          isPaused={playback.isPaused}
        />

        <ControlsPanel
          bpm={bpm}
          onBpmChange={setBpm}
          continuousMode={continuousMode}
          onToggleContinuousMode={toggleContinuousMode}
          speedRampMode={speedRampMode}
          onToggleSpeedRampMode={() => setSpeedRampMode((currentValue) => !currentValue)}
          isPlaying={playback.isPlaying}
          onPlayPause={playOrPause}
          onReset={resetSession}
        />

        <TimerPanel elapsedMs={sessionTimer.elapsedMs} />
      </main>

      <Footer />
    </div>
  )
}

export default App
