import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { STORAGE_KEYS, TrainerPage } from '../pages/trainer.page.ts'

describe('continuous and speed ramp switches', () => {
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

  it('disabling continuous mode disables speed ramp and forces it off', async () => {
    await page.clickContinuousToggle()

    const continuous = await page.getSwitchState('continuous')
    assert.equal(continuous.checked, false)

    const speedRamp = await page.getSwitchState('speedRamp')
    assert.equal(speedRamp.checked, false)
    assert.equal(speedRamp.disabled, true)
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.continuousMode), 'false')
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.speedRampMode), 'false')
  })

  it('re-enabling continuous mode re-enables the speed ramp switch, still off', async () => {
    await page.clickContinuousToggle()
    await page.clickContinuousToggle()

    const speedRamp = await page.getSwitchState('speedRamp')
    assert.equal(speedRamp.checked, false)
    assert.equal(speedRamp.disabled, false)
  })

  it('speed ramp can be enabled and both settings survive a reload', async () => {
    await page.clickSpeedRampToggle()
    assert.equal((await page.getSwitchState('speedRamp')).checked, true)
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.speedRampMode), 'true')

    await page.refresh()
    assert.equal((await page.getSwitchState('continuous')).checked, true)
    assert.equal((await page.getSwitchState('speedRamp')).checked, true)
  })

  it('speed ramp stays off after continuous was disabled, reloaded, and re-enabled', async () => {
    await page.clickSpeedRampToggle()
    await page.clickContinuousToggle()
    await page.refresh()

    await page.clickContinuousToggle()
    const speedRamp = await page.getSwitchState('speedRamp')
    assert.equal(speedRamp.checked, false)
    assert.equal(speedRamp.disabled, false)
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.speedRampMode), 'false')
  })
})
