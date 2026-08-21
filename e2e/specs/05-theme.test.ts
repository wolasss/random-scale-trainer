import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEYS } from '../pages/trainer.page.ts'
import { useTrainerSession } from '../session.ts'

describe('theme toggle', () => {
  const page = useTrainerSession()

  beforeEach(async () => {
    await page().openFresh()
  })

  it('switches to light mode and stores the choice', async () => {
    await page().clickThemeToggle()

    assert.equal(await page().getTheme(), 'light')
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.theme), 'light')
    assert.equal(await page().getThemeToggleLabel(), 'Switch to dark mode')
  })

  it('keeps the light theme after a reload', async () => {
    await page().clickThemeToggle()
    await page().refresh()
    assert.equal(await page().getTheme(), 'light')
  })

  it('switches back to dark mode', async () => {
    await page().clickThemeToggle()
    await page().clickThemeToggle()

    assert.equal(await page().getTheme(), 'dark')
    assert.equal(await page().getLocalStorage(STORAGE_KEYS.theme), 'dark')
    assert.equal(await page().getThemeToggleLabel(), 'Switch to light mode')
  })
})
