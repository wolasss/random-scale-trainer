import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { COUNT_IN_DIGIT, MESSAGES, NOTE_NAMES, STORAGE_KEYS, timerToSeconds } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

// All playback tests run at BPM 240 (250ms beats) with a new note every
// beat to keep the suite fast.
describe('playback', () => {
  const page = useTrainerSession()

  beforeEach(async () => {
    await page().openFresh()
    await page().seedStorageAndReload(STORAGE_KEYS.beatsPerNote, '1')
    await page().setBpmToMax()
  })

  it('runs the count-in and then calls out notes', async () => {
    await page().clickPlayPause()

    await page().waitForCountIn()
    assert.equal(await page().getPlayButtonText(), 'Pause')
    assert.equal(await page().isPlayButtonPrimary(), false)
    assert.equal(await page().getNowPlayingState(), 'active')
    const countdown = await page().getCurrentNote()
    assert.match(countdown ?? '', COUNT_IN_DIGIT)

    const note = await page().waitForNotePlaying()
    assert.ok(NOTE_NAMES.has(note), `expected a valid note, got "${note}"`)

    const distinct = await page().collectDistinctNotes(2, 5_000)
    assert.ok(distinct.length >= 2)
  })

  it('pauses with a frozen timer and resumes', async () => {
    await page().clickPlayPause()
    await page().waitForNotePlaying()
    await page().waitForTimerAtLeast(1)

    await page().clickPlayPause()
    await page().waitForMessage(MESSAGES.paused)
    assert.equal(await page().getNowPlayingState(), 'paused')
    assert.equal(await page().getPlayButtonText(), 'Resume')
    assert.equal(await page().isPlayButtonPrimary(), true)

    const frozen = await page().getTimer()
    await page().sleep(1_500)
    assert.equal(await page().getTimer(), frozen)

    await page().clickPlayPause()
    const note = await page().waitForNotePlaying(5_000)
    assert.ok(NOTE_NAMES.has(note))
    assert.equal(await page().getNowPlayingState(), 'active')
    await page().waitForTimerAtLeast(timerToSeconds(frozen) + 1)
  })
})
