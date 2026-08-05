import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { STORAGE_KEYS, TrainerPage } from '../pages/trainer.page.ts'

describe('session card', () => {
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

  it('the practice goal persists across a reload', async () => {
    await page.setSessionGoal(5)
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.sessionGoal), '5')

    await page.refresh()
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.sessionGoal), '5')
  })

  it('progress and stats grow with playback and reset clears them', async () => {
    await page.seedStorageAndReload(STORAGE_KEYS.beatsPerNote, '1')
    await page.setSessionGoal(5)
    await page.setBpmToMax()

    assert.equal(await page.getSessionProgress(), 0)
    assert.equal(await page.getStat('notes'), 0)

    await page.clickPlayPause()
    await page.waitForNotePlaying()
    await page.waitForTimerAtLeast(3)

    assert.ok((await page.getStat('notes')) > 0, 'notes-called stat did not grow')
    assert.ok((await page.getSessionProgress()) >= 1, 'goal progress did not grow')

    await page.clickReset()
    assert.equal(await page.getStat('notes'), 0)
    assert.equal(await page.getStat('cycles'), 0)
    assert.equal(await page.getSessionProgress(), 0)
    assert.equal(await page.getTimer(), '00:00')
  })
})
