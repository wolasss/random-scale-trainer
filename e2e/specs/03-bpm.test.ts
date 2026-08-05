import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { STORAGE_KEYS, TrainerPage } from '../pages/trainer.page.ts'

describe('BPM slider', () => {
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

  it('reaches the maximum with End, updates cycle time and localStorage', async () => {
    await page.setBpmToMax()
    assert.equal(await page.getBpm(), 240)
    // 12 notes x 4 beats at 240 BPM = 12s
    assert.equal(await page.getCycleTime(), '≈ 0:12')
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.bpm), '240')
  })

  it('steps with arrow keys on the focused slider', async () => {
    await page.setBpmToMax()
    await page.nudgeBpmOnSlider(-1)
    assert.equal(await page.getBpm(), 239)
  })

  it('persists the chosen BPM across a reload', async () => {
    await page.setBpmToMax()
    await page.nudgeBpmOnSlider(-1)
    await page.refresh()
    assert.equal(await page.getBpm(), 239)
  })

  it('reaches the minimum with Home and updates cycle time', async () => {
    await page.setBpmToMin()
    assert.equal(await page.getBpm(), 30)
    // 12 notes x 4 beats at 30 BPM = 96s
    assert.equal(await page.getCycleTime(), '≈ 1:36')
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.bpm), '30')
  })
})
