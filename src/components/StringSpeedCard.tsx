import { useMemo } from 'react'
import { hasStringSpeed, parseStringSpeedKey, type StringSpeedEntry, type StringSpeedLog } from '../lib/stringSpeed'
import { findTuning, neckStrings, type TuningId } from '../lib/tunings'

type StringSpeedCardProps = {
  log: StringSpeedLog
  /** The neck you're on now, so its strings sort to the top of the card. */
  tuning: TuningId
}

const seconds = (ms: number) => (ms / 1000).toFixed(1)

const times = (count: number) => `${count} ${count === 1 ? 'time' : 'times'}`

type Row = {
  key: string
  tuningId: TuningId
  text: string
  entry: StringSpeedEntry
}

/** One tuning's six labels, built once per tuning rather than once per entry. */
const stringLabels = (tuningId: TuningId): Map<number, string> =>
  new Map(neckStrings(tuningId, null, false).map((string) => [string.midi, `${string.ordinal} string (${string.label})`]))

/**
 * How fast "Skip ahead once I've found it" has found the called note, while a
 * string was actually named as the one being timed — see stringSpeed.ts for
 * why that naming is a claim the app takes on trust rather than one the mic
 * can check.
 *
 * Off entirely until a first reading exists: an empty grid with a heading
 * over it reads as a form still to fill in, and nothing here is a setting
 * worth surfacing before there is a number behind it.
 */
export function StringSpeedCard({ log, tuning }: StringSpeedCardProps) {
  const rows = useMemo<Row[]>(() => {
    const labelsByTuning = new Map<TuningId, Map<number, string>>()
    const built: Row[] = []

    for (const [key, entry] of Object.entries(log)) {
      const parsed = parseStringSpeedKey(key)
      if (parsed === null) {
        continue
      }

      let labels = labelsByTuning.get(parsed.tuningId)
      if (!labels) {
        labels = stringLabels(parsed.tuningId)
        labelsByTuning.set(parsed.tuningId, labels)
      }

      const stringText = labels.get(parsed.midi)
      if (stringText === undefined) {
        continue
      }

      built.push({
        key,
        tuningId: parsed.tuningId,
        text: `${findTuning(parsed.tuningId).label} · ${stringText}`,
        entry,
      })
    }

    // The neck you're on now is what you came here to check, so its strings
    // lead; everything else follows by best time, fastest first.
    built.sort((a, b) => {
      const aCurrent = a.tuningId === tuning
      const bCurrent = b.tuningId === tuning
      if (aCurrent !== bCurrent) {
        return aCurrent ? -1 : 1
      }

      return a.entry.bestMs - b.entry.bestMs
    })

    return built
  }, [log, tuning])

  if (!hasStringSpeed(log)) {
    return null
  }

  return (
    <section className="panel" data-testid="string-speed-card" aria-labelledby="string-speed-heading">
      <div className="panel-heading">
        <h2 id="string-speed-heading">String speed</h2>
        <p>How fast Skip ahead has found the called note, for each string you've named as the one being timed.</p>
      </div>

      <div className="session-stats" data-testid="string-speed-grid">
        {rows.map((row) => {
          const spoken = `${row.text}: best ${seconds(row.entry.bestMs)} seconds, over ${times(row.entry.count)}`

          return (
            <div
              className="session-stat"
              key={row.key}
              data-testid={`string-speed-${row.key}`}
              role="img"
              aria-label={spoken}
            >
              <span className="session-stat-value">{seconds(row.entry.bestMs)}s</span>
              <span className="session-stat-label">
                {row.text} · {times(row.entry.count)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
