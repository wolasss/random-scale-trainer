import { useEffect, useRef, useState } from 'react'
import { AudioEngine } from '../lib/audio/engine'
import {
  createPlaybackMachine,
  INITIAL_PLAYBACK_SNAPSHOT,
  type PlaybackAudioPort,
  type PlaybackMachine,
  type PlaybackSettings,
  type PlaybackSnapshot,
} from '../lib/playback/machine'

export type UsePlaybackOptions = {
  settings: PlaybackSettings
  onBpmChange: (bpm: number) => void
  onSessionStart: () => void
  onSessionPause: () => void
  /** Injectable for tests; defaults to a real AudioEngine. */
  audio?: PlaybackAudioPort
}

/**
 * Binds the framework-free playback machine to React. The machine is created
 * lazily on the first transport action and reads settings through a ref, so
 * the timeout-driven loop always sees the latest values without re-creating
 * anything on re-render.
 */
export function usePlayback(options: UsePlaybackOptions) {
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(INITIAL_PLAYBACK_SNAPSHOT)
  const settingsRef = useRef(options.settings)
  const callbacksRef = useRef(options)
  const audioRef = useRef<PlaybackAudioPort | null>(options.audio ?? null)
  const machineRef = useRef<PlaybackMachine | null>(null)

  useEffect(() => {
    settingsRef.current = options.settings
    callbacksRef.current = options
  })

  // Cleanup only clears timers/flags; the machine survives StrictMode's
  // dev-time unmount/remount and stays restartable.
  useEffect(() => {
    return () => {
      machineRef.current?.dispose()
    }
  }, [])

  const getMachine = () => {
    if (machineRef.current === null) {
      audioRef.current ??= new AudioEngine()
      machineRef.current = createPlaybackMachine({
        audio: audioRef.current,
        getSettings: () => settingsRef.current,
        onSnapshot: setSnapshot,
        onBpmChange: (bpm) => callbacksRef.current.onBpmChange(bpm),
        onSessionStart: () => callbacksRef.current.onSessionStart(),
        onSessionPause: () => callbacksRef.current.onSessionPause(),
      })
    }

    return machineRef.current
  }

  return {
    snapshot,
    isPlaying: snapshot.status === 'playing',
    isPaused: snapshot.status === 'paused',
    start: () => getMachine().start(),
    pause: () => getMachine().pause(),
    reset: () => getMachine().reset(),
  }
}
