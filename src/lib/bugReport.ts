/**
 * The client half of "report a bug": two calls against the route in
 * src/server/bug-report.js, and the one script this app loads from anywhere
 * but its own origin.
 *
 * Nothing secret is here, and nothing secret could be: the captcha's *site* key
 * is public by design — it is what the widget renders with — and it is fetched
 * at run time rather than baked into the bundle, so the same published build
 * works whether or not the deployment that serves it has reporting configured.
 * The secret half and the mail key never leave the server.
 *
 * Like src/lib/scoreboard.ts, the failures answer a *reason* rather than a
 * null: "that captcha didn't check out", "you're going too fast" and "this
 * deployment doesn't do reports" are three different things to say, and only
 * one of them is worth trying again straight away.
 */

/** Mounted by nginx in the container and by a Vite middleware in dev/preview. */
export const BUG_REPORT_ENDPOINT = '/api/bug-report'

/** Mirrors the server's own cap; the textarea stops here so the server never has to. */
export const MAX_DESCRIPTION_LENGTH = 1000

export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script'

export type BugReportRequestOptions = {
  signal?: AbortSignal
  /** Injectable for tests; otherwise the browser's own. */
  fetchImpl?: typeof fetch
}

/**
 * What the modal needs before it can render a form.
 *
 * `'unavailable'` is the deployment saying it has no captcha or no mail key —
 * a permanent answer, and the modal says so plainly. `null` is a network that
 * did not answer, which on an offline-first app is the ordinary case.
 */
export type BugReportConfig = { siteKey: string } | 'unavailable' | null

export type BugReportOutcome = 'ok' | 'captcha-failed' | 'rate-limited' | 'unavailable' | 'error'

export type BugReportDraft = {
  description: string
  email: string
  token: string
  version: string
}

/** The little of Turnstile's global this app uses, typed so nothing else can be. */
export type TurnstileWidgetOptions = {
  sitekey: string
  callback?: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
  theme?: 'auto' | 'light' | 'dark'
  size?: 'normal' | 'flexible' | 'compact'
}

export type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileWidgetOptions) => string | undefined
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

export const fetchBugReportConfig = async ({
  signal,
  fetchImpl = fetch,
}: BugReportRequestOptions = {}): Promise<BugReportConfig> => {
  try {
    const response = await fetchImpl(`${BUG_REPORT_ENDPOINT}/config`, { ...(signal === undefined ? {} : { signal }) })
    if (response.status === 503) {
      return 'unavailable'
    }

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as { siteKey?: unknown }

    return typeof payload?.siteKey === 'string' && payload.siteKey !== '' ? { siteKey: payload.siteKey } : 'unavailable'
  } catch {
    return null
  }
}

/**
 * Posts one report. The captcha token rides in the body, and the server checks
 * it against a secret this browser has never seen — which is the whole point:
 * a form that only validated in the page would be a form anything could post.
 */
export const sendBugReport = async (
  { description, email, token, version }: BugReportDraft,
  { signal, fetchImpl = fetch }: BugReportRequestOptions = {},
): Promise<BugReportOutcome> => {
  let response: Response
  try {
    response = await fetchImpl(BUG_REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, email, token, version }),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch {
    return 'error'
  }

  if (response.status === 202) {
    return 'ok'
  }

  if (response.status === 403) {
    return 'captcha-failed'
  }

  if (response.status === 429) {
    return 'rate-limited'
  }

  return response.status === 503 ? 'unavailable' : 'error'
}

/**
 * Loads Cloudflare's widget script, once, and hands back its global.
 *
 * It is inserted here rather than named in index.html because most sessions
 * never open this modal: an offline-first practice app has no business
 * fetching a third-party script on every cold start to hold a form nobody
 * asked for. Rejecting is a first-class outcome — the app is installable and
 * offline, and a report simply cannot be sent from there.
 */
export const loadTurnstile = (doc: Document = document): Promise<TurnstileApi> =>
  new Promise((resolve, reject) => {
    const existing = (window as unknown as { turnstile?: TurnstileApi }).turnstile
    if (existing !== undefined) {
      resolve(existing)
      return
    }

    const ready = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile
      if (api === undefined) {
        reject(new Error('turnstile loaded without its global'))
        return
      }

      resolve(api)
    }

    // A script that failed takes itself back out of the document, because its
    // error event has already fired: leaving it there would mean the next open
    // attaches listeners to an element that will never speak again, and the
    // form would stay disabled long after the connection came back.
    const listen = (element: Element) => {
      element.addEventListener('load', ready, { once: true })
      element.addEventListener(
        'error',
        () => {
          element.remove()
          reject(new Error('turnstile failed to load'))
        },
        { once: true },
      )
    }

    const already = doc.getElementById(TURNSTILE_SCRIPT_ID)
    if (already !== null) {
      listen(already)
      return
    }

    const script = doc.createElement('script')
    script.id = TURNSTILE_SCRIPT_ID
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.defer = true
    listen(script)
    doc.head.appendChild(script)
  })
