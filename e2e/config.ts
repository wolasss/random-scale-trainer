export const config = {
  /** Remote WebDriver endpoint of the Selenium standalone server. */
  seleniumUrl: process.env.SELENIUM_REMOTE_URL ?? 'http://localhost:4444',
  /**
   * URL of the app under test as seen FROM THE BROWSER running inside Selenium.
   * When Selenium runs in Docker and the app on the host, use
   * http://host.docker.internal:4173
   */
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:4173',
  browser: process.env.BROWSER ?? 'chrome',
  headless: process.env.HEADLESS === 'true',
}
