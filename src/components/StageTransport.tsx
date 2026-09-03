import type { ReactNode } from 'react'
import { Icon } from './ui/Icon'
import { faRotateLeft, faSliders } from '@fortawesome/free-solid-svg-icons'
import { GoalReadout, PlayToggle } from './TransportControls'
import type { TransportState } from '../lib/transport'
import type { SessionGoalMin } from '../hooks/useSettings'

type StageTransportProps = TransportState & {
  onPlayPause: () => void
  onReset: () => void
  onOpenSetup: () => void
  /** Anything to unwind yet — hides reset and the readout at a zeroed state,
   * matching the browser transport. */
  started: boolean
  elapsedMs: number
  goalMin: SessionGoalMin
  bpm: number
  onNudgeBpm: (delta: number) => void
  /** The routine strip, kept in view directly above the controls. */
  strip?: ReactNode
}

/**
 * The transport as it reads on a music stand: pinned to the bottom third, where
 * a thumb actually lands, and padded clear of the home indicator.
 *
 * The play control is the only large target. Setup and reset sit above it —
 * reachable, but never the thing you hit reaching for pause.
 */
export function StageTransport({
  onPlayPause,
  onReset,
  onOpenSetup,
  started,
  elapsedMs,
  goalMin,
  bpm,
  onNudgeBpm,
  strip,
  ...transport
}: StageTransportProps) {
  return (
    <div className="stage-foot">
      {strip}

      {/* Tempo lives beside the goal readout so a nudge never costs the three taps
          of opening the sheet, changing it, and closing it again. */}
      <div className="stage-status">
        <div className="stage-tempo">
          <button
            type="button"
            className="ghost-button stage-tempo-step"
            data-testid="stage-bpm-down"
            aria-label="Slower by 1 BPM"
            onClick={() => onNudgeBpm(-1)}
          >
            −
          </button>
          <output data-testid="stage-bpm-value" aria-label={`Tempo ${bpm} BPM`}>
            {bpm}
            <span className="stage-tempo-unit">BPM</span>
          </output>
          <button
            type="button"
            className="ghost-button stage-tempo-step"
            data-testid="stage-bpm-up"
            aria-label="Faster by 1 BPM"
            onClick={() => onNudgeBpm(1)}
          >
            +
          </button>
        </div>

        {/* How far into the session, without opening the sheet — the same readout
            the desktop transport carries, and it waits for the first press with it. */}
        {started ? <GoalReadout elapsedMs={elapsedMs} goalMin={goalMin} className="stage-readout-line" /> : null}
      </div>

      <div className="stage-secondary">
        <button
          type="button"
          className="secondary-button stage-setup"
          onClick={onOpenSetup}
          data-testid="open-setup"
          aria-label="Practice setup"
        >
          <Icon icon={faSliders} /> <span className="stage-setup-label">Practice setup</span>
        </button>
        {started ? (
          <button
            type="button"
            className="ghost-button stage-reset"
            onClick={onReset}
            data-testid="reset"
            aria-label="Reset session"
          >
            <Icon icon={faRotateLeft} />
          </button>
        ) : null}
      </div>

      <PlayToggle transport={transport} className="stage-play" onClick={onPlayPause} />
    </div>
  )
}
