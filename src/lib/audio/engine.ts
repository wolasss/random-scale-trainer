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
      if (this.context.state === 'suspended') {
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

  private track(node: AudioScheduledSourceNode): void {
    this.scheduledNodes.add(node)
    node.onended = () => this.scheduledNodes.delete(node)
  }

  /** Silences everything already scheduled — including the look-ahead window. */
  stopScheduledSounds(): void {
    for (const node of this.scheduledNodes) {
      try {
        node.stop()
      } catch {
        // Already stopped; nothing to do.
      }
    }

    this.scheduledNodes.clear()
  }

  playClickAt(startTime: number, accent: boolean): void {
    const context = this.context
    if (!context) return

    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(accent ? 1320 : 880, startTime)
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(accent ? 0.12 : 0.08, startTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startTime)
    oscillator.stop(startTime + 0.14)
    this.track(oscillator)
  }

  playSessionEndChime(at?: number): void {
    const context = this.context
    if (!context) return

    const startTime = at ?? context.currentTime

    const playTone = (frequency: number, offset: number, duration: number, peak: number) => {
      const bodyOscillator = context.createOscillator()
      const shimmerOscillator = context.createOscillator()
      const bodyGain = context.createGain()
      const shimmerGain = context.createGain()
      const toneStart = startTime + offset

      bodyOscillator.type = 'triangle'
      bodyOscillator.frequency.setValueAtTime(frequency, toneStart)
      bodyGain.gain.setValueAtTime(0.0001, toneStart)
      bodyGain.gain.exponentialRampToValueAtTime(peak, toneStart + 0.012)
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, toneStart + duration)

      shimmerOscillator.type = 'sine'
      shimmerOscillator.frequency.setValueAtTime(frequency * 2, toneStart)
      shimmerGain.gain.setValueAtTime(0.0001, toneStart)
      shimmerGain.gain.exponentialRampToValueAtTime(peak * 0.42, toneStart + 0.01)
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, toneStart + duration * 0.88)

      bodyOscillator.connect(bodyGain)
      shimmerOscillator.connect(shimmerGain)
      bodyGain.connect(context.destination)
      shimmerGain.connect(context.destination)

      bodyOscillator.start(toneStart)
      shimmerOscillator.start(toneStart)
      bodyOscillator.stop(toneStart + duration + 0.03)
      shimmerOscillator.stop(toneStart + duration * 0.9 + 0.03)
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
            context.decodeAudioData(arrayBuffer, resolve, reject)
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
  private speakFallback(audioKey: string): void {
    if (this.speech === null || !this.missingClips.has(audioKey)) {
      return
    }

    // 'C#' / 'Bb' read as letters otherwise.
    const spoken = audioKey.replace('#', ' sharp').replace('b', ' flat')
    try {
      this.speech.speak(spoken)
    } catch {
      // Speech is the fallback; there is nothing behind it.
    }
  }

  playNoteAt(audioKey: string, startTime: number): void {
    const context = this.context
    if (!context) return

    const buffer = this.noteBuffers.get(audioKey)
    if (!buffer) {
      this.speakFallback(audioKey)
      return
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start(startTime)
    this.track(source)
  }

  playClick(): void {
    this.playClickAt(this.getCurrentTime(), false)
  }

  playNote(note: string): void {
    this.playNoteAt(note, this.getCurrentTime())
  }
}
