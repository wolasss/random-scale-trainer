import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEYS } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

describe('continuous and speed ramp switches', () => {
  const page = useTrainerSession()

  beforeEach(async () => {
    await page().openFresh()
  })

  it('disabling continuous mode disables speed ramp and forces it off', async () => {
    await page().clickContinuousToggle()

    const continuous = await page().getSwitchState('continuous')
    assert.equal(continuous.checked, false)

    const speedRamp = await page().getSwitchState('speedRamp')
    assert.equal(speedRamp.checked, false)
    assert.equal(speedRamp.disabled, true)
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.continuousMode), 'false')
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.speedRampMode), 'false')
  })

  it('re-enabling continuous mode re-enables the speed ramp switch, still off', async () => {
    await page().clickContinuousToggle()
    await page().clickContinuousToggle()

    const speedRamp = await page().getSwitchState('speedRamp')
    assert.equal(speedRamp.checked, false)
    assert.equal(speedRamp.disabled, false)
  })

  it('speed ramp can be enabled and both settings survive a reload', async () => {
    await page().clickSpeedRampToggle()
    assert.equal((await page().getSwitchState('speedRamp')).checked, true)
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.speedRampMode), 'true')

    await page().refresh()
    assert.equal((await page().getSwitchState('continuous')).checked, true)
    assert.equal((await page().getSwitchState('speedRamp')).checked, true)
  })

  it('reveals the climb-to target with the ramp, and remembers where it was set', async () => {
    assert.equal(await page().hasRampTarget(), false)

    await page().clickSpeedRampToggle()
    assert.equal(await page().hasRampTarget(), true)
    assert.equal(await page().getRampTarget(), 112)
    assert.equal(await page().getRampHelper(), '20 rounds from 72, then it holds.')

    await page().clickRampTargetUp()
    assert.equal(await page().getRampTarget(), 117)
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.rampTarget), '117')

    await page().refresh()
    assert.equal(await page().getRampTarget(), 117)
  })

  /** A ceiling below the tempo already reached is not a goal to climb to. */
  it('floors the target one climb above the current tempo', async () => {
    await page().clickSpeedRampToggle()

    for (let step = 0; step < 12; step++) {
      await page().clickRampTargetDown()
    }

    assert.equal(await page().getRampTarget(), 74)
    assert.equal(await page().getRampHelper(), '1 round from 72, then it holds.')
  })

  it('speed ramp stays off after continuous was disabled, reloaded, and re-enabled', async () => {
    await page().clickSpeedRampToggle()
    await page().clickContinuousToggle()
    await page().refresh()

    await page().clickContinuousToggle()
    const speedRamp = await page().getSwitchState('speedRamp')
    assert.equal(speedRamp.checked, false)
    assert.equal(speedRamp.disabled, false)
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.speedRampMode), 'false')
  })
})

describe('note order', () => {
  const page = useTrainerSession()
  const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

  beforeEach(async () => {
    await page().openFresh()
  })

  it('remembers Fourths across a reload and lists the notes round the circle', async () => {
    assert.equal(await page().getNoteOrder(), 'shuffled')

    await page().setSpelling('flat')
    await page().setNoteOrder('fourths')
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.noteOrder), 'fourths')

    await page().seedStorageAndReload(STORAGE_KEYS.noteList, 'true')
    assert.equal(await page().getNoteOrder(), 'fourths')

    // The start is random, so check the steps: each next note a fourth up.
    const pcs = (await page().getNoteListNames()).map((name) => FLAT_NAMES.indexOf(name))
    assert.equal(pcs.length, 12)
    for (let index = 1; index < pcs.length; index++) {
      assert.equal(pcs[index], (pcs[index - 1] + 5) % 12)
    }
  })
})
