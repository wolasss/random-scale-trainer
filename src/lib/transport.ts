/** What the transport needs to know about the session to label its play control. */
export type TransportState = {
  isPlaying: boolean
  isPaused: boolean
  /** Name of the selected routine, or null for free practice. */
  routineName?: string | null
  routineFinished?: boolean
}

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
  // Only a timed routine can finish, and the UI's name for that shape is a
  // workout — "routine" is the code's umbrella word, not the player's.
  if (routineFinished) return 'Restart workout'
  if (isPaused) return 'Resume'
  return routineName ? `Start ${routineName}` : 'Start practice'
}
