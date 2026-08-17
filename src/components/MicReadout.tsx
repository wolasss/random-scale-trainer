import { FLAT_DISPLAY, SHARP_DISPLAY, type SpellingPreference } from '../lib/notes'
import type { MicStatus } from '../hooks/useMicPitch'

type MicReadoutProps = {
  status: MicStatus
  heard: { pitchClass: number; cents: number } | null
  spelling: SpellingPreference
}

const STATUS_MESSAGES: Record<Exclude<MicStatus, 'listening'>, string> = {
  idle: 'Listening starts with playback.',
  denied: 'Mic blocked — allow microphone access in your browser.',
  unsupported: 'This browser has no microphone to listen with.',
}

/**
 * What the microphone is hearing, one line of it. The heard note is not scored
 * against the called one here — this is the readout that says the ear works at
 * all, and it is the only way to tell a mic that is off from one that is on and
 * hearing nothing.
 *
 * Only 'mixed' has a choice to make and no note to make it about, so it reads
 * as sharps; a player who asked for flats gets flats.
 */
export function MicReadout({ status, heard, spelling }: MicReadoutProps) {
  if (status !== 'listening') {
    return (
      <div className="mic-readout" data-testid="mic-readout" data-status={status}>
        <span className="mic-readout-label">Mic</span>
        <span className="mic-readout-message">{STATUS_MESSAGES[status]}</span>
      </div>
    )
  }

  const names = spelling === 'flat' ? FLAT_DISPLAY : SHARP_DISPLAY
  // Math.round hands back -0 just under the note, which reads as "-0 cents".
  const cents = heard === null ? 0 : Math.round(heard.cents) || 0

  return (
    <div className="mic-readout" data-testid="mic-readout" data-status={status}>
      <span className="mic-readout-label">Hearing</span>
      {heard === null ? (
        <span className="mic-readout-message" data-testid="heard-note">
          <span className="mic-readout-none" aria-hidden="true">
            —
          </span>{' '}
          no pitch
        </span>
      ) : (
        <span className="mic-readout-heard" data-testid="heard-note">
          <span className="mic-readout-note">{names[heard.pitchClass]}</span>
          <span className="mic-readout-cents">
            {cents > 0 ? '+' : ''}
            {cents} cents
          </span>
        </span>
      )}
    </div>
  )
}
