import { createCueLog } from './cueLog'

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

/** Explicit map kept over derived paths: greppable against public/audio/notes/
 * and verified file-by-file in engine.files.test.ts. */
export const NOTE_AUDIO_FILES: Record<string, string> = {
  'C': '/audio/notes/c.mp3',
  'C#': '/audio/notes/c-sharp.mp3',
  'Db': '/audio/notes/d-flat.mp3',
  'D': '/audio/notes/d.mp3',
  'D#': '/audio/notes/d-sharp.mp3',
  'Eb': '/audio/notes/e-flat.mp3',
  'E': '/audio/notes/e.mp3',
  'F': '/audio/notes/f.mp3',
  'F#': '/audio/notes/f-sharp.mp3',
  'Gb': '/audio/notes/g-flat.mp3',
  'G': '/audio/notes/g.mp3',
  'G#': '/audio/notes/g-sharp.mp3',
  'Ab': '/audio/notes/a-flat.mp3',
  'A': '/audio/notes/a.mp3',
  'A#': '/audio/notes/a-sharp.mp3',
  'Bb': '/audio/notes/b-flat.mp3',
  'B': '/audio/notes/b.mp3',
}

/**
 * 76 bytes of 8-bit PCM silence. Playing this through a real media element on
 * the first gesture moves iOS off the "ambient" audio session — the one the
 * ringer switch silences — and onto media playback, which it does not. Web
 * Audio on its own never triggers that switch, so without this the metronome
 * is inaudible on any iPhone with the side switch flipped.
 *
 * Note this is silent *content* rather than a `muted` element: a muted element
 * does not claim the media session, so it would not have the intended effect.
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='

/** How long the click sounds for — its own scheduled stop, kept in one place. */
const CLICK_DURATION_S = 0.14

/**
 * How long the room is assumed to go on ringing with a spoken note after the
 * clip itself has finished — the tail the microphone must not mistake for the
 * player. This is the number the hardware pass reaches for: if a real room
 * still leaks the called note into the readout, widen this rather than trusting
 * the clarity gate to reject what is genuinely a clean note.
 */
const NOTE_DECAY_S = 0.15

/**
 * The same allowance for the click, which is a tick rather than a note and
 * needs far less of one. It also cannot afford more: beats are 0.25 s apart at
 * the top of the tempo range, so a note's tail on every click would suppress
 * the microphone from one beat straight into the next and leave a fast session
 * with nothing to listen through.
 */
const CLICK_DECAY_S = 0.04

/**
 * How long a spoken note name is assumed to occupy when a clip is missing. The
 * speech engine will not say, so this is a deliberate over-estimate: the number
 * exists to keep the microphone from hearing the app talk to itself, and being
 * too generous only costs a little listening time.
 */
const SPEECH_CUE_FALLBACK_S = 1.2

export type AudioEngineDeps = {
  contextFactory?: () => AudioContext | null
  fetchFn?: typeof fetch
  /** Injectable for tests; defaults to a real <audio> element. */
  mediaElementFactory?: () => HTMLAudioElement | null
  /** Injectable for tests; defaults to the browser's speech synthesis. */
  speech?: SpeechPort | null
}

/** The slice of speechSynthesis used as a last resort for a missing clip. */
export type SpeechPort = {
  speak: (text: string) => void
}

const defaultContextFactory = (): AudioContext | null => {
  const AudioContextClass = window.AudioContext ?? (window as AudioWindow).webkitAudioContext

  return AudioContextClass ? new AudioContextClass() : null
}

const defaultMediaElementFactory = (): HTMLAudioElement | null => {
  if (typeof Audio !== 'function') {
    return null
  }

  const element = new Audio()
  // A browser that cannot play the silence has no media session to claim.
  if (element.canPlayType('audio/wav') === '') {
    return null
  }

  element.src = SILENT_WAV
  element.setAttribute('playsinline', '')
  return element
}

const defaultSpeech = (): SpeechPort | null => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null
  }

  return {
    speak: (text) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.1
      window.speechSynthesis.speak(utterance)
    },
  }
}

/**
 * Owns the AudioContext and every sound the app makes: the metronome click,
 * the end-of-session chime, and the pre-decoded spoken note samples.
 */
export class AudioEngine {
  private context: AudioContext | null = null
  private noteBuffers = new Map<string, AudioBuffer>()
  private buffersLoaded = false
  private mediaUnlocked = false
  /** Notes whose clip failed to load; these fall back to speech. */
  private missingClips = new Set<string>()
  /** Sources scheduled into the future; stopScheduledSounds() silences them all. */
  private scheduledNodes = new Set<AudioScheduledSourceNode>()
  /** The end chime is tracked apart so a stop can spare it — see below. */
  private chimeNodes = new Set<AudioScheduledSourceNode>()
  /**
   * When each cue the app plays occupies the room. Kept as intervals rather
   * than a running "last cue" because the scheduler works up to SCHEDULE_AHEAD_S
   * ahead of the beat you are hearing, so the most recently scheduled sound is
   * routinely a different beat's from the one playing now.
   */
  private readonly cueLog = createCueLog()
  private readonly contextFactory: () => AudioContext | null
  private readonly fetchFn: typeof fetch
  private readonly mediaElementFactory: () => HTMLAudioElement | null
  private readonly speech: SpeechPort | null

  constructor(deps: AudioEngineDeps = {}) {
    this.contextFactory = deps.contextFactory ?? defaultContextFactory
    this.fetchFn = deps.fetchFn ?? ((...args) => fetch(...args))
    this.mediaElementFactory = deps.mediaElementFactory ?? defaultMediaElementFactory
    this.speech = deps.speech === undefined ? defaultSpeech() : deps.speech
  }

  /**
   * Must be called from inside a user gesture — ensureContext() is, because the
   * transport only ever reaches it from the play button's handler.
   */
  private unlockMediaSession(): void {
    if (this.mediaUnlocked) {
      return
    }

    this.mediaUnlocked = true
    try {
      // Rejects on any browser that wants a gesture it doesn't think it got.
      // Nothing depends on it succeeding — Web Audio is the real output.
      const played = this.mediaElementFactory()?.play()
      void played?.catch(() => undefined)
    } catch {
      // No Audio constructor, or a src the browser refuses. Carry on.
    }
  }

  async ensureContext(): Promise<AudioContext | null> {
    this.unlockMediaSession()

    if (this.context) {
      // 'suspended' is the spec's word for a context that needs a nudge, but
      // Safari also parks one in a nonstandard 'interrupted' state when the
      // audio session changes underneath it — a phone call, or the microphone
      // opening and flipping iOS over to play-and-record. Anything short of
      // running gets the same resume, except closed, which resume() cannot fix.
      const state = this.context.state as string
      if (state !== 'running' && state !== 'closed') {
        await this.context.resume()
      }

      return this.context
    }

    const context = this.contextFactory()
    if (!context) {
      return null
    }

    await context.resume()
    this.context = context

    return context
  }

  getCurrentTime(): number {
    return this.context?.currentTime ?? 0
  }

  /**
   * The context itself. Null until the first gesture opens it, which is what
   * the microphone waits on before opening a capture — the capture analyses on
   * a context of its own where it can (see mic.ts), and falls back to this one.
   */
  getContext(): AudioContext | null {
    return this.context
  }

  private recordCue(start: number, end: number, decay: number): void {
    this.cueLog.record(start, end, decay, this.getCurrentTime())
  }

  /**
   * Whether the app itself was making a sound at this moment, or had just made
   * one and left the room ringing — the microphone's defence against scoring
   * the player for the note the speakers just called.
   */
  isWithinCue(time: number): boolean {
    return this.cueLog.isWithinCue(time)
  }

  /**
   * When the app stops sounding over the beat scheduled at `beatTime` — the
   * earliest moment anything heard could be the player rather than the app.
   *
   * Looked up by the beat's own time rather than by recency, which is what
   * makes it correct while the scheduler is running a look-ahead window ahead
   * of the music. Both the cues that begin on the beat (its click and its note
   * share one start time) and any still ringing over it (the previous note, at
   * a fast tempo) count, since either one is the app's voice, not the player's.
   */
  getCueEndForBeat(beatTime: number): number | null {
    return this.cueLog.endForBeat(beatTime)
  }

  private track(node: AudioScheduledSourceNode, nodes = this.scheduledNodes): void {
    nodes.add(node)
    node.onended = () => nodes.delete(node)
  }

  private stopTracked(nodes: Set<AudioScheduledSourceNode>): void {
    for (const node of nodes) {
      try {
        node.stop()
      } catch {
        // Already stopped; nothing to do.
      }
    }

    nodes.clear()
  }

  /**
   * Silences everything already scheduled — including the look-ahead window.
   *
   * `keepSessionEndChime` is for the one stop that isn't a cancellation: a
   * session that finishes on its own tears the transport down at the very
   * instant the chime is due to sound, and that cleanup must let it ring.
   */
  stopScheduledSounds(keepSessionEndChime = false): void {
    this.stopTracked(this.scheduledNodes)
    if (!keepSessionEndChime) {
      this.stopTracked(this.chimeNodes)
    }

    // A cue that was cancelled before it sounded never occupied the room, so it
    // must not go on suppressing the microphone — otherwise pressing stop would
    // deafen the app for a phantom second of look-ahead.
    this.cueLog.pruneCancelled(this.getCurrentTime())
  }

  /**
   * One oscillator with one swell-and-fade envelope on it — every tone the app
   * synthesises, click and chime alike.
   *
   * Times are absolute points on the context clock rather than durations from
   * `startTime`, so each caller keeps doing its own arithmetic and the values
   * that reach the hardware are exactly the ones it computed. The 0.0001 floor
   * is here because an exponential ramp cannot touch zero, and every tone
   * shares the same one.
   */
  private scheduleTone({
    type,
    frequency,
    startTime,
    attack,
    peak,
    decayEnd,
    stopAt,
    nodes,
  }: {
    type: OscillatorType
    frequency: number
    startTime: number
    /** When the tone reaches `peak`. */
    attack: number
    peak: number
    /** When it has faded back to silence. */
    decayEnd: number
    stopAt: number
    /** Which tracking set owns it; the transport's by default. */
    nodes?: Set<AudioScheduledSourceNode>
  }): void {
    const context = this.context
    if (!context) return

    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, startTime)
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(peak, attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, decayEnd)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startTime)
    oscillator.stop(stopAt)
    this.track(oscillator, nodes ?? this.scheduledNodes)
  }

  playClickAt(startTime: number, accent: boolean): void {
    const context = this.context
    if (!context) return

    this.scheduleTone({
      type: 'triangle',
      frequency: accent ? 1320 : 880,
      startTime,
      attack: startTime + 0.01,
      peak: accent ? 0.12 : 0.08,
      decayEnd: startTime + 0.12,
      stopAt: startTime + CLICK_DURATION_S,
    })
    this.recordCue(startTime, startTime + CLICK_DURATION_S, CLICK_DECAY_S)
  }

  playSessionEndChime(at?: number): void {
    const context = this.context
    if (!context) return

    const startTime = at ?? context.currentTime

    const playTone = (frequency: number, offset: number, duration: number, peak: number) => {
      const toneStart = startTime + offset

      this.scheduleTone({
        type: 'triangle',
        frequency,
        startTime: toneStart,
        attack: toneStart + 0.012,
        peak,
        decayEnd: toneStart + duration,
        stopAt: toneStart + duration + 0.03,
        nodes: this.chimeNodes,
      })
      // An octave above and quieter, fading first: the bell on top of the body.
      this.scheduleTone({
        type: 'sine',
        frequency: frequency * 2,
        startTime: toneStart,
        attack: toneStart + 0.01,
        peak: peak * 0.42,
        decayEnd: toneStart + duration * 0.88,
        stopAt: toneStart + duration * 0.9 + 0.03,
        nodes: this.chimeNodes,
      })
    }

    playTone(783.99, 0, 0.24, 0.11)
    playTone(523.25, 0.19, 0.34, 0.13)
  }

  async loadNoteBuffers(): Promise<void> {
    const context = this.context
    if (!context || this.buffersLoaded) return

    await Promise.all(
      Object.entries(NOTE_AUDIO_FILES).map(async ([note, path]) => {
        try {
          const response = await this.fetchFn(path)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const arrayBuffer = await response.arrayBuffer()
          const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
            // The callbacks settle this promise; the one decodeAudioData
            // returns is redundant here, so drop it explicitly.
            void context.decodeAudioData(arrayBuffer, resolve, reject)
          })
          this.noteBuffers.set(note, audioBuffer)
          this.missingClips.delete(note)
        } catch (err) {
          this.missingClips.add(note)
          console.error(`Failed to load audio for note "${note}":`, err)
        }
      })
    )

    // Only latch when something actually decoded: a pass where every fetch
    // failed (started offline, say) must be retried on the next start rather
    // than short-circuiting into a permanently silent session.
    this.buffersLoaded = this.noteBuffers.size > 0
  }

  hasBuffers(): boolean {
    return this.noteBuffers.size > 0
  }

  /**
   * Speaks a note whose clip is missing. Timing is at the mercy of the speech
   * engine — which is exactly why the clips exist — but a late note name beats
   * a silent one, and this only ever runs for a note that failed to download.
   */
  private speakFallback(audioKey: string, startTime: number): void {
    if (this.speech === null || !this.missingClips.has(audioKey)) {
      return
    }

    // 'C#' / 'Bb' read as letters otherwise.
    const spoken = audioKey.replace('#', ' sharp').replace('b', ' flat')
    try {
      this.speech.speak(spoken)
    } catch {
      // Speech is the fallback; there is nothing behind it.
      return
    }

    // Speech starts when it is asked to, not at the beat it was scheduled for,
    // so the cue is recorded from whichever of the two comes first and given a
    // generous tail. Nothing here can be measured, so it is over-estimated.
    this.recordCue(Math.min(startTime, this.getCurrentTime()), startTime + SPEECH_CUE_FALLBACK_S, NOTE_DECAY_S)
  }

  playNoteAt(audioKey: string, startTime: number): void {
    const context = this.context
    if (!context) return

    const buffer = this.noteBuffers.get(audioKey)
    if (!buffer) {
      this.speakFallback(audioKey, startTime)
      return
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start(startTime)
    this.track(source)
    this.recordCue(startTime, startTime + buffer.duration, NOTE_DECAY_S)
  }

  playClick(): void {
    this.playClickAt(this.getCurrentTime(), false)
  }

  playNote(note: string): void {
    this.playNoteAt(note, this.getCurrentTime())
  }
}
