export type ScalePreset = {
  id: string
  name: string
  intervalText: string
  enabled: boolean
}

export const DEFAULT_SCALES: ScalePreset[] = [
  { id: 'chromatic', name: 'Chromatic', intervalText: '0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12', enabled: true }
]