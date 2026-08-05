import { Builder, type WebDriver } from 'selenium-webdriver'
import { Options as ChromeOptions } from 'selenium-webdriver/chrome.js'
import { config } from './config.ts'

export const buildDriver = async (): Promise<WebDriver> => {
  const builder = new Builder().usingServer(config.seleniumUrl).forBrowser(config.browser)

  // 'chromium' covers ARM images like seleniarm/standalone-chromium
  if (config.browser === 'chrome' || config.browser === 'chromium') {
    const options = new ChromeOptions()
    if (config.browser === 'chromium') {
      options.setBrowserName('chromium')
    }
    options.addArguments(
      // AudioContext must never wait for a user gesture, otherwise playback stalls
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--window-size=1366,900',
      '--disable-dev-shm-usage',
    )

    if (config.headless) {
      options.addArguments('--headless=new')
    }

    builder.setChromeOptions(options)
  }

  return builder.build()
}
