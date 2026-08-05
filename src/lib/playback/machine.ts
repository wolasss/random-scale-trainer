import {
  COUNT_IN_BEATS,
  MAX_BPM,
  PLAYBACK_MESSAGES,
  RAMP_BPM_STEP,
  SCHEDULE_AHEAD_S,
  SCHEDULER_TICK_MS,
} from '../../constants'
import type { NoteCall, SpellingPreference } from '../notes'
import { createNoteDeck } from './deck'

export type PlaybackStatus = 'idle' | 'playing' | 'paused'

export type PlaybackSettings = {
  bpm: number
  /** The click sounds every beat; a new note is called every N beats. */
  beatsPerNote: number
  countInEnabled: boolean
  continuousMode: boolean
  speedRampMode: boolean
  speakNotes: boolean
  referencePitch: boolean
  endSoundEnabled: boolean
}

export type PlaybackSnapshot = {
  status: PlaybackStatus
  /** Note being drilled; null while idle or counting in. */
  currentNote: NoteCall | null
  /** Upcoming note — always previewable, even while idle. */
  nextNote: NoteCall | null
  /** Count-in digit (4..1) during the count-in, else null. */
  countIn: number | null
  /** 0-based beat within the current note's span; drives the beat dots. */
  beatInSpan: number
  /** 1-based position for the "note 7 of 12" readout; null when no note. */
  positionInCycle: number | null
  /** The "of 12": size of the bag the current cycle was dealt from. */
  cycleLength: number | null
  notesCalled: number
  cyclesCompleted: number
  message: string
}

/** One scheduled beat, delivered to the UI when the audio clock reaches it. */
export type BeatEvent = {
  /** Absolute AudioContext time of the click. */
  time: number
  accent: boolean
  isCountIn: boolean
  countInValue?: number
  /** Present when this beat starts a new note span. */
  note?: NoteCall
  /** The note after `note`, peeked at schedule time (drives the NEXT chip). */
  nextNote: NoteCall | null
  beatInSpan: number
  positionInCycle: number | null
  /** True when `note` starts a new cycle right after a fully completed one. */
  completedCycle: boolean
}

/** The slice of AudioEngine the machine drives. */
export type PlaybackAudioPort = {
  ensureContext(): Promise<unknown | null>
  loadNoteBuffers(): Promise<void>
  hasBuffers(): boolean
  getCurrentTime(): number
  playClickAt(time: number, accent: boolean): void
  playNoteAt(audioKey: string, time: number): void
  playReferencePitchAt(pitchClass: number, time: number): void
  playSessionEndChime(at?: number): void
  stopScheduledSounds(): void
}

export type PlaybackTimers = {
  set(callback: () => void, delayMs: number): number
  clear(id: number): void
}

export type FrameScheduler = {
  request(callback: () => void): number
  cancel(id: number): void
}

export type PlaybackMachineDeps = {
  audio: PlaybackAudioPort
  /** Read fresh at every scheduled beat so live changes land on the next beat. */
  getSettings(): PlaybackSettings
  getPool(): number[]
  getSpelling(): SpellingPreference
  onSnapshot(snapshot: PlaybackSnapshot): void
  /** Fired at visual time for every beat — drive ref-based effects here. */
  onBeat?(event: BeatEvent): void
  /** Speed ramp writes the increased BPM back through here. */
  onBpmChange(bpm: number): void
  /** Fired when the first real note of a session pops (not during count-in). */
  onSessionStart(): void
  /** Fired whenever playback stops counting practice time (pause or stop). */
  onSessionPause(): void
  timers?: PlaybackTimers
  frame?: FrameScheduler
  random?: () => number
}

export type PlaybackMachine = {
  start(): Promise<void>
  pause(): void
  stop(message?: string): void
  reset(): void
  /** Pool or spelling changed: drop pending notes, refresh the preview. */
  invalidateDeck(): void
  getSnapshot(): PlaybackSnapshot
  /** Clears timers, frames, and scheduled audio — the machine stays restartable. */
  dispose(): void
}

const defaultTimers: PlaybackTimers = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (id) => window.clearTimeout(id),
}

const defaultFrame: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (id) => window.cancelAnimationFrame(id),
}

export const INITIAL_PLAYBACK_SNAPSHOT: PlaybackSnapshot = {
  status: 'idle',
  currentNote: null,
  nextNote: null,
  countIn: null,
  beatInSpan: 0,
  positionInCycle: null,
  cycleLength: null,
  notesCalled: 0,
  cyclesCompleted: 0,
  message: PLAYBACK_MESSAGES.idle,
}

export const createPlaybackMachine = (deps: PlaybackMachineDeps): PlaybackMachine => {
  const { audio, getSettings, getPool, getSpelling, onSnapshot, onBeat, onBpmChange, onSessionStart, onSessionPause } =
    deps
  const timers = deps.timers ?? defaultTimers
  const frame = deps.frame ?? defaultFrame
  const deck = createNoteDeck({ getPool, getSpelling, random: deps.random })

  let snapshot: PlaybackSnapshot = { ...INITIAL_PLAYBACK_SNAPSHOT }
  let active = false
  let tickId: number | null = null
  let frameId: number | null = null
  let stopTimeoutId: number | null = null
  let visualQueue: BeatEvent[] = []
  let sessionStartQueued = false

  // Scheduling state — runs ahead of what the user sees by up to the look-ahead.
  let nextBeatTime = 0
  let countInRemaining = 0
  let beatInSpan = 0
  let schedPosition = 0
  let schedBagSize = 0
  let anyNoteScheduled = false
  let schedulingDone = false

  // The machine's authoritative tempo. The ramp bumps it immediately (before
  // React round-trips onBpmChange); external slider/tap changes win when the
  // observed settings value moves to anything other than the pending ramp value.
  let currentBpm = 0
  let lastSeenExternalBpm = 0
  let awaitingWriteback: number | null = null

  const emit = (partial: Partial<PlaybackSnapshot>) => {
    snapshot = { ...snapshot, ...partial }
    onSnapshot(snapshot)
  }

  const clearTick = () => {
    if (tickId !== null) {
      timers.clear(tickId)
      tickId = null
    }
  }

  const clearFrame = () => {
    if (frameId !== null) {
      frame.cancel(frameId)
      frameId = null
    }
  }

  const clearStopTimeout = () => {
    if (stopTimeoutId !== null) {
      timers.clear(stopTimeoutId)
      stopTimeoutId = null
    }
  }

  const haltScheduling = () => {
    active = false
    schedulingDone = false
    clearTick()
    clearFrame()
    clearStopTimeout()
    visualQueue = []
    audio.stopScheduledSounds()
  }

  const playingMessage = () => {
    const { continuousMode, speedRampMode } = getSettings()
    return continuousMode && speedRampMode ? PLAYBACK_MESSAGES.playingRamp : PLAYBACK_MESSAGES.playing
  }

  const reconcileBpm = () => {
    const external = getSettings().bpm
    if (external === lastSeenExternalBpm) {
      return
    }

    if (awaitingWriteback !== null && external === awaitingWriteback) {
      awaitingWriteback = null // our ramp landed; currentBpm is already correct
    } else {
      currentBpm = external // a user change always wins
      awaitingWriteback = null
    }

    lastSeenExternalBpm = external
  }

  const applySpeedRamp = () => {
    const { continuousMode, speedRampMode } = getSettings()
    if (!continuousMode || !speedRampMode) {
      return
    }

    const nextBpm = Math.min(MAX_BPM, currentBpm + RAMP_BPM_STEP)
    if (nextBpm !== currentBpm) {
      currentBpm = nextBpm
      awaitingWriteback = nextBpm
      onBpmChange(nextBpm)
    }
  }

  const finishStop = (message: string, countCycle = false) => {
    haltScheduling()
    sessionStartQueued = false
    onSessionPause()
    emit({
      status: 'idle',
      currentNote: null,
      countIn: null,
      beatInSpan: 0,
      positionInCycle: null,
      message,
      nextNote: deck.peek(),
      // The ending cycle never emits its boundary beat, so count it here.
      cyclesCompleted: snapshot.cyclesCompleted + (countCycle ? 1 : 0),
    })
  }

  /** Schedules exactly one beat at nextBeatTime and advances the clock. */
  const scheduleBeat = () => {
    const settings = getSettings()

    if (countInRemaining > 0) {
      const value = countInRemaining
      const accent = value === COUNT_IN_BEATS
      audio.playClickAt(nextBeatTime, accent)
      visualQueue.push({
        time: nextBeatTime,
        accent,
        isCountIn: true,
        countInValue: value,
        nextNote: deck.peek(),
        beatInSpan: 0,
        positionInCycle: null,
        completedCycle: false,
      })
      countInRemaining -= 1
      nextBeatTime += 60 / currentBpm
      return
    }

    if (beatInSpan === 0) {
      const peeked = deck.peek()
      if (!peeked) {
        schedulingDone = true
        scheduleStopAt(nextBeatTime, PLAYBACK_MESSAGES.noNotes)
        return
      }

      // A cycle only counts as completed when the previous bag was fully dealt;
      // a bag truncated by a pool edit must not trigger the ramp or the ending.
      const completedCycle = peeked.cycleStart && anyNoteScheduled && schedPosition === schedBagSize
      if (completedCycle) {
        applySpeedRamp()

        if (!settings.continuousMode) {
          if (settings.endSoundEnabled) {
            audio.playSessionEndChime(nextBeatTime)
          }
          schedulingDone = true
          scheduleStopAt(nextBeatTime, PLAYBACK_MESSAGES.finished(schedBagSize), true)
          return
        }
      }

      const note = deck.draw()
      if (!note) {
        schedulingDone = true
        scheduleStopAt(nextBeatTime, PLAYBACK_MESSAGES.noNotes)
        return
      }

      schedPosition = note.cycleStart ? 1 : schedPosition + 1
      schedBagSize = note.bagSize
      anyNoteScheduled = true

      audio.playClickAt(nextBeatTime, true)
      if (settings.speakNotes) {
        audio.playNoteAt(note.audioKey, nextBeatTime)
      }
      if (settings.referencePitch) {
        audio.playReferencePitchAt(note.pc, nextBeatTime)
      }

      visualQueue.push({
        time: nextBeatTime,
        accent: true,
        isCountIn: false,
        note,
        nextNote: deck.peek(),
        beatInSpan: 0,
        positionInCycle: schedPosition,
        completedCycle,
      })
    } else {
      audio.playClickAt(nextBeatTime, false)
      visualQueue.push({
        time: nextBeatTime,
        accent: false,
        isCountIn: false,
        nextNote: deck.peek(),
        beatInSpan,
        positionInCycle: schedPosition,
        completedCycle: false,
      })
    }

    beatInSpan = (beatInSpan + 1) % Math.max(1, settings.beatsPerNote)
    nextBeatTime += 60 / currentBpm
  }

  const scheduleStopAt = (time: number, message: string, countCycle = false) => {
    clearStopTimeout()
    const delayMs = Math.max(0, (time - audio.getCurrentTime()) * 1000)
    stopTimeoutId = timers.set(() => finishStop(message, countCycle), delayMs)
  }

  const tick = () => {
    if (!active) {
      return
    }

    reconcileBpm()
    while (active && !schedulingDone && nextBeatTime < audio.getCurrentTime() + SCHEDULE_AHEAD_S) {
      scheduleBeat()
    }

    tickId = timers.set(tick, SCHEDULER_TICK_MS)
  }

  const applyBeat = (event: BeatEvent): Partial<PlaybackSnapshot> => {
    if (event.isCountIn) {
      return {
        countIn: event.countInValue ?? null,
        currentNote: null,
        nextNote: event.nextNote,
        beatInSpan: 0,
        message: PLAYBACK_MESSAGES.countingIn,
      }
    }

    if (event.note) {
      if (sessionStartQueued) {
        sessionStartQueued = false
        onSessionStart()
      }

      return {
        countIn: null,
        currentNote: event.note,
        nextNote: event.nextNote,
        beatInSpan: 0,
        positionInCycle: event.positionInCycle,
        cycleLength: event.note.bagSize,
        notesCalled: snapshot.notesCalled + 1,
        cyclesCompleted: snapshot.cyclesCompleted + (event.completedCycle ? 1 : 0),
        message: playingMessage(),
      }
    }

    return { beatInSpan: event.beatInSpan, nextNote: event.nextNote }
  }

  const pumpFrames = () => {
    frameId = null

    const now = audio.getCurrentTime()
    while (visualQueue.length > 0 && visualQueue[0].time <= now) {
      const event = visualQueue.shift()!
      onBeat?.(event)
      // One emit per beat (never per frame); React batches same-frame emits.
      emit(applyBeat(event))
    }

    if (active) {
      frameId = frame.request(pumpFrames)
    }
  }

  const startLoops = () => {
    clearTick()
    clearFrame()
    tick()
    frameId = frame.request(pumpFrames)
  }

  const stop = (message: string = PLAYBACK_MESSAGES.idle) => {
    finishStop(message)
  }

  const pause = () => {
    if (!active) {
      return
    }

    haltScheduling()
    onSessionPause()
    emit({ status: 'paused', countIn: null, message: PLAYBACK_MESSAGES.paused })
  }

  const start = async () => {
    if (snapshot.status === 'paused') {
      await audio.ensureContext()
      if (!sessionStartQueued) {
        onSessionStart()
      }

      active = true
      // Resume without a count-in: a half-beat pickup, then the beat resumes
      // from wherever the span left off.
      nextBeatTime = audio.getCurrentTime() + (60 / currentBpm) * 0.5
      emit({
        status: 'playing',
        message: countInRemaining > 0 ? PLAYBACK_MESSAGES.countingIn : playingMessage(),
      })
      startLoops()
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

    if (snapshot.status !== 'playing') {
      // Paused or reset while the buffers were loading.
      return
    }

    const settings = getSettings()
    currentBpm = settings.bpm
    lastSeenExternalBpm = settings.bpm
    awaitingWriteback = null
    countInRemaining = settings.countInEnabled ? COUNT_IN_BEATS : 0
    beatInSpan = 0
    schedPosition = 0
    schedBagSize = 0
    anyNoteScheduled = false
    schedulingDone = false
    active = true
    nextBeatTime = audio.getCurrentTime() + 0.05

    emit({
      countIn: countInRemaining > 0 ? COUNT_IN_BEATS : null,
      nextNote: deck.peek(),
      message: countInRemaining > 0 ? PLAYBACK_MESSAGES.countingIn : playingMessage(),
    })
    startLoops()
  }

  const reset = () => {
    haltScheduling()
    if (snapshot.status !== 'idle') {
      onSessionPause()
    }

    sessionStartQueued = false
    countInRemaining = 0
    beatInSpan = 0
    schedPosition = 0
    schedBagSize = 0
    anyNoteScheduled = false
    deck.reset()

    emit({
      status: 'idle',
      currentNote: null,
      countIn: null,
      beatInSpan: 0,
      positionInCycle: null,
      cycleLength: null,
      notesCalled: 0,
      cyclesCompleted: 0,
      message: PLAYBACK_MESSAGES.idle,
      nextNote: deck.peek(),
    })
  }

  const invalidateDeck = () => {
    deck.invalidate()
    emit({ nextNote: deck.peek() })
  }

  const dispose = () => {
    haltScheduling()
    sessionStartQueued = false
  }

  // Populate the preview so the NEXT chip works before the first start.
  snapshot = { ...snapshot, nextNote: deck.peek() }
  onSnapshot(snapshot)

  return {
    start,
    pause,
    stop,
    reset,
    invalidateDeck,
    getSnapshot: () => snapshot,
    dispose,
  }
}
