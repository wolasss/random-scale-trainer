import { Builder, type WebDriver } from 'selenium-webdriver'
import { Options as ChromeOptions } from 'selenium-webdriver/chrome.js'
import { config } from './config.ts'

export type DriverOptions = {
  /**
   * Emulate a phone at this CSS width. Mobile emulation is what makes
   * `(pointer: coarse)` match, and it pins the viewport exactly — a plain
   * --window-size is the outer window, browser chrome included, so it lands
   * tens of pixels away from the width you asked for.
   */
  mobileWidth?: number
  /**
   * Launch in app mode, which is the only way `(display-mode: standalone)`
   * matches. With mobileWidth it reproduces the home-screen PWA: the app
   * swaps to the stage layout and hides setup behind the sheet.
   */
  standalone?: boolean
  /**
   * Answer getUserMedia with a synthetic device and no permission dialog. A
   * shared challenge asks for the microphone the moment it loads, and a
   * headless browser has neither a microphone nor anybody to click "Allow".
   */
  fakeMedia?: boolean
}

/** Tall enough that the stage layout is never squeezed vertically. */
const MOBILE_HEIGHT = 844

type DeviceMetrics = { deviceMetrics: { width: number; height: number; pixelRatio: number } }

/**
 * @types/selenium-webdriver only admits the {deviceName} and flat
 * {width, height, pixelRatio} forms, but ChromeDriver ignores the flat one —
 * it wants the {deviceMetrics} wrapper that the very same docblock shows in
 * its second example. The method assigns whatever it is given straight onto
 * the capability, so the shape below is what actually reaches the browser.
 */
const emulateDevice = (options: ChromeOptions, metrics: DeviceMetrics): void => {
  const setMobileEmulation = options.setMobileEmulation.bind(options) as unknown as (
    config: DeviceMetrics,
  ) => void
  setMobileEmulation(metrics)
}

export const buildDriver = async (options: DriverOptions = {}): Promise<WebDriver> => {
  const builder = new Builder().usingServer(config.seleniumUrl).forBrowser(config.browser)

  // 'chromium' covers ARM images like seleniarm/standalone-chromium
  if (config.browser === 'chrome' || config.browser === 'chromium') {
    const chromeOptions = new ChromeOptions()
    if (config.browser === 'chromium') {
      chromeOptions.setBrowserName('chromium')
    }
    chromeOptions.addArguments(
      // AudioContext must never wait for a user gesture, otherwise playback stalls
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--disable-dev-shm-usage',
    )

    if (options.fakeMedia === true) {
      chromeOptions.addArguments(
        '--use-fake-device-for-media-capture',
        '--use-fake-ui-for-media-stream',
      )
    }

    if (options.standalone === true) {
      chromeOptions.addArguments(`--app=${config.appBaseUrl}`)
    }

    if (options.mobileWidth === undefined) {
      chromeOptions.addArguments('--window-size=1366,900')
    } else {
      emulateDevice(chromeOptions, {
        deviceMetrics: { width: options.mobileWidth, height: MOBILE_HEIGHT, pixelRatio: 3 },
      })
    }

    if (config.headless) {
      chromeOptions.addArguments('--headless=new')
    }

    builder.setChromeOptions(chromeOptions)
  }

  return builder.build()
}
