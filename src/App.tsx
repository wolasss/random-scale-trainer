import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SCALES } from './data/defaultScales'
import { generateRandomScale, parseIntervals, speakableNoteName, type GeneratedScale, type ScaleDefinition } from './lib/music'

type LibraryScale = {
  id: string
  name: string
  intervalText: string
  enabled: boolean
}

type SpeechWindow = Window & {
  speechSynthesis?: SpeechSynthesis
  webkitAudioContext?: typeof AudioContext
}

const MIN_BPM = 50
const MAX_BPM = 180
const DEFAULT_BPM = 88

const formatElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

const normalizeScaleLibrary = (library: LibraryScale[]): ScaleDefinition[] =>
  library
    .map((scale) => ({
      id: scale.id,
      name: scale.name.trim(),
      intervals: parseIntervals(scale.intervalText),
    }))
    .filter((scale) => scale.name.length > 0 && scale.intervals.length >= 2)

const createNewScale = (index: number): LibraryScale => ({
  id: `custom-${index}`,
  name: `Custom ${index + 1}`,
  intervalText: '0, 3, 5, 7, 10, 12',
  enabled: true,
})

function App() {
  const [scaleLibrary, setScaleLibrary] = useState<LibraryScale[]>(DEFAULT_SCALES)
  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [continuousMode, setContinuousMode] = useState(true)
  const [currentScale, setCurrentScale] = useState<GeneratedScale | null>(null)
  const [currentNote, setCurrentNote] = useState('Ready')
  const [playbackMessage, setPlaybackMessage] = useState('Press play to generate a random scale.')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSessionRunning, setIsSessionRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [audioReady, setAudioReady] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const playbackTimeoutRef = useRef<number | null>(null)
  const playbackActiveRef = useRef(false)
  const currentSequenceRef = useRef<GeneratedScale | null>(null)
  const currentIndexRef = useRef(0)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const sessionStartRef = useRef<number | null>(null)
  const accumulatedSessionMsRef = useRef(0)
  const bpmRef = useRef(bpm)
  const continuousModeRef = useRef(continuousMode)

  const availableScales = useMemo(
    () => normalizeScaleLibrary(scaleLibrary.filter((scale) => scale.enabled)),
    [scaleLibrary],
  )

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

  const updateScale = (scaleId: string, patch: Partial<LibraryScale>) => {
    setScaleLibrary((currentLibrary) =>
      currentLibrary.map((scale) => (scale.id === scaleId ? { ...scale, ...patch } : scale)),
    )
  }

  const removeScale = (scaleId: string) => {
    setScaleLibrary((currentLibrary) => currentLibrary.filter((scale) => scale.id !== scaleId))
  }

  const addScale = () => {
    setScaleLibrary((currentLibrary) => [...currentLibrary, createNewScale(currentLibrary.length)])
  }

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
    setAudioReady(true)

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
    const preferredVoice = voicesRef.current.find((voice) => voice.lang.startsWith('en')) ?? voicesRef.current[0]

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
    setCurrentNote('Ready')
    setPlaybackMessage(message)
    window.speechSynthesis?.cancel()
  }

  const queueStep = (delayMs: number) => {
    clearPlaybackTimeout()
    playbackTimeoutRef.current = window.setTimeout(() => {
      void playNextStep()
    }, delayMs)
  }

  const prepareNextScale = () => {
    const nextScale = generateRandomScale(availableScales)

    if (!nextScale) {
      stopPlayback('Enable at least one scale with two or more intervals before playing.')
      return false
    }

    currentSequenceRef.current = nextScale
    currentIndexRef.current = 0
    setCurrentScale(nextScale)
    setCurrentNote('Get ready')
    setPlaybackMessage(`Loaded ${nextScale.label}.`)

    return true
  }

  const playNextStep = async () => {
    if (!playbackActiveRef.current) {
      return
    }

    const sequence = currentSequenceRef.current

    if (!sequence) {
      stopPlayback('No scale is available to play.')
      return
    }

    if (currentIndexRef.current >= sequence.notes.length) {
      if (!continuousModeRef.current) {
        stopPlayback(`Finished ${sequence.label}.`)
        return
      }

      const hasScale = prepareNextScale()

      if (!hasScale) {
        return
      }

      queueStep(Math.round(60000 / bpmRef.current))
      return
    }

    const note = sequence.notes[currentIndexRef.current]
    const beatMs = Math.round(60000 / bpmRef.current)

    setCurrentScale(sequence)
    setCurrentNote(note)
    setPlaybackMessage(`Playing ${sequence.label} at ${bpmRef.current} BPM.`)

    const context = await ensureAudioContext()
    if (context) {
      playClick(context)
    }

    speakNote(note)
    currentIndexRef.current += 1
    queueStep(beatMs)
  }

  const startPlayback = async () => {
    if (availableScales.length === 0) {
      stopPlayback('Enable at least one scale with two or more intervals before playing.')
      return
    }

    const context = await ensureAudioContext()
    if (!context) {
      stopPlayback('Audio playback is unsupported in this browser.')
      return
    }

    playbackActiveRef.current = true
    setIsPlaying(true)

    if (!prepareNextScale()) {
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
          <div className="eyebrow">Fretboard Memorization Trainer</div>
          <h1>Random scale drills with a spoken pulse.</h1>
          <p className="lede">
            Generate a scale, hear each note called out on the beat, and keep the session running for as long as you want.
          </p>

          <div className="now-playing">
            <div>
              <span className="label">Current scale</span>
              <strong>{currentScale?.label ?? 'Waiting for the first draw'}</strong>
            </div>
            <div>
              <span className="label">Current note</span>
              <strong className="current-note">{currentNote}</strong>
            </div>
          </div>

          <div className="status-row">
            <span className={`pill ${isPlaying ? 'live' : ''}`}>{isPlaying ? 'Playing' : 'Idle'}</span>
            <span className="pill">{continuousMode ? 'Continuous on' : 'One scale only'}</span>
            <span className="pill">{audioReady ? 'Audio primed' : 'Audio starts on play'}</span>
          </div>

          <p className="playback-message">{playbackMessage}</p>
        </section>

        <section className="panel controls-panel">
          <div className="panel-heading">
            <h2>Transport</h2>
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
              Play random scale
            </button>
            <button type="button" className="secondary-button" onClick={() => stopPlayback()} disabled={!isPlaying}>
              Stop playback
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

        <section className="panel library-panel">
          <div className="panel-heading library-heading">
            <div>
              <h2>Scale library</h2>
              <p>Edit which scales can be selected. Intervals are semitone offsets from the root.</p>
            </div>
            <button type="button" className="ghost-button" onClick={addScale}>
              Add scale
            </button>
          </div>

          <div className="library-list">
            {scaleLibrary.map((scale) => {
              const parsedIntervals = parseIntervals(scale.intervalText)
              const isValid = scale.name.trim().length > 0 && parsedIntervals.length >= 2

              return (
                <article key={scale.id} className={`scale-card ${isValid ? '' : 'invalid'}`}>
                  <div className="scale-card-top">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={scale.enabled}
                        onChange={(event) => updateScale(scale.id, { enabled: event.target.checked })}
                      />
                      <span>Enabled</span>
                    </label>

                    <button type="button" className="text-button" onClick={() => removeScale(scale.id)}>
                      Remove
                    </button>
                  </div>

                  <label>
                    <span>Name</span>
                    <input
                      type="text"
                      value={scale.name}
                      onChange={(event) => updateScale(scale.id, { name: event.target.value })}
                    />
                  </label>

                  <label>
                    <span>Intervals</span>
                    <input
                      type="text"
                      value={scale.intervalText}
                      onChange={(event) => updateScale(scale.id, { intervalText: event.target.value })}
                    />
                  </label>

                  <div className="helper-row">
                    <span>{parsedIntervals.length} notes</span>
                    <span>{isValid ? 'Ready to randomize' : 'Needs a name and at least two intervals'}</span>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
