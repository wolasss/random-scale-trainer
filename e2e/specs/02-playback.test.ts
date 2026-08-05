import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { COUNT_IN_DIGIT, MESSAGES, NOTE_NAMES, STORAGE_KEYS, TrainerPage, timerToSeconds } from '../pages/trainer.page.ts'

// All playback tests run at BPM 240 (250ms beats) with a new note every
// beat to keep the suite fast.
describe('playback', () => {
  let driver: WebDriver
  let page: TrainerPage

  before(async () => {
    driver = await buildDriver()
    page = new TrainerPage(driver)
  })

  after(async () => {
    await driver.quit()
  })

  beforeEach(async () => {
    await page.openFresh()
    await page.seedStorageAndReload(STORAGE_KEYS.beatsPerNote, '1')
    await page.setBpmToMax()
  })

  it('runs the count-in and then calls out notes', async () => {
    await page.clickPlayPause()

    await page.waitForCountIn()
    assert.equal(await page.getPlayButtonText(), 'Pause')
    assert.equal(await page.isPlayButtonPrimary(), false)
    assert.equal(await page.getNowPlayingState(), 'active')
    const countdown = await page.getCurrentNote()
    assert.match(countdown ?? '', COUNT_IN_DIGIT)

    const note = await page.waitForNotePlaying()
    assert.ok(NOTE_NAMES.has(note), `expected a valid note, got "${note}"`)

    const distinct = await page.collectDistinctNotes(2, 5_000)
    assert.ok(distinct.length >= 2)
  })

  it('pauses with a frozen timer and resumes', async () => {
    await page.clickPlayPause()
    await page.waitForNotePlaying()
    await page.waitForTimerAtLeast(1)

    await page.clickPlayPause()
    await page.waitForMessage(MESSAGES.paused)
    assert.equal(await page.getNowPlayingState(), 'paused')
    assert.equal(await page.getPlayButtonText(), 'Start practice')
    assert.equal(await page.isPlayButtonPrimary(), true)

    const frozen = await page.getTimer()
    await page.sleep(1_500)
    assert.equal(await page.getTimer(), frozen)

    await page.clickPlayPause()
    const note = await page.waitForNotePlaying(5_000)
    assert.ok(NOTE_NAMES.has(note))
    assert.equal(await page.getNowPlayingState(), 'active')
    await page.waitForTimerAtLeast(timerToSeconds(frozen) + 1)
  })
})
