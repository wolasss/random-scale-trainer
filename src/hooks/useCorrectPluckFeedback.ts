import { useEffect, useRef, useState } from 'react'
import { SILENCE_RMS } from '../lib/audio/pitch'
import type { MicSampleListener } from './useMicPitch'

const MIN_LEVEL_PLUCK_INTERVAL_S = 0.14
const ATTACK_CONFIRM_S = 0.15
const ATTACK_LEVEL_RATIO = 1.08
const ATTACK_LEVEL_RISE = 0.004
const REARM_LEVEL_FRACTION = 0.9
const MAX_PULSES_PER_CALL = 2

type CorrectPluckFeedbackOptions = {
  subscribe: (listener: MicSampleListener) => () => void
  subscribeConfirmedHit: (listener: () => void) => () => void
  active: boolean
  callId: number | null
  pitchClass: number | null
}

type DetectorState = {
  callId: number | null
  pitchClass: number | null
  previousLevel: number | null
  lastSampleAt: number
  lastPulseAt: number
  peakLevel: number
  troughLevel: number | null
  riseArmed: boolean
  silenceSeen: boolean
  attackAt: number | null
  pulsesThisCall: number
}

const createDetectorState = (): DetectorState => ({
  callId: null,
  pitchClass: null,
  previousLevel: null,
  lastSampleAt: Number.NEGATIVE_INFINITY,
  lastPulseAt: Number.NEGATIVE_INFINITY,
  peakLevel: 0,
  troughLevel: null,
  riseArmed: false,
  silenceSeen: false,
  attackAt: null,
  pulsesThisCall: 0,
})

const syncTarget = (state: DetectorState, callId: number, pitchClass: number) => {
  const callChanged = callId !== state.callId
  const pitchChanged = pitchClass !== state.pitchClass
  if (pitchChanged || callChanged) {
    state.previousLevel = null
    state.peakLevel = 0
    state.troughLevel = null
    state.riseArmed = false
    state.silenceSeen = false
    state.attackAt = null
  }
  if (callChanged) {
    state.pulsesThisCall = 0
  }
  state.callId = callId
  state.pitchClass = pitchClass
}

/**
 * Publishes visual acknowledgements without changing score state.
 *
 * The first pulse comes only from the scorer's confirmed hit total. Once that
 * has happened, raw microphone levels may identify one distinct second pluck
 * of the same called note. Detector dropouts alone never count as an attack.
 */
export function useCorrectPluckFeedback({
  subscribe,
  subscribeConfirmedHit,
  active,
  callId,
  pitchClass,
}: CorrectPluckFeedbackOptions) {
  const [pulse, setPulse] = useState(0)
  const targetRef = useRef({ callId, pitchClass })
  const detectorRef = useRef<DetectorState>(createDetectorState())

  useEffect(() => {
    targetRef.current = { callId, pitchClass }
  }, [callId, pitchClass])

  useEffect(() => {
    if (!active) {
      return
    }

    return subscribeConfirmedHit(() => {
      const target = targetRef.current
      if (target.callId === null || target.pitchClass === null) {
        return
      }

      const detector = detectorRef.current
      syncTarget(detector, target.callId, target.pitchClass)
      detector.pulsesThisCall = 1
      detector.lastPulseAt = detector.lastSampleAt
      detector.riseArmed = false
      detector.troughLevel = null
      detector.silenceSeen = false
      detector.attackAt = null
      setPulse((current) => current + 1)
    })
  }, [active, subscribeConfirmedHit])

  useEffect(() => {
    if (!active) {
      detectorRef.current = createDetectorState()
      return
    }

    return subscribe((sample) => {
      const target = targetRef.current
      if (target.callId === null || target.pitchClass === null) {
        return
      }

      const detector = detectorRef.current
      syncTarget(detector, target.callId, target.pitchClass)

      const { audioTime, level } = sample
      detector.lastSampleAt = audioTime
      const matching = sample.heard?.pitchClass === target.pitchClass
      if (level < SILENCE_RMS) {
        detector.silenceSeen = true
        detector.riseArmed = true
        detector.troughLevel =
          detector.troughLevel === null ? level : Math.min(detector.troughLevel, level)
      }
      if (detector.peakLevel > 0 && level <= detector.peakLevel * REARM_LEVEL_FRACTION) {
        detector.riseArmed = true
        detector.troughLevel =
          detector.troughLevel === null ? level : Math.min(detector.troughLevel, level)
      }

      const levelRise =
        detector.previousLevel !== null &&
        detector.troughLevel !== null &&
        detector.riseArmed &&
        audioTime - detector.lastPulseAt >= MIN_LEVEL_PLUCK_INTERVAL_S &&
        level >= detector.previousLevel * ATTACK_LEVEL_RATIO &&
        level - detector.previousLevel >= ATTACK_LEVEL_RISE &&
        level >= detector.troughLevel * ATTACK_LEVEL_RATIO &&
        level - detector.troughLevel >= ATTACK_LEVEL_RISE
      if (levelRise) {
        detector.attackAt = audioTime
      }
      const attackConfirmed =
        detector.attackAt !== null && audioTime - detector.attackAt <= ATTACK_CONFIRM_S
      const canPulseAgain =
        detector.pulsesThisCall === 1 && (detector.silenceSeen || attackConfirmed)

      if (matching && canPulseAgain && detector.pulsesThisCall < MAX_PULSES_PER_CALL) {
        detector.pulsesThisCall += 1
        detector.lastPulseAt = audioTime
        detector.peakLevel = level
        detector.troughLevel = null
        detector.riseArmed = false
        detector.silenceSeen = false
        detector.attackAt = null
        setPulse((current) => current + 1)
      } else {
        detector.peakLevel = Math.max(detector.peakLevel, level)
      }

      detector.previousLevel = level
    })
  }, [active, subscribe])

  return pulse
}
