import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { METER_RANGE_CENTS, type TunerReading } from '../hooks/useTuner'
import type { MicStatus } from '../hooks/useMicPitch'

type TunerPanelProps = {
  open: boolean
  onClose: () => void
  status: MicStatus
  reading: TunerReading | null
}

/** The same wording the practice readout uses, so a mic problem reads alike. */
const STATUS_MESSAGES: Record<Exclude<MicStatus, 'listening'>, string> = {
  idle: 'Opening the microphone…',
  denied: 'Mic blocked — allow microphone access in your browser.',
  unsupported: 'This browser has no microphone to listen with.',
}

/**
 * Rounded to the nearest five cents. An exact figure re-announced twenty times
 * a second is unreadable and unlistenable alike; the needle beside it carries
 * whatever precision is actually being read.
 */
const roundedCents = (cents: number) => Math.round(Math.abs(cents) / 5) * 5

/** What the line beside the needle says, for eyes and screen readers both. */
const readingText = (reading: TunerReading | null): string => {
  if (reading === null) {
    return 'Play a string.'
  }

  const named = `${reading.string.label} ${reading.string.name}`
  if (reading.status === 'in-tune') {
    return `${named} — in tune`
  }

  return `${named} — ${roundedCents(reading.cents)} cents ${reading.status}`
}

/** Where the needle sits, as a percentage across the track. Pins at the ends. */
const needleOffset = (cents: number) => {
  const clamped = Math.max(-METER_RANGE_CENTS, Math.min(METER_RANGE_CENTS, cents))

  return 50 + (50 * clamped) / METER_RANGE_CENTS
}

/**
 * Tuning up, before any of the practice starts.
 *
 * The app already hears the guitar — the detector and the mic capture are the
 * ones practice uses — so the only thing missing was somewhere to read the
 * answer. It measures against the nearest open string rather than the nearest
 * semitone: a string forty cents flat has to read as forty cents flat, not as
 * an in-tune something-else.
 *
 * The needle is a picture and nothing more. Everything it shows is also on the
 * line beside it, in words, in a live region — which is what makes this usable
 * with the phone face-down on the stand, or by someone who is never going to
 * see the needle at all. The cents on that line are rounded to five so it says
 * something different only when something has actually changed.
 */
export function TunerPanel({ open, onClose, status, reading }: TunerPanelProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  // On the stand this opens over the practice sheet, which runs a trap of its
  // own on the window — hence capture, so one Escape closes the tuner and
  // leaves the sheet behind it exactly where it was.
  useFocusTrap(sheetRef, open, onClose, { capture: true, initialFocus: closeRef })

  if (!open) {
    return null
  }

  // Through the body rather than the card it is opened from: a .panel keeps the
  // transform its entry animation ends on, which would make it the containing
  // block for anything fixed inside it.
  return createPortal(
    <div className="sheet-layer tuner-layer" data-testid="tuner-panel">
      <button type="button" className="sheet-scrim" aria-label="Close tuner" tabIndex={-1} onClick={onClose} />
      <div className="sheet tuner-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label="Tuner">
        <div className="sheet-header">
          <span className="sheet-grip" aria-hidden="true" />
          <h2 className="sheet-title">Tuner</h2>
          <button
            type="button"
            ref={closeRef}
            className="sheet-close"
            onClick={onClose}
            data-testid="tuner-close"
            aria-label="Close tuner"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="sheet-body">
          {status === 'listening' ? (
            <div className="tuner-body">
              <div className="tuner-heads">
                <span className="tuner-string" data-testid="tuner-string">
                  {reading === null ? '—' : `${reading.string.label} · ${reading.string.name}`}
                </span>
                <span className="tuner-note" data-testid="tuner-note">
                  {reading?.note ?? '—'}
                </span>
              </div>

              <div className="tuner-gauge">
                <div
                  className="tuner-meter"
                  data-testid="tuner-meter"
                  data-state={reading?.status ?? 'none'}
                  aria-hidden="true"
                >
                  <span className="tuner-band" />
                  {reading === null ? null : (
                    <span className="tuner-needle" style={{ left: `${needleOffset(reading.cents)}%` }} />
                  )}
                </div>

                <p className="tuner-reading" data-testid="tuner-reading" role="status" aria-live="polite">
                  {readingText(reading)}
                </p>
              </div>

              <p className="tuner-hint">
                Play one open string at a time. The band in the middle is five cents either way.
              </p>
            </div>
          ) : (
            <p className="tuner-message" data-testid="tuner-message">
              {STATUS_MESSAGES[status]}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
