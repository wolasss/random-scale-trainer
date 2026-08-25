import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { useFocusTrap } from '../hooks/useFocusTrap'
import {
  bestStreak,
  buildMonths,
  currentStreak,
  dayKey,
  isBackupFileType,
  MAX_BACKUP_BYTES,
  parseBackup,
  practiceDayTitle,
  WEEKDAY_INITIALS,
  type PracticeHistory,
} from '../lib/history'

type PracticeHistoryViewProps = {
  open: boolean
  history: PracticeHistory
  onClose: () => void
  /** The file's contents, asked for at the moment of the click — see App. */
  getBackup: () => string
  /** Answers whether the merged log was actually stored — see App. */
  onImport: (incoming: PracticeHistory) => boolean
  /** Injectable for tests; otherwise pinned to the real calendar. */
  today?: Date
}

const IMPORT_ERROR = "That file doesn't look like a practice-log backup — nothing was changed."

/**
 * A backup that read cleanly and then couldn't be saved. Worth its own line:
 * the file was fine, so "that file doesn't look like a backup" would send
 * somebody hunting for a second copy of something they already have.
 */
const RESTORE_BLOCKED_ERROR =
  "Your browser is blocking saved data — the backup was read, but it couldn't be saved in this browser."

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
  const [importError, setImportError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // On the stand this opens on top of the practice sheet, which runs a trap of
  // its own on the window — hence capture. Focus starts on the close button
  // rather than the first square: the way out is the answer to "how do I get
  // back?", and the calendar is a long way to Tab through to reach it.
  useFocusTrap(sheetRef, open, onClose, { capture: true, initialFocus: closeRef })

  useEffect(() => {
    if (!open) {
      return undefined
    }

    // Closing ends the question that was being asked, so the next opening
    // starts on today again rather than on whatever was last tapped.
    return () => setSelectedKey(null)
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

    // A successful restore reloads, so the cleared error is really only for the
    // case where it didn't — leaving the last failure on screen beside a log
    // that has since been restored would be its own kind of lie.
    setImportError(onImport(parsed) ? null : RESTORE_BLOCKED_ERROR)
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

                    const label = `${cell.key}: ${practiceDayTitle(cell.minutes, cell.sec)}`
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
            {selectedDay} · {practiceDayTitle(Math.round(selectedSec / 60), selectedSec)} · {selected?.notes ?? 0} notes
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
              onChange={(event) => void handleFile(event)}
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
