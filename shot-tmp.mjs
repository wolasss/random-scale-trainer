import { writeFileSync } from 'node:fs'
import { Builder } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'

const [url, out, w, h] = process.argv.slice(2)
const width = Number(w), height = Number(h)

const options = new chrome.Options()
options.addArguments('--headless=new', '--disable-gpu', '--hide-scrollbars')

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options)
  .usingServer('http://localhost:4444').build()
try {
  await driver.manage().window().setRect({ width, height, x: 0, y: 0 })
  await driver.get(url)
  await driver.sleep(700)
  const inner = await driver.executeScript('return [document.documentElement.clientWidth, document.documentElement.clientHeight]')
  await driver.manage().window().setRect({
    width: width + (width - inner[0]), height: height + (height - inner[1]), x: 0, y: 0,
  })
  await driver.sleep(1200)
  const real = await driver.executeScript('return [document.documentElement.clientWidth, document.documentElement.clientHeight, document.documentElement.scrollWidth]')
  console.log(out, 'viewport', real[0] + 'x' + real[1], 'scrollWidth', real[2])
  writeFileSync(out, Buffer.from(await driver.takeScreenshot(), 'base64'))
} finally { await driver.quit() }
