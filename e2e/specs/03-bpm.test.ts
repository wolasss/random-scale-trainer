import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEYS } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

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
    // ~300ms taps → nominally 200 BPM; WebDriver click latency skews slow,
    // so assert a generous band rather than an exact value.
    await page().tapTempo(5, 300)
    const bpm = await page().getBpm()
    assert.ok(bpm >= 120 && bpm <= 240, `expected tapped BPM in 120-240, got ${bpm}`)
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
