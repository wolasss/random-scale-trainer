import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEYS } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

// Exact values from src/lib/tapTempo.ts — update here if they change.
const TAP_RESET_MS = 2500
const MIN_TAP_INTERVAL_MS = 100

describe('BPM slider', () => {
  const page = useTrainerSession()

  beforeEach(async () => {
    await page().openFresh()
  })

  it('reaches the maximum with End, updates cycle time and localStorage', async () => {
    await page().setBpmToMax()
    assert.equal(await page().getBpm(), 240)
    // 12 notes x 4 beats at 240 BPM = 12s
    assert.equal(await page().getCycleTime(), '00:12')
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.bpm), '240')
  })

  it('steps with arrow keys on the focused slider', async () => {
    await page().setBpmToMax()
    await page().nudgeBpmOnSlider(-1)
    assert.equal(await page().getBpm(), 239)
  })

  it('steps with the − / + buttons', async () => {
    await page().clickBpmStepper('up')
    assert.equal(await page().getBpm(), 73)
    await page().clickBpmStepper('down')
    await page().clickBpmStepper('down')
    assert.equal(await page().getBpm(), 71)
  })

  it('changing the note-change rate updates the cycle time', async () => {
    await page().setNoteEvery(1)
    // 12 notes x 1 beat at 72 BPM = 10s
    assert.equal(await page().getCycleTime(), '00:10')
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.beatsPerNote), '1')

    await page().setNoteEvery(8)
    // 12 notes x 8 beats at 72 BPM = 80s
    assert.equal(await page().getCycleTime(), '01:20')
  })

  it('tap tempo averages the tapped interval into the BPM', async () => {
    const taps = await page().tapTempo(5, 300)
    assert.equal(taps.length, 5)

    const gaps = taps.slice(1).map((time, index) => time - taps[index])
    for (const gap of gaps) {
      assert.ok(
        gap >= MIN_TAP_INTERVAL_MS && gap <= TAP_RESET_MS,
        `tap gap of ${gap}ms falls outside [${MIN_TAP_INTERVAL_MS}, ${TAP_RESET_MS}]ms — the app would have ` +
          `${gap < MIN_TAP_INTERVAL_MS ? 'dropped this tap as a double-fire' : 'reset the tap buffer on this gap'}`,
      )
    }

    const meanGapMs = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
    const expectedBpm = Math.min(240, Math.max(30, Math.round(60000 / meanGapMs)))
    const bpm = await page().getBpm()
    // ±2 covers rounding plus the sub-ms gap between the capture listener and
    // React's onClick firing within the same dispatch.
    assert.ok(
      Math.abs(bpm - expectedBpm) <= 2,
      `expected BPM near ${expectedBpm} (mean gap ${meanGapMs.toFixed(1)}ms), got ${bpm}`,
    )
  })

  it('persists the chosen BPM across a reload', async () => {
    await page().setBpmToMax()
    await page().nudgeBpmOnSlider(-1)
    await page().refresh()
    assert.equal(await page().getBpm(), 239)
  })

  it('reaches the minimum with Home and updates cycle time', async () => {
    await page().setBpmToMin()
    assert.equal(await page().getBpm(), 30)
    // 12 notes x 4 beats at 30 BPM = 96s
    assert.equal(await page().getCycleTime(), '01:36')
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.bpm), '30')
  })
})
