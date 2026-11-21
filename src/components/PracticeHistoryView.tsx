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
  hasHistory,
  isBackupFileType,
  MAX_BACKUP_BYTES,
  parseBackup,
  practiceDayTitle,
  WEEKDAY_INITIALS,
  type ImportSummary,
  type PracticeBackup,
  type PracticeHistory,
} from '../lib/history'

type PracticeHistoryViewProps = {
  open: boolean
  history: PracticeHistory
  onClose: () => void
  /** The file's contents, asked for at the moment of the click — see App. */
  getBackup: () => string
  /** What was added, or null when the merged log couldn't be stored — see App. */
  onImport: (incoming: PracticeBackup) => ImportSummary | null
  /**
   * True if a commit right now would bank something — see App. Keeps Export
   * live through the first ten seconds of a first-ever session, when
   * `history` is still empty but there is practice waiting in refs.
   */
  hasPendingPractice?: (() => boolean) | undefined
  /** Workouts or saved setups worth backing up, so Export is live with an empty log. */
  hasSavedContent?: boolean | undefined
  /** False once workouts or saved setups failed to reach the store. */
  listsPersisted?: boolean | undefined
  /** Injectable for tests; otherwise pinned to the real calendar. */
  today?: Date | undefined
}

const IMPORT_ERROR = "That file doesn't look like a practice-log backup — nothing was changed."

/**
 * Thrown rather than silently failing: a browser that refuses object URLs
 * (private modes, some locked-down embeds) leaves the click with nothing to
 * point at, and without this the export button would just do nothing.
 */
const EXPORT_ERROR = "The backup couldn't be downloaded — your browser refused it. Nothing was saved."

/**
 * A backup that read cleanly and then couldn't be saved. Worth its own line:
 * the file was fine, so "that file doesn't look like a backup" would send
 * somebody hunting for a second copy of something they already have.
 */
const RESTORE_BLOCKED_ERROR =
  "Your browser is blocking saved data — the backup was read, but it couldn't be saved in this browser."

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** The polite line an import leaves behind, in the product's words. */
const importNoteFor = (summary: ImportSummary) => {
  const added = [
    summary.workoutsAdded > 0 ? plural(summary.workoutsAdded, 'workout', 'workouts') : null,
    summary.setupsAdded > 0 ? plural(summary.setupsAdded, 'saved setup', 'saved setups') : null,
  ].filter((part): part is string => part !== null)

  const sentences = [
    added.length > 0 ? `Added ${added.join(' and ')}.` : 'Your workouts and saved setups were already here.',
  ]
  if (summary.unreadable.includes('workouts')) {
    sentences.push("The workouts in the file couldn't be read, so none were added.")
  }
  if (summary.unreadable.includes('savedSetups')) {
    sentences.push("The saved setups in the file couldn't be read, so none were added.")
  }

  return sentences.join(' ')
}

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
export function PracticeHistoryView({
  open,
  history,
  onClose,
  getBackup,
  onImport,
  hasPendingPractice,
  hasSavedContent = false,
  listsPersisted = true,
  today,
}: PracticeHistoryViewProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Mirrors `open` for handleFile's async continuations, which close over
  // whatever `open` was when the read started — a ref stays current if the
  // sheet closes mid-read, so a late failure can't repaint the error the
  // cleanup below just cleared.
  const openRef = useRef(open)
  // The latest onImport, not the one handleFile closed over: the sheet can
  // close and the lists change while the file is read, and a restore merged
  // into the lists as they were would write those changes away.
  const onImportRef = useRef(onImport)

  useEffect(() => {
    onImportRef.current = onImport
  })

  // On the stand this opens on top of the practice sheet, which runs a trap of
  // its own on the window — hence capture. Focus starts on the close button
  // rather than the first square: the way out is the answer to "how do I get
  // back?", and the calendar is a long way to Tab through to reach it.
  useFocusTrap(sheetRef, open, onClose, { capture: true, initialFocus: closeRef })

  useEffect(() => {
    openRef.current = open

    if (!open) {
      return undefined
    }

    // Closing ends the question that was being asked, so the next opening
    // starts on today again rather than on whatever was last tapped — and
    // clears any import error, which belongs to the visit that produced it.
    return () => {
      setSelectedKey(null)
      setImportError(null)
      setImportNote(null)
    }
  }, [open])

  if (!open) {
    return null
  }

  const now = today ?? new Date()
  const populated = hasHistory(history)
  // A brand-new session hasn't hit its first automatic flush yet, so `history`
  // reads empty even though there is practice waiting to be banked — Export
  // stays live for it rather than only for what has already been committed.
  const canExport = populated || hasSavedContent || (hasPendingPractice?.() ?? false)
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
    setExportError(null)
    const anchor = document.createElement('a')
    let url: string | null = null

    try {
      const blob = new Blob([getBackup()], { type: 'application/json' })
      url = URL.createObjectURL(blob)
      anchor.href = url
      anchor.download = `callnote-practice-log-${dayKey(now)}.json`
      // Some browsers only honour a click on an anchor that is actually in
      // the document.
      document.body.appendChild(anchor)
      anchor.click()
    } catch {
      setExportError(EXPORT_ERROR)
    } finally {
      anchor.remove()
      if (url !== null) {
        const revokeUrl = url
        // Deferred past the click so a download that has just started isn't
        // cancelled by revoking the URL it's still reading from.
        window.setTimeout(() => URL.revokeObjectURL(revokeUrl), 0)
      }
    }
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
    setImportNote(null)
    if (file.size > MAX_BACKUP_BYTES || !isBackupFileType(file.type)) {
      setImportError(IMPORT_ERROR)
      return
    }

    // The picked file can still fail to read if it was moved, changed, or
    // made unreadable in the gap between picking it and this await (Chromium
    // surfaces that as NotReadableError) — without a guard here that rejection
    // would escape as an unhandled promise rejection and leave no error on screen.
    let contents: string
    try {
      contents = await file.text()
    } catch {
      if (openRef.current) {
        setImportError(IMPORT_ERROR)
      }
      return
    }

    const parsed = parseBackup(contents)
    if (parsed === null) {
      if (openRef.current) {
        setImportError(IMPORT_ERROR)
      }
      return
    }

    // Leaving the last failure on screen beside a log that has since been
    // restored would be its own kind of lie. The read crossed an await, so the
    // sheet may have closed underneath it — still worth writing (it's a real
    // backup), just not worth repainting a message over a visit that has
    // already cleared its own.
    const summary = onImportRef.current(parsed)
    if (openRef.current) {
      setImportError(summary === null ? RESTORE_BLOCKED_ERROR : null)
      setImportNote(summary === null ? null : importNoteFor(summary))
    }
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
          {populated ? (
            <>
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
            </>
          ) : (
            <p className="practice-history-backup-note" data-testid="history-empty">
              Nothing logged yet. A minute of practice fills in today’s square.
            </p>
          )}

          <div className="practice-history-backup">
            <p className="practice-history-backup-note">
              A backup holds your practice log, workouts and saved setups. It is a plain JSON file. Importing one merges it with what is here and keeps the longer of any two
              days, so a restore can only ever add to your history.
            </p>

            <div className="practice-history-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={handleExport}
                disabled={!canExport}
                title={canExport ? undefined : 'Nothing to export yet — practise for a minute first'}
                data-testid="history-export"
              >
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

            {/* Mounted before it has anything to say: a live region added with its
                text already in it is one many screen readers never announce. */}
            <div role="status" data-testid="history-import-status">
              {importNote !== null ? (
                <p className="practice-history-backup-note" data-testid="history-import-note">
                  {importNote}
                  {listsPersisted ? null : " This browser is blocking saved data — they'll last until this tab closes."}
                </p>
              ) : null}
            </div>

            {importError !== null ? (
              <p className="practice-history-error" role="alert" data-testid="history-import-error">
                {importError}
              </p>
            ) : null}

            {exportError !== null ? (
              <p className="practice-history-error" data-testid="history-export-error" role="alert">
                {exportError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
