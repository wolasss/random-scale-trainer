import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MESSAGES, NOTE_NAMES } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

describe('initial load', () => {
  const page = useTrainerSession()

  beforeEach(async () => {
    await page().openFresh()
  })

  it('shows the idle state and prompt with no note on display', async () => {
    assert.equal(await page().getCurrentNote(), null)
    assert.equal(await page().getNowPlayingState(), 'idle')
    assert.equal(await page().getPlaybackMessage(), MESSAGES.idle)
  })

  it('previews the upcoming note in the NEXT chip while idle', async () => {
    const next = await page().getNextNote()
    assert.ok(next !== null && NOTE_NAMES.has(next), `expected a valid NEXT note, got "${next}"`)
  })

  it('starts with default practice settings', async () => {
    assert.equal(await page().getBpm(), 72)
    assert.equal(await page().getSliderAttribute('min'), '30')
    assert.equal(await page().getSliderAttribute('max'), '240')
    // 12 notes x 4 beats at 72 BPM = 40s
    assert.equal(await page().getCycleTime(), '00:40')

    const continuous = await page().getSwitchState('continuous')
    assert.equal(continuous.checked, true)

    const speedRamp = await page().getSwitchState('speedRamp')
    assert.equal(speedRamp.checked, false)
    assert.equal(speedRamp.disabled, false)
  })

  it('starts with a zeroed timer and a Play button', async () => {
    assert.equal(await page().getTimer(), '00:00')
    assert.equal(await page().getPlayButtonText(), 'Start practice')
    assert.equal(await page().isPlayButtonPrimary(), true)
  })

  it('defaults to the dark theme', async () => {
    assert.equal(await page().getTheme(), 'dark')
  })

  /**
   * The only spec that takes the app as an actual first-time visitor gets it —
   * every other one seeds the fold open, because they are about what it hides.
   */
  describe('a genuinely first run', () => {
    beforeEach(async () => {
      await page().openFirstRun()
    })

    it('folds the setup away behind a single row', async () => {
      assert.equal(await page().hasSetupReveal(), true)
      assert.equal(await page().hasSetupCards(), false)
      // The stage is fully playable while folded — that is the whole argument.
      // And a zeroed transport is only the start button: reset and the goal
      // readout wait until there is something on the clock.
      assert.equal(await page().getPlayButtonText(), 'Start practice')
      assert.equal(await page().hasResetControl(), false)
      assert.equal(await page().hasTransportReadout(), false)
    })

    it('opens the setup on the fold, and stays open across a reload', async () => {
      await page().openSetupFold()
      assert.equal(await page().hasSetupReveal(), false)

      await page().refresh()
      assert.equal(await page().hasSetupCards(), true)
      assert.equal(await page().hasSetupReveal(), false)
    })

    it('opens the setup on the first start press', async () => {
      await page().clickPlayPause()
      assert.equal(await page().hasSetupCards(), true)
      assert.equal(await page().hasSetupReveal(), false)
    })
  })
})
