import { useEffect } from 'react'
import { TopBar, type Theme } from './components/TopBar'
import { Hero } from './components/Hero'
import { TransportBar } from './components/TransportBar'
import { ControlsPanel } from './components/ControlsPanel'
import { TimerPanel } from './components/TimerPanel'
import { Footer } from './components/Footer'
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

        <ControlsPanel
          bpm={settings.bpm}
          beatsPerNote={settings.beatsPerNote}
          onBpmChange={(bpm) => dispatch({ type: 'setBpm', bpm })}
          continuousMode={settings.continuousMode}
          onToggleContinuousMode={() => dispatch({ type: 'toggle', key: 'continuousMode' })}
          speedRampMode={settings.speedRampMode}
          onToggleSpeedRampMode={() => dispatch({ type: 'toggle', key: 'speedRampMode' })}
        />

        <TimerPanel elapsedMs={sessionTimer.elapsedMs} />
      </main>

      <Footer />
    </div>
  )
}

export default App
