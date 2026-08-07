import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { MESSAGES, NOTE_NAMES, TrainerPage } from '../pages/trainer.page.ts'

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

  it('shows the idle state and prompt with no note on display', async () => {
    assert.equal(await page.getCurrentNote(), null)
    assert.equal(await page.getNowPlayingState(), 'idle')
    assert.equal(await page.getPlaybackMessage(), MESSAGES.idle)
  })

  it('previews the upcoming note in the NEXT chip while idle', async () => {
    const next = await page.getNextNote()
    assert.ok(next !== null && NOTE_NAMES.has(next), `expected a valid NEXT note, got "${next}"`)
  })

  it('starts with default practice settings', async () => {
    assert.equal(await page.getBpm(), 72)
    assert.equal(await page.getSliderAttribute('min'), '30')
    assert.equal(await page.getSliderAttribute('max'), '240')
    // 12 notes x 4 beats at 72 BPM = 40s
    assert.equal(await page.getCycleTime(), '00:40')

    const continuous = await page.getSwitchState('continuous')
    assert.equal(continuous.checked, true)

    const speedRamp = await page.getSwitchState('speedRamp')
    assert.equal(speedRamp.checked, false)
    assert.equal(speedRamp.disabled, false)
  })

  it('starts with a zeroed timer and a Play button', async () => {
    assert.equal(await page.getTimer(), '00:00')
    assert.equal(await page.getPlayButtonText(), 'Start practice')
    assert.equal(await page.isPlayButtonPrimary(), true)
  })

  it('defaults to the dark theme', async () => {
    assert.equal(await page.getTheme(), 'dark')
  })
})
