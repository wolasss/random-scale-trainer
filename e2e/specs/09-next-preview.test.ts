import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { NOTE_NAMES, TrainerPage } from '../pages/trainer.page.ts'

// The strongest deck regression guard: the NEXT chip must always name the
// note that actually plays next. Default note-every (4 beats) at max BPM
// gives 1s per note — slow enough for the 100ms poll to never skip a note.
describe('NEXT preview', () => {
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
    await page.setBpmToMax()
  })

  it('the NEXT note becomes the current note on the following span', async () => {
    await page.clickPlayPause()
    await page.waitForNotePlaying()

    // Two attempts absorb the race where NEXT flips right after we read it.
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const next = await page.getNextNote()
      assert.ok(next !== null && NOTE_NAMES.has(next), `expected a valid NEXT note, got "${next}"`)
      try {
        await page.waitForCurrentNote(next, 3_000)
        return
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  })

  it('shows the position within the shuffled cycle', async () => {
    await page.clickPlayPause()
    await page.waitForNotePlaying()

    const position = await page.getCyclePosition()
    // Case-insensitive: the element renders in small caps via text-transform.
    assert.match(position ?? '', /^note ([1-9]|1[0-2]) of 12$/i)
  })
})
