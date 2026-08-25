import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUG_REPORT_ENDPOINT,
  fetchBugReportConfig,
  loadTurnstile,
  sendBugReport,
  TURNSTILE_SCRIPT_URL,
  type TurnstileApi,
} from './bugReport'

const reply = (status: number, payload: unknown = {}) =>
  vi.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => payload })) as unknown as typeof fetch

const DRAFT = { description: 'The metronome drifts.', email: '', token: 'solved', version: '1.26.1' }

afterEach(() => {
  document.getElementById('cf-turnstile-script')?.remove()
  delete (window as unknown as { turnstile?: TurnstileApi }).turnstile
})

describe('fetching the config', () => {
  it('hands back the site key the widget renders with', async () => {
    const fetchImpl = reply(200, { siteKey: 'site-key' })

    expect(await fetchBugReportConfig({ fetchImpl })).toEqual({ siteKey: 'site-key' })
    expect(fetchImpl).toHaveBeenCalledWith(`${BUG_REPORT_ENDPOINT}/config`, { signal: undefined })
  })

  it('reads a 503 as "this deployment does not do reports"', async () => {
    expect(await fetchBugReportConfig({ fetchImpl: reply(503, { error: 'not_configured' }) })).toBe('unavailable')
  })

  it('reads a key that is not one the same way, rather than rendering against it', async () => {
    expect(await fetchBugReportConfig({ fetchImpl: reply(200, { siteKey: '' }) })).toBe('unavailable')
    expect(await fetchBugReportConfig({ fetchImpl: reply(200, {}) })).toBe('unavailable')
  })

  it('is null when nothing answered, which offline is the ordinary case', async () => {
    const offline = (async () => {
      throw new TypeError('failed to fetch')
    }) as unknown as typeof fetch

    expect(await fetchBugReportConfig({ fetchImpl: offline })).toBeNull()
    expect(await fetchBugReportConfig({ fetchImpl: reply(500) })).toBeNull()
  })
})

describe('sending a report', () => {
  it('posts the draft as JSON and reads 202 as sent', async () => {
    const fetchImpl = reply(202, { ok: true })

    expect(await sendBugReport(DRAFT, { fetchImpl })).toBe('ok')

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe(BUG_REPORT_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual(DRAFT)
  })

  it('tells the four refusals apart, because they are four different things to say', async () => {
    expect(await sendBugReport(DRAFT, { fetchImpl: reply(403, { error: 'captcha_failed' }) })).toBe('captcha-failed')
    expect(await sendBugReport(DRAFT, { fetchImpl: reply(429, { error: 'rate_limited' }) })).toBe('rate-limited')
    expect(await sendBugReport(DRAFT, { fetchImpl: reply(503, { error: 'not_configured' }) })).toBe('unavailable')
    expect(await sendBugReport(DRAFT, { fetchImpl: reply(502, { error: 'send_failed' }) })).toBe('error')
    expect(await sendBugReport(DRAFT, { fetchImpl: reply(400, { error: 'invalid_report' }) })).toBe('error')
  })

  it('is an error rather than a throw when the request never left', async () => {
    const offline = (async () => {
      throw new TypeError('failed to fetch')
    }) as unknown as typeof fetch

    expect(await sendBugReport(DRAFT, { fetchImpl: offline })).toBe('error')
  })
})

describe('loading the widget script', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('inserts the script once and resolves with the global it defines', async () => {
    const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() }
    const pending = loadTurnstile(document)

    const script = document.getElementById('cf-turnstile-script') as HTMLScriptElement
    expect(script.src).toBe(TURNSTILE_SCRIPT_URL)
    ;(window as unknown as { turnstile?: TurnstileApi }).turnstile = api
    script.dispatchEvent(new Event('load'))

    expect(await pending).toBe(api)

    // A second call takes the global that is already there.
    expect(await loadTurnstile(document)).toBe(api)
    expect(document.querySelectorAll('#cf-turnstile-script')).toHaveLength(1)
  })

  it('rejects when the script cannot be fetched at all — which offline it cannot', async () => {
    const pending = loadTurnstile(document)
    const rejected = pending.then(
      () => 'resolved',
      () => 'rejected',
    )

    document.getElementById('cf-turnstile-script')!.dispatchEvent(new Event('error'))
    await settle()

    expect(await rejected).toBe('rejected')
  })

  it('tries again with a fresh script once the first one has failed', async () => {
    const failing = loadTurnstile(document)
    const first = failing.then(
      () => 'resolved',
      () => 'rejected',
    )

    document.getElementById('cf-turnstile-script')!.dispatchEvent(new Event('error'))
    await settle()
    expect(await first).toBe('rejected')

    // The dead script is gone, so reopening the modal after the connection
    // comes back gets a script that can still answer rather than a silent hang.
    const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() }
    const retry = loadTurnstile(document)
    const script = document.getElementById('cf-turnstile-script')
    expect(script).not.toBeNull()
    ;(window as unknown as { turnstile?: TurnstileApi }).turnstile = api
    script!.dispatchEvent(new Event('load'))

    expect(await retry).toBe(api)
  })

  it('rejects rather than hangs when the script loads without its global', async () => {
    const pending = loadTurnstile(document)
    const settled = pending.then(
      () => 'resolved',
      () => 'rejected',
    )

    document.getElementById('cf-turnstile-script')!.dispatchEvent(new Event('load'))
    await settle()

    expect(await settled).toBe('rejected')
  })
})
