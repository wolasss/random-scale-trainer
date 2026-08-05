import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { STORAGE_KEYS, TrainerPage } from '../pages/trainer.page.ts'

// Accidentals-only pool makes every called note carry an accidental, so the
// spelling assertions get maximum signal. Mixed mode is deliberately not
// asserted here (its per-call coin flip is covered by unit tests).
describe('enharmonic spelling', () => {
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
    await page.selectPreset('accidentals')
    await page.setBpmToMax()
  })

  it('flats mode spells every accidental with ♭', async () => {
    await page.setSpelling('flat')
    await page.clickPlayPause()

    const notes = await page.collectDistinctNotes(4, 15_000)
    for (const note of notes) {
      assert.match(note, /^[A-G]♭$/, `expected a flat spelling, got "${note}"`)
    }
  })

  it('sharps mode spells every accidental with ♯', async () => {
    await page.setSpelling('sharp')
    await page.clickPlayPause()

    const notes = await page.collectDistinctNotes(4, 15_000)
    for (const note of notes) {
      assert.match(note, /^[A-G]♯$/, `expected a sharp spelling, got "${note}"`)
    }
  })

  it('chip labels follow the selected spelling', async () => {
    assert.equal(await page.getChipLabel(1), 'D♭') // mixed default → flat labels
    await page.setSpelling('sharp')
    assert.equal(await page.getChipLabel(1), 'C♯')
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.spelling), 'sharp')
  })
})
