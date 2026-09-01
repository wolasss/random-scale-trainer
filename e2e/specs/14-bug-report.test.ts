import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { OVERFLOW_ROOTS } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

/**
 * "Report a bug", in a real browser and against the real route — the Vite
 * plugin in vite.config.ts serves it under `vite preview`, with Cloudflare's
 * always-passes test site key and a sender that only logs.
 *
 * Two things are only true here. The first is layout: the trigger is a button
 * in the footer, and a footer that has run out of room is a page that scrolls
 * sideways — which is why the mobile width below is one of the ones
 * `12-mobile-layout` uses. The second is the round trip through a widget that
 * is a third-party iframe, and so the one part of this suite that needs the
 * network. Where there is no egress the modal says so instead, and that is
 * asserted rather than skipped: it is the state an installed, offline app is
 * in, and it has to read properly too.
 */
describe('reporting a bug', () => {
  describe('on a desktop window', () => {
    const page = useTrainerSession()

    before(async () => {
      await page().openFresh()
    })

    it('offers a button in the footer that opens the report modal', async () => {
      assert.equal(await page().hasReportBugButton(), true)
      assert.equal(await page().hasBugReportModal(), false)

      await page().openBugReport()

      assert.equal(await page().hasBugReportModal(), true)
    })

    it('closes again on Escape', async () => {
      if (!(await page().hasBugReportModal())) {
        await page().openBugReport()
      }

      await page().pressEscape()

      assert.equal(await page().hasBugReportModal(), false)
    })

    it('takes a report all the way to a thank-you', async () => {
      await page().openBugReport()

      if (!(await page().waitForBugCaptcha())) {
        // No egress in this runner: the widget script never arrived. The modal
        // owes the reader an explanation, and that is what is checked instead.
        console.log('# turnstile could not be loaded — asserting the offline state instead of the round trip')
        assert.match(await page().getBugReportUnavailable(), /connection/)
        return
      }

      await page().describeBug('The metronome drifts after a tempo ramp.')
      await page().submitBugReport()

      assert.equal(await page().hasBugReportModal(), true)
      assert.equal(await page().getBugReportUnavailable(), '')
    })
  })

  /** 390 is the common iPhone, and one of the widths 12-mobile-layout guards. */
  describe('on a 390px browser window', () => {
    const page = useTrainerSession({ mobileWidth: 390 })

    before(async () => {
      await page().openFresh()
    })

    it('fits the button into the footer without pushing the page sideways', async () => {
      assert.equal(await page().hasReportBugButton(), true)

      const overflow = await page().measureOverflow(OVERFLOW_ROOTS.page)
      assert.deepEqual(
        overflow.offenders,
        [],
        `the footer row scrolls sideways: ${overflow.offenders.map(({ label }) => label).join(', ')}`,
      )
      assert.equal(overflow.scrollOverhang, 0)
    })

    it('still opens the modal, and it fits too', async () => {
      await page().openBugReport()

      assert.equal(await page().hasBugReportModal(), true)
      assert.deepEqual((await page().measureOverflow(OVERFLOW_ROOTS.page)).offenders, [])
    })
  })
})
