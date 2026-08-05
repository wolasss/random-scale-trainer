import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Key, type WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { IDLE_NOTE, MESSAGES, STORAGE_KEYS, TrainerPage } from '../pages/trainer.page.ts'

describe('keyboard shortcuts', () => {
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
  })

  it('adjusts BPM with arrow keys', async () => {
    await page.pressBody(Key.ARROW_UP, Key.ARROW_UP, Key.ARROW_UP)
    assert.equal(await page.getBpm(), 33)

    await page.pressBody(Key.ARROW_DOWN)
    assert.equal(await page.getBpm(), 32)
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.bpm), '32')
  })

  it('starts, pauses, and resets with Space and R', async () => {
    await page.setBpmToMax()

    await page.pressBody(Key.SPACE)
    await page.waitForNotePlaying()
    await page.waitForTimerAtLeast(1)

    await page.pressBody(Key.SPACE)
    await page.waitForMessage(MESSAGES.paused)
    assert.equal(await page.getPlayButtonText(), 'Play')

    await page.pressBody('r')
    assert.equal(await page.getTimer(), '00:00')
    assert.equal(await page.getCurrentNote(), IDLE_NOTE)
    // Current behavior: resetting while paused does not clear the "Paused"
    // message (stopPlayback is skipped when playback is already inactive).
    // Candidate product bug — if that ever gets fixed, update this assertion.
    assert.equal(await page.getPlaybackMessage(), MESSAGES.paused)
  })
})
