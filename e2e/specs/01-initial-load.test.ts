import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { IDLE_NOTE, MESSAGES, TrainerPage } from '../pages/trainer.page.ts'

describe('initial load', () => {
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

  it('shows the idle note placeholder and prompt', async () => {
    assert.equal(await page.getCurrentNote(), IDLE_NOTE)
    assert.equal(await page.getNowPlayingState(), 'idle')
    assert.equal(await page.getPlaybackMessage(), MESSAGES.idle)
  })

  it('starts with default practice settings', async () => {
    assert.equal(await page.getBpm(), 30)
    assert.equal(await page.getSliderAttribute('min'), '10')
    assert.equal(await page.getSliderAttribute('max'), '100')
    assert.equal(await page.getCycleTime(), '00:24')

    const continuous = await page.getToggleState('continuous')
    assert.equal(continuous.text, 'On')
    assert.equal(continuous.enabled, true)

    assert.equal(await page.isSpeedRampVisible(), true)
    const speedRamp = await page.getToggleState('speedRamp')
    assert.equal(speedRamp.text, 'Off')
    assert.equal(speedRamp.enabled, false)
  })

  it('starts with a zeroed timer and a Play button', async () => {
    assert.equal(await page.getTimer(), '00:00')
    assert.equal(await page.getPlayButtonText(), 'Play')
    assert.equal(await page.isPlayButtonPrimary(), true)
  })

  it('defaults to the dark theme', async () => {
    assert.equal(await page.getTheme(), 'dark')
  })
})
