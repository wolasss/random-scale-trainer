import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Key, type WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { MESSAGES, STORAGE_KEYS, TrainerPage } from '../pages/trainer.page.ts'

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
    assert.equal(await page.getBpm(), 75)

    await page.pressBody(Key.ARROW_DOWN)
    assert.equal(await page.getBpm(), 74)
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.bpm), '74')
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
    assert.equal(await page.getCurrentNote(), null)
    // Reset now always returns to the idle prompt, even from paused —
    // the old "Paused message survives reset" quirk was fixed on purpose.
    assert.equal(await page.getPlaybackMessage(), MESSAGES.idle)
  })
})
