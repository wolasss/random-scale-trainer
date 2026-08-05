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

export type AudioEngineDeps = {
  contextFactory?: () => AudioContext | null
  fetchFn?: typeof fetch
}

const defaultContextFactory = (): AudioContext | null => {
  const AudioContextClass = window.AudioContext ?? (window as AudioWindow).webkitAudioContext

  return AudioContextClass ? new AudioContextClass() : null
}

/**
 * Owns the AudioContext and every sound the app makes: the metronome click,
 * the end-of-session chime, and the pre-decoded spoken note samples.
 */
export class AudioEngine {
  private context: AudioContext | null = null
  private noteBuffers = new Map<string, AudioBuffer>()
  private buffersLoaded = false
  private readonly contextFactory: () => AudioContext | null
  private readonly fetchFn: typeof fetch

  constructor(deps: AudioEngineDeps = {}) {
    this.contextFactory = deps.contextFactory ?? defaultContextFactory
    this.fetchFn = deps.fetchFn ?? ((...args) => fetch(...args))
  }

  async ensureContext(): Promise<AudioContext | null> {
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

  playClick(): void {
    const context = this.context
    if (!context) return

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

  playSessionEndChime(): void {
    const context = this.context
    if (!context) return

    const startTime = context.currentTime

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
        } catch (err) {
          console.error(`Failed to load audio for note "${note}":`, err)
        }
      })
    )

    this.buffersLoaded = true
  }

  hasBuffers(): boolean {
    return this.noteBuffers.size > 0
  }

  playNote(note: string): void {
    const context = this.context
    if (!context) return

    const buffer = this.noteBuffers.get(note)
    if (!buffer) return

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start()
  }
}
