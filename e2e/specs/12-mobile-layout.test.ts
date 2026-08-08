import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { OVERFLOW_ROOTS, type Overflow, TrainerPage } from '../pages/trainer.page.ts'

/**
 * A guard against controls growing wider than the phone they run on.
 *
 * Nothing here is about a specific control. A row of pills, a select sized to
 * its longest option, a button row that will not wrap — any of them can end up
 * wider than the screen, and the damage is never confined to the offender: the
 * scroll container it sits in starts scrolling sideways and takes every
 * sibling with it. So rather than assert on the controls that have gone wrong
 * before, this walks the whole tree and fails on anything past the edge.
 *
 * Widths are chosen for the breakpoints they land either side of: 320 is below
 * the 359px tempo-row break and the narrowest phone worth supporting, 390 is
 * the common iPhone, and 430 the largest, both inside the 640px mobile block.
 */
const WIDTHS = [320, 390, 430]

/** Each emulated width needs its own session: device metrics are fixed at launch. */
const withMobileDriver = async (
  width: number,
  standalone: boolean,
  run: (page: TrainerPage) => Promise<void>,
): Promise<void> => {
  let driver: WebDriver | undefined
  try {
    driver = await buildDriver({ mobileWidth: width, standalone })
    const page = new TrainerPage(driver)
    await page.openFresh()
    await run(page)
  } finally {
    await driver?.quit()
  }
}

const describeOverflow = (where: string, width: number, overflow: Overflow): string => {
  const worst = overflow.offenders.map(({ label, over }) => `${label} (+${over}px)`).join(', ')
  return `${where} scrolls sideways at ${width}px — over the edge: ${worst || 'none identified'}`
}

const assertNoOverflow = (where: string, width: number, overflow: Overflow): void => {
  assert.deepEqual(overflow.offenders, [], describeOverflow(where, width, overflow))
  assert.equal(overflow.scrollOverhang, 0, describeOverflow(where, width, overflow))
}

// Unlike the rest of the suite this spec owns no shared session: every width is
// a separate browser, opened and quit inside the test that needs it.
describe('mobile layout', () => {
  for (const width of WIDTHS) {
    it(`fits the page in a ${width}px browser window`, async () => {
      await withMobileDriver(width, false, async (page) => {
        assert.equal(await page.getViewportWidth(), width)
        assertNoOverflow('the page', width, await page.measureOverflow(OVERFLOW_ROOTS.page))
      })
    })

    it(`fits the practice sheet on a ${width}px installed app`, async () => {
      await withMobileDriver(width, true, async (page) => {
        assert.equal(await page.getViewportWidth(), width)
        // Guards the emulation itself: without display-mode standalone AND a
        // coarse pointer the app never swaps layouts, and the sheet — where
        // every setting lives once it does — would not exist to measure.
        assert.ok(await page.isStageLayout(), 'expected the standalone stage layout')

        assertNoOverflow('the stage', width, await page.measureOverflow(OVERFLOW_ROOTS.page))

        await page.openSetupSheet()
        assertNoOverflow('the practice sheet', width, await page.measureOverflow(OVERFLOW_ROOTS.sheet))
      })
    })
  }
})
