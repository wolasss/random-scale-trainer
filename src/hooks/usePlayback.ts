import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from '../lib/audio/engine'
import {
  createPlaybackMachine,
  INITIAL_PLAYBACK_SNAPSHOT,
  type BeatEvent,
  type FrameScheduler,
  type PlaybackAudioPort,
  type PlaybackMachine,
  type PlaybackSettings,
  type PlaybackSnapshot,
  type PlaybackTimers,
} from '../lib/playback/machine'
import type { SpellingPreference } from '../lib/notes'

export type UsePlaybackOptions = {
  settings: PlaybackSettings
  pool: number[]
  spelling: SpellingPreference
  onBpmChange: (bpm: number) => void
  onSessionStart: () => void
  onSessionPause: () => void
  /** Fired at visual time for every beat — mutate refs here, never set state. */
  onBeat?: (event: BeatEvent) => void
  /** Injectable for tests; defaults to a real AudioEngine. */
  audio?: PlaybackAudioPort
  timers?: PlaybackTimers
  frame?: FrameScheduler
  random?: () => number
}

/**
 * Binds the framework-free playback machine to React. The machine is created
 * once, and reads settings/pool/spelling through refs, so the scheduler loop
 * always sees the latest values without re-creating anything on re-render.
 */
export function usePlayback(options: UsePlaybackOptions) {
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(INITIAL_PLAYBACK_SNAPSHOT)
  const optionsRef = useRef(options)
  const audioRef = useRef<PlaybackAudioPort | null>(options.audio ?? null)
  const machineRef = useRef<PlaybackMachine | null>(null)

  useEffect(() => {
    optionsRef.current = options
  })

  const getMachine = () => {
    if (machineRef.current === null) {
      audioRef.current ??= new AudioEngine()
      machineRef.current = createPlaybackMachine({
        audio: audioRef.current,
        getSettings: () => optionsRef.current.settings,
        getPool: () => optionsRef.current.pool,
        getSpelling: () => optionsRef.current.spelling,
        onSnapshot: setSnapshot,
        onBeat: (event) => optionsRef.current.onBeat?.(event),
        onBpmChange: (bpm) => optionsRef.current.onBpmChange(bpm),
        onSessionStart: () => optionsRef.current.onSessionStart(),
        onSessionPause: () => optionsRef.current.onSessionPause(),
        timers: optionsRef.current.timers,
        frame: optionsRef.current.frame,
        random: optionsRef.current.random,
      })
    }

    return machineRef.current
  }

  // Create the machine on mount so the NEXT preview exists before the first
  // transport action. Cleanup only clears timers/frames/scheduled audio; the
  // machine survives StrictMode's dev-time unmount/remount and stays restartable.
  useEffect(() => {
    getMachine()
    return () => {
      machineRef.current?.dispose()
    }
  }, [])

  // Pool or spelling edits drop the pending deck so they take effect on the
  // next note — while idle, paused, or playing.
  // Stable, so the visibility listener that drives it binds once rather than
  // rebinding on every render.
  const handleVisible = useCallback(() => machineRef.current?.handleVisible(), [])

  const poolKey = options.pool.join(',')
  const spelling = options.spelling
  useEffect(() => {
    machineRef.current?.invalidateDeck()
  }, [poolKey, spelling])

  return {
    snapshot,
    isPlaying: snapshot.status === 'playing',
    isPaused: snapshot.status === 'paused',
    start: () => getMachine().start(),
    pause: () => getMachine().pause(),
    stop: (message?: string) => getMachine().stop(message),
    reset: () => getMachine().reset(),
    handleVisible,
  }
}
