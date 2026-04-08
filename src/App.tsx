import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHeart, faMoon, faMugHot, faPause, faPlay, faRotateLeft, faSun } from '@fortawesome/free-solid-svg-icons'
import { faGithub, faInstagram } from '@fortawesome/free-brands-svg-icons'
import { getChromaticScale, speakableNoteName } from './lib/music'

type SpeechWindow = Window & {
  speechSynthesis?: SpeechSynthesis
  webkitAudioContext?: typeof AudioContext
}

const MIN_BPM = 10
const MAX_BPM = 100
const DEFAULT_BPM = 30
const COUNT_IN_BEATS = 3
const COUNT_IN_MS = 650
const PREFERRED_VOICE_NAME = 'Samantha'
const THEME_STORAGE_KEY = 'fretboard-theme'
const BPM_STORAGE_KEY = 'fretboard-bpm'
const CONTINUOUS_MODE_STORAGE_KEY = 'fretboard-continuous-mode'
const SPEED_RAMP_MODE_STORAGE_KEY = 'fretboard-speed-ramp-mode'
const LAST_SESSION_MS_STORAGE_KEY = 'fretboard-last-session-ms'

type Theme = 'dark' | 'light'

const formatElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

const generateShuffledNotes = (): string[] => {
  const notes = getChromaticScale(Math.random() < 0.5 ? 'sharp' : 'flat')
  const shuffled = [...notes]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return 'dark'
    }

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [bpm, setBpm] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_BPM
    }

    const storedBpmRaw = window.localStorage.getItem(BPM_STORAGE_KEY)
    if (storedBpmRaw === null) {
      return DEFAULT_BPM
    }

    const storedBpm = Number(storedBpmRaw)
    if (!Number.isFinite(storedBpm)) {
      return DEFAULT_BPM
    }

    return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(storedBpm)))
  })
  const [continuousMode, setContinuousMode] = useState(() => {
    if (typeof window === 'undefined') {
      return true
    }

    const storedMode = window.localStorage.getItem(CONTINUOUS_MODE_STORAGE_KEY)
    return storedMode === null ? true : storedMode === 'true'
  })
  const [speedRampMode, setSpeedRampMode] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    const storedContinuousMode = window.localStorage.getItem(CONTINUOUS_MODE_STORAGE_KEY)
    const isContinuousEnabled = storedContinuousMode === null ? true : storedContinuousMode === 'true'
    const storedMode = window.localStorage.getItem(SPEED_RAMP_MODE_STORAGE_KEY)
    const isSpeedRampEnabled = storedMode === null ? false : storedMode === 'true'
    return isContinuousEnabled && isSpeedRampEnabled
  })
  const [currentNote, setCurrentNote] = useState('A♭')
  const [playbackMessage, setPlaybackMessage] = useState('Press play to start.')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isSessionRunning, setIsSessionRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(() => {
    if (typeof window === 'undefined') {
      return 0
    }

    const storedElapsed = Number(window.localStorage.getItem(LAST_SESSION_MS_STORAGE_KEY))
    return Number.isFinite(storedElapsed) && storedElapsed > 0 ? Math.round(storedElapsed) : 0
  })

  const audioContextRef = useRef<AudioContext | null>(null)
  const playbackTimeoutRef = useRef<number | null>(null)
  const playbackActiveRef = useRef(false)
  const currentNotesRef = useRef<string[]>(generateShuffledNotes())
  const currentIndexRef = useRef(0)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const sessionStartQueuedRef = useRef(false)
  const sessionStartRef = useRef<number | null>(null)
  const accumulatedSessionMsRef = useRef(elapsedMs)
  const bpmRef = useRef(bpm)
  const continuousModeRef = useRef(continuousMode)
  const speedRampModeRef = useRef(speedRampMode)
  const isPlayingRef = useRef(isPlaying)
  const startPlaybackRef = useRef<() => void>(() => {})
  const pausePlaybackRef = useRef<() => void>(() => {})
  const resetSessionRef = useRef<() => void>(() => {})

  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])

  useEffect(() => {
    continuousModeRef.current = continuousMode
  }, [continuousMode])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    speedRampModeRef.current = speedRampMode
  }, [speedRampMode])

  useEffect(() => {
    window.localStorage.setItem(BPM_STORAGE_KEY, String(bpm))
  }, [bpm])

  useEffect(() => {
    window.localStorage.setItem(CONTINUOUS_MODE_STORAGE_KEY, String(continuousMode))
  }, [continuousMode])

  useEffect(() => {
    window.localStorage.setItem(SPEED_RAMP_MODE_STORAGE_KEY, String(speedRampMode))
  }, [speedRampMode])

  useEffect(() => {
    window.localStorage.setItem(LAST_SESSION_MS_STORAGE_KEY, String(Math.max(0, Math.round(elapsedMs))))
  }, [elapsedMs])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const speechWindow = window as SpeechWindow
    const loadVoices = () => {
      if (!speechWindow.speechSynthesis) {
        return
      }

      voicesRef.current = speechWindow.speechSynthesis.getVoices()
    }

    loadVoices()
    speechWindow.speechSynthesis?.addEventListener('voiceschanged', loadVoices)

    return () => {
      speechWindow.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
    }
  }, [])

  useEffect(() => {
    if (!isSessionRunning) {
      return undefined
    }

    const timer = window.setInterval(() => {
      if (sessionStartRef.current === null) {
        return
      }

      setElapsedMs(accumulatedSessionMsRef.current + (Date.now() - sessionStartRef.current))
    }, 200)

    return () => {
      window.clearInterval(timer)
    }
  }, [isSessionRunning])

  const ensureAudioContext = async () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      return audioContextRef.current
    }

    const AudioContextClass = window.AudioContext ?? (window as SpeechWindow).webkitAudioContext

    if (!AudioContextClass) {
      return null
    }

    const context = new AudioContextClass()
    await context.resume()
    audioContextRef.current = context

    return context
  }

  const playClick = (context: AudioContext) => {
    const startTime = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(880, startTime)
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(0.08, startTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startTime)
    oscillator.stop(startTime + 0.14)
  }

  const warmUpSpeech = (): Promise<void> => {
    const speechWindow = window as SpeechWindow
    if (!speechWindow.speechSynthesis) return Promise.resolve()

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance('\u200b')
      utterance.volume = 0
      const done = () => { window.clearTimeout(fallback); resolve() }
      utterance.onend = done
      utterance.onerror = done
      const fallback = window.setTimeout(resolve, 800)
      speechWindow.speechSynthesis.speak(utterance)
    })
  }

  const speakNote = (note: string) => {
    const speechWindow = window as SpeechWindow

    if (!speechWindow.speechSynthesis) {
      setPlaybackMessage('Speech synthesis is unavailable in this browser.')
      return
    }

    if (speechWindow.speechSynthesis.speaking || speechWindow.speechSynthesis.pending) {
      speechWindow.speechSynthesis.cancel()
    }

    const utterance = new SpeechSynthesisUtterance(speakableNoteName(note))
    const preferredVoice =
      voicesRef.current.find((voice) => voice.name.toLowerCase() === PREFERRED_VOICE_NAME.toLowerCase()) ??
      voicesRef.current.find((voice) => voice.name.toLowerCase().includes(PREFERRED_VOICE_NAME.toLowerCase())) ??
      voicesRef.current.find((voice) => voice.lang.startsWith('en')) ??
      voicesRef.current[0]

    if (preferredVoice) {
      utterance.voice = preferredVoice
    }

    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    speechWindow.speechSynthesis.speak(utterance)
  }

  const clearPlaybackTimeout = () => {
    if (playbackTimeoutRef.current !== null) {
      window.clearTimeout(playbackTimeoutRef.current)
      playbackTimeoutRef.current = null
    }
  }

  const startSessionTimer = () => {
    if (isSessionRunning) {
      return
    }

    sessionStartRef.current = Date.now()
    setIsSessionRunning(true)
  }

  const stopSessionTimer = () => {
    if (sessionStartRef.current !== null) {
      accumulatedSessionMsRef.current += Date.now() - sessionStartRef.current
      sessionStartRef.current = null
      setElapsedMs(accumulatedSessionMsRef.current)
    }

    setIsSessionRunning(false)
  }

  function stopPlayback(message = 'Press play to start.') {
    playbackActiveRef.current = false
    clearPlaybackTimeout()
    sessionStartQueuedRef.current = false
    setIsPlaying(false)
    setIsPaused(false)
    stopSessionTimer()
    setCurrentNote('A♭')
    setPlaybackMessage(message)
    window.speechSynthesis?.cancel()
  }

  function pausePlayback() {
    if (!playbackActiveRef.current) {
      return
    }

    playbackActiveRef.current = false
    clearPlaybackTimeout()
    setIsPlaying(false)
    setIsPaused(true)
    stopSessionTimer()
    setPlaybackMessage('Paused')
    window.speechSynthesis?.cancel()
  }

  const queueStep = (delayMs: number) => {
    clearPlaybackTimeout()
    playbackTimeoutRef.current = window.setTimeout(() => {
      void playNextStep()
    }, delayMs)
  }

  const applySpeedRamp = () => {
    if (!continuousModeRef.current || !speedRampModeRef.current) {
      return bpmRef.current
    }

    const nextBpm = Math.min(MAX_BPM, bpmRef.current + 5)
    if (nextBpm !== bpmRef.current) {
      setBpm(nextBpm)
    }

    return nextBpm
  }

  const prepareNextNotes = (shouldReshuffle = false, withCountIn = false): boolean => {
    if (shouldReshuffle) {
      // Reshuffle the existing notes for the next cycle
      currentNotesRef.current = generateShuffledNotes()
    } else {
      // Generate fresh notes for the first time
      currentNotesRef.current = generateShuffledNotes()
    }

    currentIndexRef.current = withCountIn ? -COUNT_IN_BEATS : 0
    setCurrentNote(withCountIn ? String(COUNT_IN_BEATS) : '')
    setPlaybackMessage(withCountIn ? 'Get ready...' : 'Get ready...')
    return true
  }

  const playNextStep = async () => {
    if (!playbackActiveRef.current) {
      return
    }

    const notes = currentNotesRef.current

    if (!notes || notes.length === 0) {
      stopPlayback('No notes available.')
      return
    }

    if (currentIndexRef.current < 0) {
      const countValue = Math.abs(currentIndexRef.current)

      setCurrentNote(String(countValue))
      setPlaybackMessage(`Starting in ${countValue}...`)

      const context = await ensureAudioContext()
      if (context) {
        playClick(context)
      }

      currentIndexRef.current += 1
      queueStep(COUNT_IN_MS)
      return
    }

    if (currentIndexRef.current >= notes.length) {
      const nextBpm = applySpeedRamp()

      if (!continuousModeRef.current) {
        stopPlayback(speedRampModeRef.current ? `Finished all 12 notes. BPM set to ${nextBpm}.` : 'Finished all 12 notes.')
        return
      }

      prepareNextNotes(true, false)
      queueStep(Math.round(60000 / nextBpm))
      return
    }

    const note = notes[currentIndexRef.current]
    const beatMs = Math.round(60000 / bpmRef.current)

    if (sessionStartQueuedRef.current) {
      sessionStartQueuedRef.current = false
      startSessionTimer()
    }

    setCurrentNote(note)
    setPlaybackMessage('')

    const context = await ensureAudioContext()
    if (context) {
      playClick(context)
    }

    speakNote(note)
    currentIndexRef.current += 1
    queueStep(beatMs)
  }

  async function startPlayback() {
    if (isPaused) {
      setIsPlaying(true)
      setIsPaused(false)

      if (!sessionStartQueuedRef.current) {
        startSessionTimer()
      }

      playbackActiveRef.current = true
      setPlaybackMessage('Resuming...')
      queueStep(0)
      return
    }

    const context = await ensureAudioContext()
    if (!context) {
      stopPlayback('Audio playback is unsupported in this browser.')
      return
    }

    sessionStartQueuedRef.current = true
    setIsPlaying(true)
    setIsPaused(false)
    setPlaybackMessage('Warming up speech...')
    await warmUpSpeech()

    playbackActiveRef.current = true

    if (!prepareNextNotes(false, true)) {
      return
    }

    queueStep(0)
  }

  function resetSession() {
    sessionStartQueuedRef.current = false
    stopSessionTimer()
    sessionStartRef.current = null
    accumulatedSessionMsRef.current = 0
    setElapsedMs(0)

    if (playbackActiveRef.current) {
      sessionStartRef.current = Date.now()
      setIsSessionRunning(true)
    }
  }

  useEffect(() => {
    startPlaybackRef.current = () => {
      void startPlayback()
    }
    pausePlaybackRef.current = pausePlayback
    resetSessionRef.current = resetSession
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isTypingContext = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable

      if (isTypingContext || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()

        if (isPlayingRef.current) {
          pausePlaybackRef.current()
          return
        }

        startPlaybackRef.current()
        return
      }

      if (event.code === 'ArrowUp') {
        event.preventDefault()
        setBpm((current) => Math.min(MAX_BPM, current + 1))
        return
      }

      if (event.code === 'ArrowDown') {
        event.preventDefault()
        setBpm((current) => Math.max(MIN_BPM, current - 1))
        return
      }

      if (event.code === 'KeyR') {
        event.preventDefault()
        resetSessionRef.current()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    return () => {
      playbackActiveRef.current = false
      clearPlaybackTimeout()
      sessionStartQueuedRef.current = false
      window.speechSynthesis?.cancel()
    }
  }, [])

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <main className="app-grid">
        <div className="topbar">
          <button
            type="button"
            className="theme-toggle"
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
            Practice all 12 chromatic notes in random order, hear each note called out on the beat.
          </p>

          <div className={`now-playing ${isPlaying ? 'active' : 'idle'}`}>
            {currentNote !== '' ? <strong key={currentNote} className="current-note note-pop">{currentNote}</strong> : null}
          </div>

          <p className="playback-message">{playbackMessage}</p>
        </section>

        <section className="panel controls-panel">
          <div className="panel-heading">
            <h2>Settings</h2>
            <p>Metronome timing drives the click. Browser speech announces the note names on each beat.</p>
          </div>

          <div className="control-block">
            <div className="slider-row">
              <label htmlFor="bpm-slider">Metronome BPM</label>
              <output>{bpm}</output>
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
              <span className="label">Target time (12 notes)</span>
              <span className="target-time">{formatElapsed((12 * 60000) / bpm)}</span>
            </div>
          </div>

          <div className="toggle-row">
            <label htmlFor="continuous-mode">Continuous mode</label>
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
              <label htmlFor="speed-ramp-mode">Speed ramp mode (+5 BPM per cycle)</label>
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
              onClick={() => {
                if (isPlaying) {
                  pausePlayback()
                  return
                }

                void startPlayback()
              }}
            >
              <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} /> {isPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
        </section>

        <section className="panel timer-panel">
          <div className="panel-heading">
            <h2>Session timer</h2>
            <p>The timer starts automatically when playback starts and pauses when playback stops.</p>
          </div>

          <div className="timer-face">{formatElapsed(elapsedMs)}</div>

          <div className="button-row compact">
            <button type="button" className="ghost-button" onClick={resetSession}>
              <FontAwesomeIcon icon={faRotateLeft} /> Reset
            </button>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <p>
          Made with <FontAwesomeIcon icon={faHeart} className="heart-icon" /> by Adam Wolski
        </p>
        <div className="footer-links">
          <a
            className="social-link"
            href="https://github.com/wolasso/fretboard-master"
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
            href="https://www.buymeacoffee.com/wolasso"
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
