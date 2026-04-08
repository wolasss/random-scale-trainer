export type ScalePreset = {
  id: string
  name: string
  intervalText: string
  enabled: boolean
}

export const DEFAULT_SCALES: ScalePreset[] = [
  { id: 'major', name: 'Major', intervalText: '0, 2, 4, 5, 7, 9, 11, 12', enabled: true },
  { id: 'natural-minor', name: 'Natural Minor', intervalText: '0, 2, 3, 5, 7, 8, 10, 12', enabled: true },
  { id: 'major-pentatonic', name: 'Major Pentatonic', intervalText: '0, 2, 4, 7, 9, 12', enabled: true },
  { id: 'minor-pentatonic', name: 'Minor Pentatonic', intervalText: '0, 3, 5, 7, 10, 12', enabled: true },
  { id: 'blues', name: 'Blues', intervalText: '0, 3, 5, 6, 7, 10, 12', enabled: true },
]