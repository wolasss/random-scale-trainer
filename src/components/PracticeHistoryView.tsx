import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import {
  bestStreak,
  buildMonths,
  currentStreak,
  dayKey,
  isBackupFileType,
  MAX_BACKUP_BYTES,
  parseBackup,
  WEEKDAY_INITIALS,
  type PracticeHistory,
} from '../lib/history'

type PracticeHistoryViewProps = {
  open: boolean
  history: PracticeHistory
  onClose: () => void
  /** The file's contents, asked for at the moment of the click — see App. */
  getBackup: () => string
  onImport: (incoming: PracticeHistory) => void
  /** Injectable for tests; otherwise pinned to the real calendar. */
  today?: Date
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
].join(', ')

function focusableWithin(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('hidden'),
  )
}

/** Same wording as the strip on the card, so one day reads the same in both. */
const dayTitle = (minutes: number, sec: number) => {
  if (sec === 0) {
    return 'no practice'
  }

  return minutes === 0 ? 'under a minute' : `${minutes} min`
}

const IMPORT_ERROR = "That file doesn't look like a practice-log backup — nothing was changed."

/**
 * The whole log, not the fortnight the card has room for.
 *
 * The card's fourteen bars are a nudge — they answer "am I keeping this up?".
 * This answers "what have I done?", which is a different question and only
 * worth asking once there is enough behind you to be worth looking at. Hence a
 * calendar rather than more bars: a year of practice is a shape, and a shape is
 * something you can recognise yourself in.
 *
 * Export and import live here for the same reason. Someone who has built a year
 * of this has something to lose, and a log kept in one browser's storage is one
 * cleared cache from gone.
 */
export function PracticeHistoryView({ open, history, onClose, getBackup, onImport, today }: PracticeHistoryViewProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const onCloseRef = useRef(onClose)
  const [importError, setImportError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        // On the stand this opens on top of the practice sheet, which listens
        // for Escape on the window. Without stopping here, one press would
        // close both — and the sheet is not what the user asked to leave.
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const sheet = sheetRef.current
      if (sheet === null) {
        return
      }

      // Two nested tab traps would otherwise pull in opposite directions.
      event.stopPropagation()

      const focusable = focusableWithin(sheet)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = active instanceof HTMLElement && sheet.contains(active)

      let next: HTMLElement | null = null
      if (!inside) {
        next = event.shiftKey ? last : first
      } else if (event.shiftKey && active === first) {
        next = last
      } else if (!event.shiftKey && active === last) {
        next = first
      }

      if (next !== null) {
        event.preventDefault()
        next.focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Capture, so this runs before the practice sheet's window handler rather
    // than after it has already acted on the same press.
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown, true)
      // Closing ends the question that was being asked, so the next opening
      // starts on today again rather than on whatever was last tapped.
      setSelectedKey(null)

      if (opener !== null && opener.isConnected) {
        opener.focus()
      }
    }
  }, [open])

  if (!open) {
    return null
  }

  const now = today ?? new Date()
  const streak = currentStreak(history, now)
  const best = bestStreak(history)
  const months = buildMonths(history, now)

  // Today until a square is tapped: the calendar's squares are too small to
  // hold a reading, and on a phone there is no hover to put one in a tooltip.
  const selectedDay = selectedKey ?? dayKey(now)
  const selected = history.days[selectedDay]
  const selectedSec = selected?.sec ?? 0

  const entries = Object.values(history.days)
  const totalSec = entries.reduce((sum, day) => sum + day.sec, 0)
  const totalNotes = entries.reduce((sum, day) => sum + day.notes, 0)

  const handleExport = () => {
    const blob = new Blob([getBackup()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `callnote-practice-log-${dayKey(now)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Cleared either way, so picking the same file twice still fires a change.
    input.value = ''
    if (file === undefined) {
      return
    }

    // The envelope, before the contents: reading a mis-picked video into a
    // string and JSON.parsing it would hang the tab long before parseBackup
    // ever got to say no.
    if (file.size > MAX_BACKUP_BYTES || !isBackupFileType(file.type)) {
      setImportError(IMPORT_ERROR)
      return
    }

    const parsed = parseBackup(await file.text())
    if (parsed === null) {
      setImportError(IMPORT_ERROR)
      return
    }

    setImportError(null)
    onImport(parsed)
  }

  // Through the body, not the card. It is opened from inside a .panel, and a
  // panel keeps the transform its entry animation ends on — which is enough to
  // make it the containing block for anything fixed inside it, and would pin a
  // full-screen overlay to the corner of one card.
  return createPortal(
    <div className="sheet-layer history-layer" data-testid="practice-history-view">
      <button
        type="button"
        className="sheet-scrim"
        aria-label="Close practice history"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="sheet history-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Practice history"
      >
        <div className="sheet-header">
          <span className="sheet-grip" aria-hidden="true" />
          <h2 className="sheet-title">Practice history</h2>
          <button
            type="button"
            ref={closeRef}
            className="sheet-close"
            onClick={onClose}
            data-testid="practice-history-close"
            aria-label="Close practice history"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="practice-history-summary">
            <span className="practice-history-streak" data-testid="history-streak">
              {streak} {streak === 1 ? 'day' : 'days'} in a row
            </span>
            {best > 0 ? (
              <span className="practice-history-best" data-testid="history-best">
                best {best}
              </span>
            ) : null}
            <span className="practice-history-totals" data-testid="history-totals">
              {entries.length} days practised · {Math.round(totalSec / 60)} min · {totalNotes} notes
            </span>
          </div>

          <div className="practice-history-months">
            {months.map((month) => (
              <section className="practice-history-month" key={month.key}>
                <div className="practice-history-month-head">
                  <h3 className="practice-history-month-name">{month.label}</h3>
                  <span className="practice-history-month-total">{month.totalMinutes} min</span>
                </div>

                <div className="practice-history-weekdays" aria-hidden="true">
                  {WEEKDAY_INITIALS.map((initial, index) => (
                    <span key={index}>{initial}</span>
                  ))}
                </div>

                <div className="practice-history-grid">
                  {month.cells.map((cell, index) => {
                    if (cell === null) {
                      return <span className="practice-history-pad" key={`pad-${index}`} aria-hidden="true" />
                    }

                    const label = `${cell.key}: ${dayTitle(cell.minutes, cell.sec)}`
                    const className = [
                      `practice-history-cell is-l${cell.level}`,
                      cell.isToday ? 'is-today' : '',
                      cell.isFuture ? 'is-future' : '',
                      !cell.isFuture && cell.key === selectedDay ? 'is-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')

                    // A day the calendar hasn't reached has nothing to read out,
                    // so it stays a picture rather than becoming a tab stop.
                    return cell.isFuture ? (
                      <span key={cell.key} className={className} role="img" title={label} aria-label={label} />
                    ) : (
                      <button
                        key={cell.key}
                        type="button"
                        className={className}
                        title={label}
                        aria-label={label}
                        aria-pressed={cell.key === selectedDay}
                        onClick={() => setSelectedKey(cell.key)}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <p className="practice-history-day" data-testid="history-day">
            {selectedDay} · {dayTitle(Math.round(selectedSec / 60), selectedSec)} · {selected?.notes ?? 0} notes
          </p>

          <div className="practice-history-backup">
            <p className="practice-history-backup-note">
              A backup is a plain JSON file. Importing one merges it with what is here and keeps the longer of any two
              days, so a restore can only ever add to your history.
            </p>

            <div className="practice-history-actions">
              <button type="button" className="ghost-button" onClick={handleExport} data-testid="history-export">
                Export backup
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => fileRef.current?.click()}
                data-testid="history-import"
              >
                Import backup
              </button>
            </div>

            <input
              ref={fileRef}
              className="practice-history-file"
              type="file"
              accept="application/json,.json"
              tabIndex={-1}
              aria-hidden="true"
              onChange={handleFile}
              data-testid="history-file"
            />

            {importError !== null ? (
              <p className="practice-history-error" data-testid="history-import-error">
                {importError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
