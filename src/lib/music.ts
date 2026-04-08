export type NotePreference = 'sharp' | 'flat'

export type ScaleDefinition = {
  id: string
  name: string
  intervals: number[]
}

export type GeneratedScale = {
  id: string
  label: string
  root: string
  preference: NotePreference
  notes: string[]
  scaleName: string
}

const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const AMBIGUOUS_ROOTS = new Set([1, 3, 6, 8, 10])

const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor

export const getChromaticScale = (preference: NotePreference) =>
  preference === 'flat' ? FLAT_NOTES : SHARP_NOTES

export const speakableNoteName = (note: string) => note.replace(/^A/g, 'a. ').replace(/#/g, ' sharp').replace(/b/g, ' flat').toLowerCase()

const shuffleArray = <T,>(array: T[], random = Math.random): T[] => {
  const copy = [...array]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const parseIntervals = (intervalText: string) => {
  const values = intervalText
    .split(',')
    .map((chunk) => Number(chunk.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0)

  return Array.from(new Set(values)).sort((left, right) => left - right)
}

export const chooseNotePreference = (rootPitchClass: number, randomValue = Math.random()): NotePreference => {
  if (!AMBIGUOUS_ROOTS.has(rootPitchClass)) {
    return 'sharp' as const
  }

  return randomValue < 0.5 ? 'sharp' : 'flat'
}

export const noteNameFromPitchClass = (pitchClass: number, preference: NotePreference) =>
  getChromaticScale(preference)[positiveModulo(pitchClass, 12)]

export const generateScale = (
  definition: ScaleDefinition,
  rootPitchClass: number,
  preference: NotePreference = chooseNotePreference(rootPitchClass),
): GeneratedScale => {
  const root = noteNameFromPitchClass(rootPitchClass, preference)
  const notes = definition.intervals.map((interval) => noteNameFromPitchClass(rootPitchClass + interval, preference))

  return {
    id: `${definition.id}-${rootPitchClass}-${preference}`,
    label: `${root} ${definition.name}`,
    root,
    preference,
    notes,
    scaleName: definition.name,
  }
}

export const generateRandomScale = (definitions: ScaleDefinition[], random = Math.random): GeneratedScale | null => {
  if (definitions.length === 0) {
    return null
  }

  const definition = definitions[Math.floor(random() * definitions.length)]
  const rootPitchClass = Math.floor(random() * 12)
  const preference = chooseNotePreference(rootPitchClass, random())
  const scale = generateScale(definition, rootPitchClass, preference)
  
  return { ...scale, notes: shuffleArray(scale.notes, random) }
}

/**
 * Async versions using random.org API for better randomness
 */

const shuffleArrayWithIntegers = <T,>(array: T[], randomIntegers: number[]): T[] => {
  const copy = [...array]
  let intIndex = 0

  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIntegers[intIndex % randomIntegers.length] % (i + 1)
    intIndex++
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }

  return copy
}

export const generateRandomScaleAsync = async (
  definitions: ScaleDefinition[],
  randomIntegers?: number[],
): Promise<GeneratedScale | null> => {
  if (definitions.length === 0) {
    return null
  }

  // Pre-fetched random integers or generate new ones
  const { randomService } = await import('./randomService')
  const randoms = randomIntegers || (await randomService.getRandomIntegers(4 + definitions[0].intervals.length, 0, 1000))

  if (!randoms || randoms.length < 4) {
    return null
  }

  const definition = definitions[randoms[0] % definitions.length]
  const rootPitchClass = randoms[1] % 12
  const preferenceRandom = (randoms[2] % 1000) / 1000
  const preference = chooseNotePreference(rootPitchClass, preferenceRandom)
  const scale = generateScale(definition, rootPitchClass, preference)

  // Use the collected random integers for shuffling
  const shuffleIntegers = randoms.slice(3)

  return { ...scale, notes: shuffleArrayWithIntegers(scale.notes, shuffleIntegers) }
}