import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { STORAGE_KEYS, TrainerPage } from '../pages/trainer.page.ts'

describe('note pool', () => {
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

  it('toggling a chip flips the preset to Custom and updates the live count', async () => {
    assert.equal(await page.getPresetValue(), 'all')
    assert.match(await page.getPoolGuarantee(), /you get all 12 before any repeats/)

    await page.toggleChip(1)
    assert.equal(await page.getPresetValue(), 'custom')
    assert.equal(await page.isChipSelected(1), false)
    assert.match(await page.getPoolGuarantee(), /you get all 11 before any repeats/)
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.notePool), '0,2,3,4,5,6,7,8,9,10,11')
  })

  it('never allows an empty pool — the last note stays selected', async () => {
    await page.selectPreset('a-minor-pentatonic') // pcs 0, 2, 4, 7, 9
    for (const pc of [0, 2, 4, 7]) {
      await page.toggleChip(pc)
    }
    assert.match(await page.getPoolGuarantee(), /you get all 1 before any repeats/)

    await page.toggleChip(9)
    assert.equal(await page.isChipSelected(9), true)
    assert.match(await page.getPoolGuarantee(), /you get all 1 before any repeats/)
  })

  it('presets apply to the chips and persist across a reload', async () => {
    await page.selectPreset('naturals')
    assert.equal(await page.isChipSelected(0), true)
    assert.equal(await page.isChipSelected(1), false)
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.notePool), '0,2,4,5,7,9,11')

    await page.refresh()
    assert.equal(await page.getPresetValue(), 'naturals')
    assert.match(await page.getPoolGuarantee(), /you get all 7 before any repeats/)
  })

  it('deselected notes are never called', async () => {
    await page.seedStorageAndReload(STORAGE_KEYS.beatsPerNote, '1')
    await page.selectPreset('naturals')
    await page.setBpmToMax()

    await page.clickPlayPause()
    const notes = await page.collectDistinctNotes(5, 15_000)
    for (const note of notes) {
      assert.match(note, /^[A-G]$/, `accidental "${note}" called from a naturals-only pool`)
    }
  })
})
