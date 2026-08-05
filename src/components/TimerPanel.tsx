import { formatElapsed } from '../lib/time'

type TimerPanelProps = {
  elapsedMs: number
}

export function TimerPanel({ elapsedMs }: TimerPanelProps) {
  return (
    <section className="panel timer-panel">
      <div className="panel-heading">
        <h2>Session timer</h2>
        <p>The timer starts automatically when playback starts and pauses when playback stops.</p>
      </div>

      <div className="timer-face" data-testid="timer">{formatElapsed(elapsedMs)}</div>
    </section>
  )
}
