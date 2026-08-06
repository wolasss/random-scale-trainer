/**
 * The only start button in the app labels itself from state. Both readings of
 * the transport — the desktop bar and the stand's bottom control — share this,
 * so they can never disagree about what pressing it will do.
 *
 * It lives outside the components so neither of them exports a non-component.
 */
export const transportLabel = (
  isPlaying: boolean,
  isPaused: boolean,
  routineName: string | null | undefined,
  routineFinished: boolean | undefined,
): string => {
  if (isPlaying) return 'Pause'
  if (routineFinished) return 'Restart routine'
  if (isPaused) return 'Resume'
  return routineName ? `Start ${routineName}` : 'Start practice'
}
