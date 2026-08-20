import { after, before } from 'node:test'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver, type DriverOptions } from './driver.ts'
import { TrainerPage } from './pages/trainer.page.ts'

/**
 * Opens one browser session for the enclosing suite and closes it again after,
 * so a spec never has to re-derive the lifecycle — or leak a session by
 * forgetting the `after`.
 *
 * It hands back an accessor rather than the page itself: the driver is only
 * built once `before` runs, which is long after the suite body registered its
 * tests. So call `page()` inside a test or hook, never at describe scope.
 */
export const useTrainerSession = (options: DriverOptions = {}): (() => TrainerPage) => {
  let driver: WebDriver | undefined
  let page: TrainerPage | undefined

  before(async () => {
    driver = await buildDriver(options)
    page = new TrainerPage(driver)
  })

  after(async () => {
    await driver?.quit()
  })

  return () => {
    if (page === undefined) {
      throw new Error('the session opens in before() — only reachable inside a test/hook')
    }
    return page
  }
}
