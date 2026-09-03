import { Icon } from './ui/Icon'
import { faPause, faPlay } from '@fortawesome/free-solid-svg-icons'
import { transportLabel, type TransportState } from '../lib/transport'
import { formatElapsed, formatRemaining } from '../lib/time'
import { usePersistentState } from '../hooks/usePersistentState'
import { STORAGE_KEYS } from '../constants'
import type { SessionGoalMin } from '../hooks/useSettings'

type GoalReadoutMode = 'elapsed' | 'remaining'

/**
 * The play control, shared by both readings of the transport — the desktop bar
 * and the stand's bottom control. It is the only start button in the app, so
 * the two can only differ in where they sit, never in what they say.
 */
export function PlayToggle({
  transport,
  className,
  onClick,
}: {
  transport: TransportState
  className: string
  onClick: () => void
}) {
  const label = transportLabel(
    transport.isPlaying,
    transport.isPaused,
    transport.routineName,
    transport.routineFinished,
  )

  return (
    <button
      type="button"
      className={`${className} ${transport.isPlaying ? 'secondary-button' : 'primary-button'}`}
      data-testid="play-toggle"
      onClick={onClick}
    >
      <Icon icon={transport.isPlaying ? faPause : faPlay} /> {label}
    </button>
  )
}

/**
 * Progress toward the goal, read from the playing position — this is what lets
 * the Session card live at the foot of the page. Both transports render it, and
 * both wait for the first press before showing it.
 *
 * Tapping it flips between counting up ('03:12 of 20 min') and counting down
 * ('16:48 left'), so nobody has to do the subtraction mid-exercise. The choice
 * is remembered across sessions.
 */
export function GoalReadout({
  elapsedMs,
  goalMin,
  className,
}: {
  elapsedMs: number
  goalMin: SessionGoalMin
  className?: string
}) {
  const [mode, setMode] = usePersistentState<GoalReadoutMode>(STORAGE_KEYS.goalCountdown, {
    defaultValue: 'elapsed',
    deserialize: (raw) => (raw === 'elapsed' || raw === 'remaining' ? raw : undefined),
  })

  const reading =
    mode === 'remaining'
      ? `${formatRemaining(elapsedMs, goalMin * 60_000)} left`
      : `${formatElapsed(elapsedMs)} of ${goalMin} min`

  // The mode leads the label: a screen reader has to be able to tell which
  // reading is on screen without acting on the control.
  const label =
    mode === 'remaining'
      ? `Remaining time, ${reading} — tap to show elapsed time`
      : `Elapsed time, ${reading} — tap to show remaining time`

  return (
    <button
      type="button"
      className={`transport-readout ${className ?? ''}`.trim()}
      data-testid="transport-readout"
      aria-label={label}
      onClick={() => setMode((current) => (current === 'elapsed' ? 'remaining' : 'elapsed'))}
    >
      {reading}
    </button>
  )
}
