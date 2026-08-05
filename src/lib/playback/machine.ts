import { COUNT_IN_BEATS, COUNT_IN_MS, IDLE_NOTE, MAX_BPM, PLAYBACK_MESSAGES } from '../../constants'
import { generateShuffledNotes } from '../music'

export type PlaybackStatus = 'idle' | 'playing' | 'paused'

export type PlaybackSnapshot = {
  status: PlaybackStatus
  /** Current note name, a count-in digit, or '' while transitioning. */
  note: string
  message: string
}

export type PlaybackSettings = {
  bpm: number
  continuousMode: boolean
  speedRampMode: boolean
  endSoundEnabled: boolean
}

/** The slice of AudioEngine the machine drives. */
export type PlaybackAudioPort = {
  ensureContext(): Promise<unknown | null>
  loadNoteBuffers(): Promise<void>
  hasBuffers(): boolean
  playClick(): void
  playSessionEndChime(): void
  playNote(note: string): void
}

export type PlaybackTimers = {
  set(callback: () => void, delayMs: number): number
  clear(id: number): void
}

export type PlaybackMachineDeps = {
  audio: PlaybackAudioPort
  /** Read fresh at every step so live BPM/mode changes take effect on the next beat. */
  getSettings(): PlaybackSettings
  onSnapshot(snapshot: PlaybackSnapshot): void
  /** Speed ramp writes the increased BPM back through here. */
  onBpmChange(bpm: number): void
  /** Fired when the first real note of a session plays (not during count-in). */
  onSessionStart(): void
  /** Fired whenever playback stops counting practice time (pause or stop). */
  onSessionPause(): void
  generateNotes?: () => string[]
  timers?: PlaybackTimers
}

export type PlaybackMachine = {
  start(): Promise<void>
  pause(): void
  stop(message?: string): void
  reset(): void
  getSnapshot(): PlaybackSnapshot
  /** Clears timers and flags only — the machine stays restartable. */
  dispose(): void
}

const defaultTimers: PlaybackTimers = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (id) => window.clearTimeout(id),
}

export const INITIAL_PLAYBACK_SNAPSHOT: PlaybackSnapshot = {
  status: 'idle',
  note: IDLE_NOTE,
  message: PLAYBACK_MESSAGES.idle,
}

export const createPlaybackMachine = (deps: PlaybackMachineDeps): PlaybackMachine => {
  const { audio, getSettings, onSnapshot, onBpmChange, onSessionStart, onSessionPause } = deps
  const generateNotes = deps.generateNotes ?? generateShuffledNotes
  const timers = deps.timers ?? defaultTimers

  let snapshot: PlaybackSnapshot = { ...INITIAL_PLAYBACK_SNAPSHOT }
  let active = false
  let timeoutId: number | null = null
  let notes: string[] = generateNotes()
  let index = 0
  let sessionStartQueued = false

  const emit = (partial: Partial<PlaybackSnapshot>) => {
    snapshot = { ...snapshot, ...partial }
    onSnapshot(snapshot)
  }

  const clearQueuedStep = () => {
    if (timeoutId !== null) {
      timers.clear(timeoutId)
      timeoutId = null
    }
  }

  const queueStep = (delayMs: number) => {
    clearQueuedStep()
    timeoutId = timers.set(() => {
      void playNextStep()
    }, delayMs)
  }

  const stop = (message: string = PLAYBACK_MESSAGES.idle) => {
    active = false
    clearQueuedStep()
    sessionStartQueued = false
    onSessionPause()
    emit({ status: 'idle', note: IDLE_NOTE, message })
  }

  const pause = () => {
    if (!active) {
      return
    }

    active = false
    clearQueuedStep()
    onSessionPause()
    emit({ status: 'paused', message: PLAYBACK_MESSAGES.paused })
  }

  const applySpeedRamp = () => {
    const { bpm, continuousMode, speedRampMode } = getSettings()
    if (!continuousMode || !speedRampMode) {
      return bpm
    }

    const nextBpm = Math.min(MAX_BPM, bpm + 2)
    if (nextBpm !== bpm) {
      onBpmChange(nextBpm)
    }

    return nextBpm
  }

  const prepareNextNotes = (withCountIn = false) => {
    notes = generateNotes()
    index = withCountIn ? -COUNT_IN_BEATS : 0
    emit({
      note: withCountIn ? String(COUNT_IN_BEATS) : '',
      message: PLAYBACK_MESSAGES.getReady,
    })
  }

  const playNextStep = async () => {
    if (!active) {
      return
    }

    if (!notes || notes.length === 0) {
      stop(PLAYBACK_MESSAGES.noNotes)
      return
    }

    if (index < 0) {
      const countValue = Math.abs(index)

      emit({ note: String(countValue), message: PLAYBACK_MESSAGES.countIn(countValue) })

      await audio.ensureContext()
      audio.playClick()

      index += 1
      queueStep(COUNT_IN_MS)
      return
    }

    if (index >= notes.length) {
      const nextBpm = applySpeedRamp()
      const context = getSettings().endSoundEnabled ? await audio.ensureContext() : null
      const { continuousMode, speedRampMode } = getSettings()

      if (!continuousMode) {
        if (context) {
          audio.playSessionEndChime()
        }

        stop(speedRampMode ? PLAYBACK_MESSAGES.finishedWithBpm(nextBpm) : PLAYBACK_MESSAGES.finished)
        return
      }

      prepareNextNotes(true)
      queueStep(0)
      return
    }

    const note = notes[index]
    const beatMs = Math.round(60000 / getSettings().bpm)

    if (sessionStartQueued) {
      sessionStartQueued = false
      onSessionStart()
    }

    emit({ note, message: '' })

    await audio.ensureContext()
    audio.playClick()
    audio.playNote(note)
    index += 1
    queueStep(beatMs)
  }

  const start = async () => {
    if (snapshot.status === 'paused') {
      if (!sessionStartQueued) {
        onSessionStart()
      }

      active = true
      emit({ status: 'playing', message: PLAYBACK_MESSAGES.resuming })
      queueStep(0)
      return
    }

    const context = await audio.ensureContext()
    if (!context) {
      stop(PLAYBACK_MESSAGES.audioUnsupported)
      return
    }

    sessionStartQueued = true
    emit({ status: 'playing', message: PLAYBACK_MESSAGES.loadingAudio })
    await audio.loadNoteBuffers()

    if (!audio.hasBuffers()) {
      stop(PLAYBACK_MESSAGES.audioLoadFailed)
      return
    }

    active = true
    prepareNextNotes(true)
    queueStep(0)
  }

  const reset = () => {
    if (active || snapshot.status === 'playing') {
      stop()
    }

    sessionStartQueued = false
    notes = generateNotes()
    index = 0
    // The message is deliberately left untouched: resetting while idle keeps
    // e.g. the "Finished all 12 notes." text on screen, as it always has.
    emit({ note: IDLE_NOTE })
  }

  const dispose = () => {
    active = false
    clearQueuedStep()
    sessionStartQueued = false
  }

  return {
    start,
    pause,
    stop,
    reset,
    getSnapshot: () => snapshot,
    dispose,
  }
}
