/**
 * The only socket the scoreboard opens. Everything it decides lives in
 * scoreboard.js and session-scoring.js; http.js reads a request off the wire and
 * writes the answer back. This file is the process: a port, a data path, and a
 * listen.
 *
 * In the container nginx proxies /api/ here (see nginx.conf) and starts it from
 * /docker-entrypoint.d/50-scoreboard.sh, so the published image still runs with
 * `docker run -p 8080:80` and nothing else. In dev and preview the same handler
 * is mounted as a Vite middleware instead — see vite.config.ts.
 *
 *   SCOREBOARD_DATA  where to keep the board between restarts; unset means
 *                    memory only, and a restart loses it
 *
 * The same process answers "report a bug", which needs a captcha to check and
 * somewhere to send the report. Both are environment, and both are optional:
 * with any of them unset the route answers "not configured" and the app —
 * which asks before it renders a form — says reporting is not set up here.
 *
 *   TURNSTILE_SITE_KEY    the public half of the Cloudflare Turnstile pair
 *   TURNSTILE_SECRET_KEY  the half that never leaves this process
 *   MAILGUN_API_KEY       likewise
 *   MAILGUN_DOMAIN        the Mailgun sending domain
 *   MAILGUN_API_BASE      optional; the EU region needs api.eu.mailgun.net
 *   BUG_REPORT_TO/FROM    optional; default to bugs@$MAILGUN_DOMAIN
 */
import { createBugReportHandler, createMailgunSender, createTurnstileVerifier } from './bug-report.js'
import { createScoreboardServer } from './http.js'
import { createStore, readSnapshot } from './scoreboard.js'

/**
 * Deliberately a constant and not an environment variable: nginx.conf proxies
 * /api/ to this exact port on loopback, and the two have no way to agree at run
 * time. A knob that moved one without the other would only ever produce 502s.
 */
const PORT = 8787
const DATA_PATH = process.env.SCOREBOARD_DATA ?? ''

const store = DATA_PATH === '' ? createStore() : readSnapshot(DATA_PATH)

const bugReport = createBugReportHandler({
  sendMail: createMailgunSender(process.env),
  verifyCaptcha: createTurnstileVerifier(process.env),
  siteKey: process.env.TURNSTILE_SITE_KEY ?? '',
})

createScoreboardServer({ store, dataPath: DATA_PATH, bugReport }).listen(PORT, '127.0.0.1', () => {
  console.log(`scoreboard listening on 127.0.0.1:${PORT}`)
})
