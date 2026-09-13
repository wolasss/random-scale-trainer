import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { OVERFLOW_ROOTS, STORAGE_KEYS } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

describe('Kwinta skin visual contracts', () => {
  const page = useTrainerSession()

  beforeEach(async () => {
    await page().openFresh()
    await page().seedStorageAndReload(STORAGE_KEYS.skin, 'kwinta')
  })

  it('uses the asymmetric desktop field and the two Kwinta type roles', async () => {
    assert.equal(await page().getComputedStyle('.practice-stage', 'background-color'), 'rgb(4, 9, 16)')
    assert.equal(await page().getComputedStyle('.practice-stage', 'border-top-left-radius'), '76px')
    assert.equal(await page().getComputedStyle('.practice-stage', 'border-top-right-radius'), '18px')
    assert.equal(await page().getComputedStyle('.practice-stage', 'border-bottom-right-radius'), '76px')
    assert.equal(await page().getComputedStyle('.practice-stage', 'border-bottom-left-radius'), '18px')
    assert.match(await page().getComputedStyle('.hero-note, .hero-ghost-note', 'font-family'), /Hanken Grotesk/)
    assert.match(await page().getComputedStyle('.tempo-readout output', 'font-family'), /Spline Sans Mono/)
  })

  it('renders a flat checked switch with a contrasting knob', async () => {
    await page().clickContinuousToggle()

    assert.equal(await page().getComputedStyle('#continuous-mode', 'background-image'), 'none')
    assert.equal(await page().getComputedStyle('#continuous-mode', 'background-color'), 'rgb(212, 219, 64)')
    assert.equal(await page().getComputedStyle('#continuous-mode .switch-knob', 'background-color'), 'rgb(12, 12, 0)')
  })

  it('keeps the light call dot identical to the primary action', async () => {
    await page().clickThemeToggle()

    const action = await page().getComputedStyle('[data-testid="play-toggle"]', 'background-color')
    assert.equal(await page().getComputedStyle('.brand-dot-call', 'background-color'), action)
    assert.notEqual(await page().getComputedStyle('.brand-dot-call', 'box-shadow'), 'none')
  })
})

for (const width of [320, 375, 414, 768]) {
  describe(`Kwinta skin at ${width}px`, () => {
    const page = useTrainerSession({ mobileWidth: width })

    beforeEach(async () => {
      await page().openFresh()
      await page().seedStorageAndReload(STORAGE_KEYS.skin, 'kwinta')
    })

    it('opens the practice field into the compact layout without overflow', async () => {
      assert.equal(await page().getViewportWidth(), width)
      assert.equal(await page().getComputedStyle('.practice-stage', 'background-color'), 'rgba(0, 0, 0, 0)')
      assert.equal(await page().getComputedStyle('.practice-stage', 'border-top-left-radius'), '0px')
      assert.equal((await page().measureOverflow(OVERFLOW_ROOTS.page)).scrollOverhang, 0)
    })
  })
}
