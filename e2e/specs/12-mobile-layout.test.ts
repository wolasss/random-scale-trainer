import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { OVERFLOW_ROOTS, STORAGE_KEYS, type Overflow } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

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

const describeOverflow = (where: string, width: number, overflow: Overflow): string => {
  const worst = overflow.offenders.map(({ label, over }) => `${label} (+${over}px)`).join(', ')
  return `${where} scrolls sideways at ${width}px — over the edge: ${worst || 'none identified'}`
}

const assertNoOverflow = (where: string, width: number, overflow: Overflow): void => {
  assert.deepEqual(overflow.offenders, [], describeOverflow(where, width, overflow))
  assert.equal(overflow.scrollOverhang, 0, describeOverflow(where, width, overflow))
}

// Unlike the rest of the suite this spec takes a session per width rather than
// one for the file: device metrics are fixed at launch. Suites run serially, so
// only ever one of them is open at a time.
describe('mobile layout', () => {
  for (const width of WIDTHS) {
    describe(`a ${width}px browser window`, () => {
      const page = useTrainerSession({ mobileWidth: width })

      beforeEach(async () => {
        await page().openFresh()
      })

      it(`fits the page in a ${width}px browser window`, async () => {
        assert.equal(await page().getViewportWidth(), width)
        assertNoOverflow('the page', width, await page().measureOverflow(OVERFLOW_ROOTS.page))
      })
    })

    describe(`a ${width}px installed app`, () => {
      // The mic readout — and the score row it can grow — only mounts once mic
      // listening is on, and a real hit needs a real microphone. fakeMedia
      // answers getUserMedia with a synthetic device so listening can start.
      const page = useTrainerSession({ mobileWidth: width, standalone: true, fakeMedia: true })

      beforeEach(async () => {
        await page().openFresh()
      })

      it(`fits the practice sheet on a ${width}px installed app`, async () => {
        assert.equal(await page().getViewportWidth(), width)
        // Guards the emulation itself: without display-mode standalone AND a
        // coarse pointer the app never swaps layouts, and the sheet — where
        // every setting lives once it does — would not exist to measure.
        assert.ok(await page().isStageLayout(), 'expected the standalone stage layout')

        assertNoOverflow('the stage', width, await page().measureOverflow(OVERFLOW_ROOTS.page))

        await page().openSetupSheet()
        assertNoOverflow('the practice sheet', width, await page().measureOverflow(OVERFLOW_ROOTS.sheet))
      })

      it(`fits the stage with a scored mic readout on a ${width}px installed app`, async () => {
        await page().seedStorageAndReload(STORAGE_KEYS.micListen, 'true')
        assert.ok(await page().hasMicReadout(), 'expected the mic readout to be on the stage')

        await page().clickPlayPause()
        await page().waitForScoreRow()

        assertNoOverflow('the stage with a score', width, await page().measureOverflow(OVERFLOW_ROOTS.page))
      })
    })
  }
})
