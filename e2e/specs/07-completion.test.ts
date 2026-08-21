import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MESSAGES, STORAGE_KEYS, timerToSeconds } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

// With continuous mode off, BPM 240, and a new note every beat, a full cycle
// is 12 beats x 250ms plus the 4-beat count-in — nominally ~4s end to end.
describe('session completion and reset', () => {
  const page = useTrainerSession()

  beforeEach(async () => {
    await page().openFresh()
    await page().seedStorageAndReload(STORAGE_KEYS.beatsPerNote, '1')
    await page().setBpmToMax()
    await page().clickContinuousToggle()
  })

  it('finishes after all 12 notes when continuous mode is off', async () => {
    await page().clickPlayPause()
    await page().waitForMessage(MESSAGES.finished, 25_000)

    assert.equal(await page().getPlayButtonText(), 'Start practice')
    assert.equal(await page().isPlayButtonPrimary(), true)
    assert.equal(await page().getCurrentNote(), null)
    assert.equal(await page().getNowPlayingState(), 'idle')

    // Timer runs from the first note to the finish (~3s nominal); wide
    // bounds absorb CI timer drift without losing the regression signal.
    const elapsed = timerToSeconds(await page().getTimer())
    assert.ok(elapsed >= 2 && elapsed <= 10, `expected elapsed 2-10s, got ${elapsed}s`)
  })

  it('reset during playback stops it and clears the session', async () => {
    await page().clickPlayPause()
    await page().waitForNotePlaying()

    await page().clickReset()
    assert.equal(await page().getPlaybackMessage(), MESSAGES.idle)
    assert.equal(await page().getCurrentNote(), null)
    assert.equal(await page().getTimer(), '00:00')
    assert.equal(await page().getPlayButtonText(), 'Start practice')
    assert.equal(await page().getNowPlayingState(), 'idle')
  })
})
