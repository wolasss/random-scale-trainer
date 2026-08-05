import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { STORAGE_KEYS, TrainerPage } from '../pages/trainer.page.ts'

describe('theme toggle', () => {
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

  it('switches to light mode and stores the choice', async () => {
    await page.clickThemeToggle()

    assert.equal(await page.getTheme(), 'light')
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.theme), 'light')
    assert.equal(await page.getThemeToggleLabel(), 'Switch to dark mode')
  })

  it('keeps the light theme after a reload', async () => {
    await page.clickThemeToggle()
    await page.refresh()
    assert.equal(await page.getTheme(), 'light')
  })

  it('switches back to dark mode', async () => {
    await page.clickThemeToggle()
    await page.clickThemeToggle()

    assert.equal(await page.getTheme(), 'dark')
    assert.equal(await page.getLocalStorage(STORAGE_KEYS.theme), 'dark')
    assert.equal(await page.getThemeToggleLabel(), 'Switch to light mode')
  })
})
