import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { IDLE_NOTE, MESSAGES, TrainerPage, timerToSeconds } from '../pages/trainer.page.ts'

// With continuous mode off and BPM 100, a full cycle is 12 beats x 600ms
// plus the count-in — nominally ~9s end to end.
describe('session completion and reset', () => {
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
    await page.setBpmToMax()
    await page.clickContinuousToggle()
  })

  it('finishes after all 12 notes when continuous mode is off', async () => {
    await page.clickPlayPause()
    await page.waitForMessage(MESSAGES.finished, 25_000)

    assert.equal(await page.getPlayButtonText(), 'Play')
    assert.equal(await page.isPlayButtonPrimary(), true)
    assert.equal(await page.getCurrentNote(), IDLE_NOTE)
    assert.equal(await page.getNowPlayingState(), 'idle')

    // Timer runs from the first note to the finish (~7.2s nominal); wide
    // bounds absorb CI timer drift without losing the regression signal.
    const elapsed = timerToSeconds(await page.getTimer())
    assert.ok(elapsed >= 5 && elapsed <= 15, `expected elapsed 5-15s, got ${elapsed}s`)
  })

  it('reset during playback stops it and clears the session', async () => {
    await page.clickPlayPause()
    await page.waitForNotePlaying()

    await page.clickReset()
    assert.equal(await page.getPlaybackMessage(), MESSAGES.idle)
    assert.equal(await page.getCurrentNote(), IDLE_NOTE)
    assert.equal(await page.getTimer(), '00:00')
    assert.equal(await page.getPlayButtonText(), 'Play')
    assert.equal(await page.getNowPlayingState(), 'idle')
  })
})
