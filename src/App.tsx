import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlay, faStop } from '@fortawesome/free-solid-svg-icons'
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
  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [continuousMode, setContinuousMode] = useState(true)
  const [currentNote, setCurrentNote] = useState('')
  const [playbackMessage, setPlaybackMessage] = useState('Press play to start practicing notes.')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSessionRunning, setIsSessionRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  const playbackTimeoutRef = useRef<number | null>(null)
  const playbackActiveRef = useRef(false)
  const currentNotesRef = useRef<string[]>(generateShuffledNotes())
  const currentIndexRef = useRef(0)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const sessionStartRef = useRef<number | null>(null)
  const accumulatedSessionMsRef = useRef(0)
  const bpmRef = useRef(bpm)
  const continuousModeRef = useRef(continuousMode)

  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])

  useEffect(() => {
    continuousModeRef.current = continuousMode
  }, [continuousMode])

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

  useEffect(() => {
    return () => {
      stopPlayback('Playback stopped.')
      window.speechSynthesis?.cancel()
    }
  }, [])

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

  const speakNote = (note: string) => {
    const speechWindow = window as SpeechWindow

    if (!speechWindow.speechSynthesis) {
      setPlaybackMessage('Speech synthesis is unavailable in this browser.')
      return
    }

    speechWindow.speechSynthesis.cancel()

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

  const stopPlayback = (message = 'Playback stopped.') => {
    playbackActiveRef.current = false
    clearPlaybackTimeout()
    setIsPlaying(false)
    setCurrentNote('')
    setPlaybackMessage(message)
    window.speechSynthesis?.cancel()
  }

  const queueStep = (delayMs: number) => {
    clearPlaybackTimeout()
    playbackTimeoutRef.current = window.setTimeout(() => {
      void playNextStep()
    }, delayMs)
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
    setPlaybackMessage(withCountIn ? 'Get ready...' : 'Next cycle...')
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
      if (!continuousModeRef.current) {
        stopPlayback('Finished all 12 notes.')
        return
      }

      prepareNextNotes(true, false)
      queueStep(Math.round(60000 / bpmRef.current))
      return
    }

    const note = notes[currentIndexRef.current]
    const beatMs = Math.round(60000 / bpmRef.current)

    setCurrentNote(note)
    setPlaybackMessage(`${bpmRef.current} BPM`)

    const context = await ensureAudioContext()
    if (context) {
      playClick(context)
    }

    speakNote(note)
    currentIndexRef.current += 1
    queueStep(beatMs)
  }

  const startPlayback = async () => {
    const context = await ensureAudioContext()
    if (!context) {
      stopPlayback('Audio playback is unsupported in this browser.')
      return
    }

    playbackActiveRef.current = true
    setIsPlaying(true)

    if (!prepareNextNotes(false, true)) {
      return
    }

    queueStep(0)
  }

  const startSession = () => {
    if (isSessionRunning) {
      return
    }

    sessionStartRef.current = Date.now()
    setIsSessionRunning(true)
  }

  const stopSession = () => {
    if (sessionStartRef.current !== null) {
      accumulatedSessionMsRef.current += Date.now() - sessionStartRef.current
      sessionStartRef.current = null
      setElapsedMs(accumulatedSessionMsRef.current)
    }

    setIsSessionRunning(false)
  }

  const resetSession = () => {
    sessionStartRef.current = null
    accumulatedSessionMsRef.current = 0
    setElapsedMs(0)
    setIsSessionRunning(false)
  }

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <main className="app-grid">
        <section className="hero-card panel">
          <h1>Random notes generator</h1>
          <p className="lede">
            Practice all 12 chromatic notes in random order, hear each note called out on the beat.
          </p>

          <div className="now-playing">
              {
              currentNote === '' ? (
                <span className="current-note ready">
                  ...
                </span>
              ) : (
                  <strong className="current-note">{currentNote}</strong>
              )
              }            
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
              onClick={() => setContinuousMode((currentValue) => !currentValue)}
            >
              {continuousMode ? 'On' : 'Off'}
            </button>
          </div>

          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => void startPlayback()} disabled={isPlaying}>
              <FontAwesomeIcon icon={faPlay} /> Play
            </button>
            <button type="button" className="secondary-button" onClick={() => stopPlayback()} disabled={!isPlaying}>
              <FontAwesomeIcon icon={faStop} /> Stop
            </button>
          </div>
        </section>

        <section className="panel timer-panel">
          <div className="panel-heading">
            <h2>Session timer</h2>
            <p>Use this separately from playback when you want to measure a focused memorization session.</p>
          </div>

          <div className="timer-face">{formatElapsed(elapsedMs)}</div>

          <div className="button-row compact">
            <button type="button" className="primary-button" onClick={startSession} disabled={isSessionRunning}>
              Start session
            </button>
            <button type="button" className="secondary-button" onClick={stopSession} disabled={!isSessionRunning}>
              Stop session
            </button>
            <button type="button" className="ghost-button" onClick={resetSession}>
              Reset
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
