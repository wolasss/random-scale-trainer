/**
 * "Report a bug" — the second thing behind /api/ that is not a static file.
 *
 * The shape is deliberately the scoreboard's: pure decisions over injected
 * effects, so the two things this route depends on and cannot have in a test —
 * a captcha the caller solved and a mail provider that will take the report —
 * arrive as functions. `main.js` builds the real ones out of the environment;
 * `vite.config.ts` builds fixtures; the tests build fakes.
 *
 * Two rules carry most of the weight here:
 *
 * - **The bucket is taken before the captcha is checked.** Verifying a token
 *   is a round trip to Cloudflare, so a caller hammering wrong tokens would
 *   otherwise cost nothing to send and a request each to answer. Failing the
 *   captcha spends the same allowance as passing it.
 * - **Nothing awaited here may reject.** This module is awaited inside the
 *   `node:http` callback that also serves the scoreboard: an escaping rejection
 *   is an unhandled rejection, and an unhandled rejection is the whole process.
 *   So every external call is wrapped, in the handler *and* in the factories.
 *
 * Nothing in here logs a key, an address or a word of a report.
 */

/** Mounted by nginx in the container and by a Vite middleware in dev/preview. */
export const BUG_REPORT_PREFIX = '/api/bug-report'

/**
 * Bigger than the scoreboard's 4096, and for one reason: a Turnstile token runs
 * to a couple of kilobytes on its own, and a thousand characters of description
 * on top of that would not fit under the scoreboard's cap. Still inside the 8k
 * nginx already admits on /api/, so nothing downstream had to move.
 */
export const BUG_REPORT_MAX_BODY_BYTES = 8192

export const MAX_DESCRIPTION_LENGTH = 1000
export const MAX_EMAIL_LENGTH = 254
export const MAX_TOKEN_LENGTH = 4096
export const MAX_VERSION_LENGTH = 32

/**
 * A handful an hour from one browser is a person having a bad day; more than
 * that is not a person. The global cap is the other half — a botnet is many
 * clients, and each of them is under the per-client limit.
 */
export const REPORT_LIMIT = { limit: 5, windowMs: 10 * 60_000 }
export const GLOBAL_LIMIT = { limit: 60, windowMs: 60 * 60_000 }

/** The bookkeeping is bounded, like the scoreboard's, and for the same reason. */
export const MAX_LIMIT_BUCKETS = 1_000

/** How many stale buckets one request may clear. Bounded so nothing scans. */
const SWEEP_BUDGET = 50

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const MAILGUN_API_BASE = 'https://api.mailgun.net/v3'

/** Loose on purpose: this is a "did you mean to type an address" check, not a proof. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Turnstile wants an address in `remoteip` or nothing; a proxy label is neither. */
const IP_SHAPE = /^[0-9a-fA-F.:]+$/

/** A token bucket over a bounded map; the scoreboard's, kept local to this module. */
const takeToken = (buckets, key, { limit, windowMs }, now) => {
  const bucket = buckets.get(key)
  if (bucket === undefined || now >= bucket.resetAt) {
    if (buckets.size >= MAX_LIMIT_BUCKETS && bucket === undefined) {
      // Full, and a caller we have never seen. A refusal costs a request;
      // growing costs the process.
      return false
    }

    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= limit) {
    return false
  }

  bucket.count += 1

  return true
}

/** Drops what has expired, a bounded slice per request. */
const sweep = (buckets, now) => {
  let budget = SWEEP_BUDGET
  for (const [key, bucket] of buckets) {
    if (budget-- <= 0) {
      break
    }

    if (now >= bucket.resetAt) {
      buckets.delete(key)
    }
  }
}

/**
 * The request body as a report, or null if it is not one.
 *
 * Everything optional is normalised to '' rather than left undefined, so the
 * mail formatter never has to ask which of the three shapes an absent field
 * arrived in.
 */
export const parseReport = (raw) => {
  let payload
  try {
    payload = JSON.parse(typeof raw === 'string' && raw !== '' ? raw : 'null')
  } catch {
    return null
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }

  const { description, email, token, version } = payload

  if (typeof description !== 'string') {
    return null
  }

  const text = description.trim()
  if (text === '' || text.length > MAX_DESCRIPTION_LENGTH) {
    return null
  }

  if (typeof token !== 'string' || token === '' || token.length > MAX_TOKEN_LENGTH) {
    return null
  }

  let contact = ''
  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email.trim())) {
      return null
    }

    contact = email.trim()
  }

  let reportedVersion = ''
  if (version !== undefined && version !== null && version !== '') {
    if (typeof version !== 'string' || version.length > MAX_VERSION_LENGTH) {
      return null
    }

    reportedVersion = version.trim()
  }

  return { description: text, email: contact, version: reportedVersion, token }
}

const NOT_FOUND = { status: 404, json: { error: 'not_found' } }

/**
 * The route, over one captcha verifier and one sender.
 *
 * `siteKey` is public by design — it is the half of the Turnstile pair the
 * widget renders with — and it is served from here rather than baked into the
 * bundle so the published image stays configurable by environment alone.
 */
export const createBugReportHandler = ({ sendMail = null, verifyCaptcha = null, siteKey = '', now = Date.now } = {}) => {
  const buckets = new Map()
  const key = typeof siteKey === 'string' ? siteKey.trim() : ''
  const configured = typeof sendMail === 'function' && typeof verifyCaptcha === 'function' && key !== ''

  return async ({ method = 'GET', pathname = '', body = '', client = '', now: at = now() } = {}) => {
    if (pathname === `${BUG_REPORT_PREFIX}/config`) {
      if (method !== 'GET') {
        return NOT_FOUND
      }

      // The modal's cue to say "reporting isn't set up here" rather than to
      // render a widget against a key that does not exist.
      return configured ? { status: 200, json: { siteKey: key } } : { status: 503, json: { error: 'not_configured' } }
    }

    if (pathname !== BUG_REPORT_PREFIX || method !== 'POST') {
      return NOT_FOUND
    }

    const report = parseReport(body)
    if (report === null) {
      return { status: 400, json: { error: 'invalid_report' } }
    }

    // Before the captcha, deliberately: see the note at the top of the file.
    sweep(buckets, at)
    const caller = typeof client === 'string' && client !== '' ? client : 'unknown'
    if (!takeToken(buckets, `report:${caller}`, REPORT_LIMIT, at) || !takeToken(buckets, 'report:all', GLOBAL_LIMIT, at)) {
      return { status: 429, json: { error: 'rate_limited' } }
    }

    if (!configured) {
      return { status: 503, json: { error: 'not_configured' } }
    }

    let solved = false
    try {
      solved = await verifyCaptcha(report.token, caller)
    } catch {
      solved = false
    }

    if (solved !== true) {
      return { status: 403, json: { error: 'captcha_failed' } }
    }

    let sent = false
    try {
      sent = await sendMail({
        description: report.description,
        email: report.email,
        version: report.version,
        client: caller,
        at,
      })
    } catch {
      sent = false
    }

    return sent === true ? { status: 202, json: { ok: true } } : { status: 502, json: { error: 'send_failed' } }
  }
}

/**
 * Cloudflare's half of the captcha: the token the widget produced, checked
 * against the secret key, server-side. A widget that was never solved produces
 * no token at all, and a token that was solved somewhere else fails here.
 *
 * Answers null when there is no secret to check against — which is what makes
 * the whole feature opt-in rather than half-working.
 */
export const createTurnstileVerifier = (env = {}, fetchImpl = fetch) => {
  const secret = typeof env.TURNSTILE_SECRET_KEY === 'string' ? env.TURNSTILE_SECRET_KEY.trim() : ''
  if (secret === '') {
    return null
  }

  return async (token, client) => {
    try {
      const form = new URLSearchParams({ secret, response: String(token ?? '') })
      if (typeof client === 'string' && IP_SHAPE.test(client)) {
        form.set('remoteip', client)
      }

      const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })

      if (response.ok !== true) {
        return false
      }

      const payload = await response.json()

      return payload !== null && typeof payload === 'object' && payload.success === true
    } catch {
      return false
    }
  }
}

/** What lands in the inbox. One report, and the little that is known about it. */
const formatReport = ({ description, email, version, client, at }) =>
  [
    description,
    '',
    '—',
    `reply to: ${email === '' ? 'not given' : email}`,
    `app version: ${version === '' ? 'unknown' : version}`,
    `client: ${client}`,
    `received: ${new Date(at).toISOString()}`,
  ].join('\n')

/**
 * Mailgun's HTTP API, which needs no SMTP client and no dependency.
 *
 * Null without a key and a domain, for the same reason the verifier is: a route
 * that would accept a report and drop it is worse than one that says it is not
 * set up. The key is read once, here, and never logged or echoed.
 */
export const createMailgunSender = (env = {}, fetchImpl = fetch) => {
  const apiKey = typeof env.MAILGUN_API_KEY === 'string' ? env.MAILGUN_API_KEY.trim() : ''
  const domain = typeof env.MAILGUN_DOMAIN === 'string' ? env.MAILGUN_DOMAIN.trim() : ''
  if (apiKey === '' || domain === '') {
    return null
  }

  const from = typeof env.BUG_REPORT_FROM === 'string' && env.BUG_REPORT_FROM !== ''
    ? env.BUG_REPORT_FROM
    : `callnote bug reports <bugs@${domain}>`
  const to = typeof env.BUG_REPORT_TO === 'string' && env.BUG_REPORT_TO !== '' ? env.BUG_REPORT_TO : `bugs@${domain}`
  const authorization = `Basic ${Buffer.from(`api:${apiKey}`, 'utf8').toString('base64')}`

  return async (report) => {
    try {
      const form = new URLSearchParams({
        from,
        to,
        subject: `[callnote] bug report${report.version === '' ? '' : ` (v${report.version})`}`,
        text: formatReport(report),
      })

      // Reply-To rather than From: the report has to come from the domain that
      // is allowed to send, and still be answerable in one click.
      if (report.email !== '') {
        form.set('h:Reply-To', report.email)
      }

      const response = await fetchImpl(`${MAILGUN_API_BASE}/${encodeURIComponent(domain)}/messages`, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })

      return response.ok === true
    } catch {
      return false
    }
  }
}
