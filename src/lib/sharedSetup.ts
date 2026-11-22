import { BEAT_SPAN_OPTIONS, MAX_BPM, MIN_BPM, type BeatsPerNote } from '../constants'
import { CHALLENGE_PARAM } from './challenge'
import { sortedPcs } from './notes'

export type SharedSetup = {
  pool: readonly number[]
  bpm: number
  beatsPerNote: BeatsPerNote
}

export function encodeSharedSetup(settings: SharedSetup): string {
  return new URLSearchParams({
    pool: settings.pool.join(','),
    bpm: String(settings.bpm),
    beats: String(settings.beatsPerNote),
  }).toString()
}

export function parseSharedSetup(search: string): SharedSetup | null {
  const params = new URLSearchParams(search)
  if (
    params.has(CHALLENGE_PARAM) ||
    ['pool', 'bpm', 'beats'].some((key) => params.getAll(key).length !== 1)
  ) {
    return null
  }

  const poolText = params.get('pool')!
  const bpmText = params.get('bpm')!
  const beatsText = params.get('beats')!
  if (!/^\d+(,\d+)*$/.test(poolText) || !bpmText.trim() || !beatsText.trim()) {
    return null
  }

  const pool = poolText.split(',').map(Number)
  const bpm = Number(bpmText)
  const beatsPerNote = BEAT_SPAN_OPTIONS.find((option) => option === Number(beatsText))
  if (
    pool.some((pitchClass) => !Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass > 11) ||
    new Set(pool).size !== pool.length ||
    !Number.isInteger(bpm) ||
    bpm < MIN_BPM ||
    bpm > MAX_BPM ||
    beatsPerNote === undefined
  ) {
    return null
  }

  return { pool: sortedPcs(pool), bpm, beatsPerNote }
}
