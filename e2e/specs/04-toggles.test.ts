import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { STORAGE_KEYS, TrainerPage } from '../pages/trainer.page.ts'

describe('continuous and speed ramp toggles', () => {
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

  it('disabling continuous mode hides speed ramp and forces it off', async () => {
    await page.clickContinuousToggle()

    const continuous = await page.getToggleState('continuous')
    assert.equal(continuous.text, 'Off')
    assert.equal(continuous.enabled, false)
    assert.equal(await page.isSpeedRampVisible(), false)
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.continuousMode), 'false')
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.speedRampMode), 'false')
  })

  it('re-enabling continuous mode brings speed ramp back as Off', async () => {
    await page.clickContinuousToggle()
    await page.clickContinuousToggle()

    assert.equal(await page.isSpeedRampVisible(), true)
    assert.equal((await page.getToggleState('speedRamp')).text, 'Off')
  })

  it('speed ramp can be enabled and both settings survive a reload', async () => {
    await page.clickSpeedRampToggle()
    assert.equal((await page.getToggleState('speedRamp')).text, 'On')
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.speedRampMode), 'true')

    await page.refresh()
    assert.equal((await page.getToggleState('continuous')).text, 'On')
    assert.equal((await page.getToggleState('speedRamp')).text, 'On')
  })

  it('speed ramp stays off after continuous was disabled, reloaded, and re-enabled', async () => {
    await page.clickSpeedRampToggle()
    await page.clickContinuousToggle()
    await page.refresh()

    await page.clickContinuousToggle()
    assert.equal(await page.isSpeedRampVisible(), true)
    assert.equal((await page.getToggleState('speedRamp')).text, 'Off')
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.speedRampMode), 'false')
  })
})
