import { writeFileSync } from 'node:fs'
import { Builder, By } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
const [out, w, h] = process.argv.slice(2)
const width = Number(w), height = Number(h)
const options = new chrome.Options()
options.addArguments('--headless=new','--disable-gpu','--hide-scrollbars')
const d = await new Builder().forBrowser('chrome').setChromeOptions(options).usingServer('http://localhost:4444').build()
try {
  await d.manage().window().setRect({ width, height, x: 0, y: 0 })
  await d.get('http://host.docker.internal:4173')
  await d.sleep(900)
  const inner = await d.executeScript('return [document.documentElement.clientWidth, document.documentElement.clientHeight]')
  await d.manage().window().setRect({ width: width + (width - inner[0]), height: height + (height - inner[1]), x: 0, y: 0 })
  await d.sleep(600)
  // Pick a multi-block routine so the strip has something to say.
  await d.executeScript(`
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Neck fluency'))
    btn.click()
  `)
  await d.sleep(500)
  const strip = await d.executeScript(`
    const s = document.querySelector('.routine-strip')
    if (!s) return null
    const r = s.getBoundingClientRect(); const p = s.parentElement
    const pr = p.getBoundingClientRect()
    return { parent: p.className, left: Math.round(r.left - pr.left), width: Math.round(r.width), parentWidth: Math.round(pr.width), text: s.textContent }
  `)
  console.log(JSON.stringify(strip))
  writeFileSync(out, Buffer.from(await d.takeScreenshot(), 'base64'))
} finally { await d.quit() }
