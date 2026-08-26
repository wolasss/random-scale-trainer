import { useEffect, useState } from 'react'
import type { MicDebugInfo, MicStatus } from '../hooks/useMicPitch'

/** How often the overlay re-reads the ref-backed report. Its clock, not React's. */
export const MIC_DEBUG_POLL_MS = 250

type MicDebugPanelProps = {
  status: MicStatus
  getDebugInfo: () => MicDebugInfo | null
}

const formatDb = (rms: number): string => (rms <= 0 ? '-inf' : `${(20 * Math.log10(rms)).toFixed(1)} dB`)

// lib.dom types these settings loosely; anything non-boolean prints verbatim.
const formatFlag = (value: unknown): string =>
  value === undefined ? '?' : value === true ? 'on' : value === false ? 'off' : String(value)

/**
 * The on-device answer to "what is the microphone actually doing" — behind
 * ?micdebug because it is a diagnostic, not a feature. Every line is something
 * that has had to be asked of a tester's phone at least once: whether the
 * browser honoured the raw-capture constraints (`getSettings()` is the applied
 * truth, not the requested one), which context the analyser sits on and
 * whether iOS has parked it, and what level and clarity the detector is being
 * fed. Text on purpose: it is read from screenshots.
 */
export function MicDebugPanel({ status, getDebugInfo }: MicDebugPanelProps) {
  const [info, setInfo] = useState<MicDebugInfo | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setInfo(getDebugInfo()), MIC_DEBUG_POLL_MS)
    return () => window.clearInterval(id)
  }, [getDebugInfo])

  return (
    <div className="mic-debug-panel" data-testid="mic-debug-panel">
      <div>mic: {status}</div>
      {info === null ? (
        <div>no capture open — start playback with the mic setting on</div>
      ) : (
        <>
          <div>
            applied: ec {formatFlag(info.trackSettings.echoCancellation)} · ns{' '}
            {formatFlag(info.trackSettings.noiseSuppression)} · agc {formatFlag(info.trackSettings.autoGainControl)}
            {typeof info.trackSettings.sampleRate === 'number' ? ` · track ${info.trackSettings.sampleRate} Hz` : ''}
          </div>
          <div>
            app ctx: {info.appContextRate} Hz {info.appContextState} · cap ctx: {info.captureContextRate} Hz{' '}
            {info.captureContextState}
            {info.ownContext ? ' (own)' : ' (shared)'}
          </div>
          <div>
            level: {formatDb(info.lastRms)} · floor: {formatDb(info.gateFloor)} · frames: {info.frames} · detections:{' '}
            {info.detections}
            {info.lastWithinCue ? ' · in cue' : ''}
          </div>
          <div>
            last note:{' '}
            {info.lastFrequency === null
              ? 'none yet'
              : `${info.lastFrequency.toFixed(1)} Hz · clarity ${(info.lastClarity ?? 0).toFixed(2)}`}
          </div>
        </>
      )}
    </div>
  )
}
