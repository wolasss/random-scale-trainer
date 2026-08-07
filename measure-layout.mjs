import { Builder } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'

const url = process.argv[2]
const widths = process.argv.slice(3).map(Number)

const options = new chrome.Options()
options.addArguments('--headless=new', '--disable-gpu', '--hide-scrollbars')

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options)
  .usingServer('http://localhost:4444').build()

try {
  for (const width of widths) {
    const height = 1000
    await driver.manage().window().setRect({ width, height, x: 0, y: 0 })
    await driver.get(url)
    await driver.sleep(900)
    const inner = await driver.executeScript('return [document.documentElement.clientWidth, document.documentElement.clientHeight]')
    if (inner[0] !== width) {
      await driver.manage().window().setRect({ width: width + (width - inner[0]), height: height + (height - inner[1]), x: 0, y: 0 })
      await driver.sleep(600)
    }

    const report = await driver.executeScript(`
      const round = (n) => Math.round(n)
      const label = (el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : '')
      const rows = []
      const describe = (container, name) => {
        const kids = [...container.children].map((el) => {
          const r = el.getBoundingClientRect()
          // How much of a stretched card is empty below its last child: the
          // tell-tale of content sitting in the wrong column.
          let contentBottom = r.top
          for (const c of el.querySelectorAll('*')) {
            const cr = c.getBoundingClientRect()
            if (cr.height > 0) contentBottom = Math.max(contentBottom, cr.bottom)
          }
          const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0
          return {
            el: label(el), top: round(r.top), left: round(r.left), w: round(r.width), h: round(r.height),
            slack: round(r.bottom - contentBottom - pad),
          }
        })
        // group by visual row (same top within 4px)
        const groups = []
        for (const k of kids) {
          const g = groups.find((g) => Math.abs(g.top - k.top) < 4)
          if (g) g.items.push(k)
          else groups.push({ top: k.top, items: [k] })
        }
        rows.push({ container: name, groups })
      }
      describe(document.querySelector('.app-grid'), '.app-grid')
      document.querySelectorAll('.card-row').forEach((el, i) => describe(el, '.card-row[' + i + ']'))
      const view = document.querySelector('.practice-stage-view')
      if (view) describe(view, '.practice-stage-view')

      const vw = document.documentElement.clientWidth
      const offenders = []
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0) continue
        if (r.right > vw + 1 || r.left < -1) offenders.push({ el: label(el), left: round(r.left), right: round(r.right) })
      }
      return { vw, scrollWidth: document.documentElement.scrollWidth, rows, offenders: offenders.slice(0, 8) }
    `)

    console.log('\\n===== viewport ' + report.vw + ' (scrollWidth ' + report.scrollWidth + ') =====')
    for (const r of report.rows) {
      console.log('  ' + r.container)
      for (const g of r.groups) {
        const heights = g.items.map((i) => i.h)
        const spread = Math.max(...heights) - Math.min(...heights)
        const flag = g.items.length > 1 && spread > 150 ? '  <-- SPREAD ' + spread : ''
        console.log('    row top=' + g.top + flag)
        for (const i of g.items) console.log('      ' + i.el.slice(0, 60).padEnd(62) + ' w=' + String(i.w).padStart(5) + ' h=' + String(i.h).padStart(5) + ' empty=' + String(i.slack).padStart(5))
      }
    }
    if (report.offenders.length) console.log('  OVERFLOW:', JSON.stringify(report.offenders))
  }
} finally {
  await driver.quit()
}
