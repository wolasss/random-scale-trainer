import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHeart, faMoon, faMugHot, faPause, faPlay, faRotateLeft, faSun } from '@fortawesome/free-solid-svg-icons'
import { faGithub, faInstagram } from '@fortawesome/free-brands-svg-icons'
import { usePersistentState } from './hooks/usePersistentState'
import { usePlayback } from './hooks/usePlayback'
import { useSessionTimer } from './hooks/useSessionTimer'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { formatElapsed } from './lib/time'
import { DEFAULT_BPM, MAX_BPM, MIN_BPM, STORAGE_KEYS } from './constants'
import { version } from '../package.json'

type Theme = 'dark' | 'light'

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
  const { note: currentNote, message: playbackMessage } = playback.snapshot
  const { isPlaying, isPaused } = playback

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const resetSession = () => {
    playback.reset()
    sessionTimer.reset()
  }

  useKeyboardShortcuts({
    onSpace: () => {
      if (playback.isPlaying) {
        playback.pause()
        return
      }

      void playback.start()
    },
    onArrowUp: () => setBpm((current) => Math.min(MAX_BPM, current + 1)),
    onArrowDown: () => setBpm((current) => Math.max(MIN_BPM, current - 1)),
    onReset: resetSession,
  })

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <main className="app-grid">
        <div className="topbar">
          <button
            type="button"
            className="theme-toggle"
            data-testid="theme-toggle"
            onClick={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>

        <section className="hero-card panel">
          <h1>Random notes generator</h1>
          <p className="lede">
            Train music notes in random order. Hear each note on the beat
          </p>

          <div className={`now-playing ${isPlaying ? 'active' : isPaused ? 'paused' : 'idle'}`} data-testid="now-playing">
            {currentNote !== '' ? <strong key={currentNote} className="current-note note-pop" data-testid="current-note">{currentNote}</strong> : null}
          </div>

          <p className="playback-message" data-testid="playback-message">{playbackMessage}</p>
        </section>

        <section className="panel controls-panel">
          <div className="panel-heading">
            <h2>Practice settings</h2>
            <p>The metronome sets the tempo. Each note is spoken on the beat.</p>
          </div>

          <div className="control-block">
            <div className="slider-row">
              <label htmlFor="bpm-slider">Metronome BPM</label>
              <output data-testid="bpm-value">{bpm}</output>
            </div>
            <input
              id="bpm-slider"
              type="range"
              min={MIN_BPM}
              max={MAX_BPM}
              value={bpm}
              onChange={(event) => setBpm(Number(event.target.value))}
            />
            <div className="range-hints">
              <span>{MIN_BPM}</span>
              <span>{MAX_BPM}</span>
            </div>

            <div className="target-time-info">
              <span className="label">Cycle time (12 notes)</span>
              <span className="target-time">{formatElapsed((12 * 60000) / bpm)}</span>
            </div>
          </div>

          <div className="toggle-row">
            <label htmlFor="continuous-mode">Loop continuously</label>
            <button
              id="continuous-mode"
              type="button"
              className={`toggle ${continuousMode ? 'enabled' : ''}`}
              onClick={() => {
                setContinuousMode((currentValue) => {
                  const nextValue = !currentValue
                  if (!nextValue) {
                    setSpeedRampMode(false)
                  }

                  return nextValue
                })
              }}
            >
              {continuousMode ? 'On' : 'Off'}
            </button>
          </div>

          {continuousMode ? (
            <div className="toggle-row">
              <label htmlFor="speed-ramp-mode">Speed ramp mode (+2 BPM per cycle)</label>
              <button
                id="speed-ramp-mode"
                type="button"
                className={`toggle ${speedRampMode ? 'enabled' : ''}`}
                onClick={() => setSpeedRampMode((currentValue) => !currentValue)}
              >
                {speedRampMode ? 'On' : 'Off'}
              </button>
            </div>
          ) : null}

          <div className="button-row transport-row">
            <button
              type="button"
              className={isPlaying ? 'secondary-button' : 'primary-button'}
              data-testid="play-toggle"
              onClick={() => {
                if (isPlaying) {
                  playback.pause()
                  return
                }

                void playback.start()
              }}
            >
              <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} /> {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="ghost-button" data-testid="reset" onClick={resetSession}>
              <FontAwesomeIcon icon={faRotateLeft} /> Reset
            </button>
          </div>
        </section>

        <section className="panel timer-panel">
          <div className="panel-heading">
            <h2>Session timer</h2>
            <p>The timer starts automatically when playback starts and pauses when playback stops.</p>
          </div>

          <div className="timer-face" data-testid="timer">{formatElapsed(sessionTimer.elapsedMs)}</div>
        </section>
      </main>

      <footer className="app-footer">
        <p>
          Made with <FontAwesomeIcon icon={faHeart} className="heart-icon" /> by Adam Wolski
        </p>
        <p className="app-version">v{version}</p>
        <div className="footer-links">
          <a
            className="social-link"
            href="https://github.com/wolasss/random-scale-trainer"
            target="_blank"
            rel="noreferrer"
            aria-label="Project on GitHub"
            title="GitHub"
          >
            <FontAwesomeIcon icon={faGithub} />
          </a>
          <a
            className="social-link"
            href="https://www.instagram.com/wolasso"
            target="_blank"
            rel="noreferrer"
            aria-label="wolasso on Instagram"
            title="Instagram"
          >
            <FontAwesomeIcon icon={faInstagram} />
          </a>
          <a
            className="coffee-button"
            href="https://www.buymeacoffee.com/wolas"
            target="_blank"
            rel="noreferrer"
          >
            <FontAwesomeIcon icon={faMugHot} /> Buy me a coffee
          </a>
        </div>
      </footer>
    </div>
  )
}

export default App
