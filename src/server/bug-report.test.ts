// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  BUG_REPORT_PREFIX,
  createBugReportHandler,
  createMailgunSender,
  createTurnstileVerifier,
  MAILGUN_API_BASE,
  MAX_DESCRIPTION_LENGTH,
  REPORT_LIMIT,
  TURNSTILE_VERIFY_URL,
  type BugReport,
  type BugReportHandler,
} from './bug-report.js'

const SITE_KEY = '1x00000000000000000000AA'

type HandlerParts = {
  handler: BugReportHandler
  sendMail: ReturnType<typeof vi.fn>
  verifyCaptcha: ReturnType<typeof vi.fn>
}

const build = ({
  solved = true,
  sends = true,
  siteKey = SITE_KEY,
}: { solved?: boolean | (() => Promise<boolean>); sends?: boolean | (() => Promise<boolean>); siteKey?: string } = {}): HandlerParts => {
  const verifyCaptcha = vi.fn(typeof solved === 'function' ? solved : async () => solved)
  const sendMail = vi.fn(typeof sends === 'function' ? sends : async () => sends)

  return {
    handler: createBugReportHandler({ sendMail, verifyCaptcha, siteKey, now: () => 1_700_000_000_000 }),
    sendMail,
    verifyCaptcha,
  }
}

const post = (
  handler: BugReportHandler,
  body: unknown,
  { client = '198.51.100.7', now }: { client?: string; now?: number } = {},
) =>
  handler({
    method: 'POST',
    pathname: BUG_REPORT_PREFIX,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    client,
    ...(now === undefined ? {} : { now }),
  })

const REPORT = { description: 'The metronome drifts after a tempo ramp.', token: 'solved-token', version: '1.26.1' }

describe('the config route', () => {
  it('hands out the site key the widget renders with', async () => {
    const { handler } = build()

    expect(await handler({ method: 'GET', pathname: `${BUG_REPORT_PREFIX}/config` })).toEqual({
      status: 200,
      json: { siteKey: SITE_KEY },
    })
  })

  it('says it is not set up when any half of the pair is missing', async () => {
    for (const handler of [
      build({ siteKey: '' }).handler,
      createBugReportHandler({ sendMail: async () => true, verifyCaptcha: null, siteKey: SITE_KEY }),
      createBugReportHandler({ sendMail: null, verifyCaptcha: async () => true, siteKey: SITE_KEY }),
      createBugReportHandler(),
    ]) {
      expect(await handler({ method: 'GET', pathname: `${BUG_REPORT_PREFIX}/config` })).toEqual({
        status: 503,
        json: { error: 'not_configured' },
      })
    }
  })

  it('is a GET and nothing else', async () => {
    const { handler } = build()

    expect((await handler({ method: 'POST', pathname: `${BUG_REPORT_PREFIX}/config` })).status).toBe(404)
    expect((await handler({ method: 'GET', pathname: `${BUG_REPORT_PREFIX}/whatever` })).status).toBe(404)
    expect((await handler({ method: 'GET', pathname: BUG_REPORT_PREFIX })).status).toBe(404)
  })
})

describe('posting a report', () => {
  it('takes a well-formed one and hands it to the sender', async () => {
    const { handler, sendMail } = build()

    const answer = await post(handler, { ...REPORT, email: 'ada@example.com' }, { now: 1_700_000_000_500 })

    expect(answer).toEqual({ status: 202, json: { ok: true } })
    expect(sendMail).toHaveBeenCalledWith({
      description: REPORT.description,
      email: 'ada@example.com',
      version: '1.26.1',
      client: '198.51.100.7',
      at: 1_700_000_000_500,
    })
  })

  it('refuses a body that is not a report, without spending anybody’s allowance', async () => {
    const { handler, verifyCaptcha } = build()

    for (const body of [
      'not json',
      '',
      JSON.stringify([]),
      JSON.stringify({ token: 'solved-token' }),
      JSON.stringify({ description: '   ', token: 'solved-token' }),
      JSON.stringify({ description: '\x00\x07', token: 'solved-token' }),
      JSON.stringify({ description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1), token: 'solved-token' }),
      JSON.stringify({ description: 'ok', token: '' }),
      JSON.stringify({ description: 'ok', token: 42 }),
      JSON.stringify({ ...REPORT, email: 'not-an-address' }),
      JSON.stringify({ ...REPORT, version: 'v'.repeat(64) }),
    ]) {
      expect(await post(handler, body)).toEqual({ status: 400, json: { error: 'invalid_report' } })
    }

    expect(verifyCaptcha).not.toHaveBeenCalled()
    // Ten refusals, and the eleventh caller is still under the limit.
    expect((await post(handler, REPORT)).status).toBe(202)
  })

  it('strips control characters out of the version so none reach the subject line', async () => {
    const { handler, sendMail } = build()

    const answer = await post(handler, { ...REPORT, version: '1.2.3\r\nbcc: evil@x' })

    expect(answer).toEqual({ status: 202, json: { ok: true } })
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ version: '1.2.3bcc: evil@x' }))
  })

  it('strips control characters out of the description but keeps its newlines and tabs', async () => {
    const { handler, sendMail } = build()

    const answer = await post(handler, { ...REPORT, description: 'line one\r\nline two\x00\u{200B}\tend' })

    expect(answer).toEqual({ status: 202, json: { ok: true } })
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ description: 'line one\nline two\tend' }))
  })

  it('leaves the optional fields optional', async () => {
    const { handler, sendMail } = build()

    expect((await post(handler, { description: 'Just this.', token: 'solved-token' })).status).toBe(202)
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ email: '', version: '' }))
  })

  it('says so when the captcha was not solved', async () => {
    const { handler, sendMail } = build({ solved: false })

    expect(await post(handler, REPORT)).toEqual({ status: 403, json: { error: 'captcha_failed' } })
    expect(sendMail).not.toHaveBeenCalled()
  })

  /**
   * The whole point of the ordering. Verifying a token is a round trip; if a
   * refused one cost nothing, wrong tokens would be free to send and expensive
   * to answer. A failed attempt spends the same allowance as a passing one.
   */
  it('spends the allowance on failed captchas too, not only on accepted reports', async () => {
    const { handler, verifyCaptcha } = build({ solved: false })

    for (let attempt = 0; attempt < REPORT_LIMIT.limit; attempt += 1) {
      expect((await post(handler, REPORT)).status).toBe(403)
    }

    expect(await post(handler, REPORT)).toEqual({ status: 429, json: { error: 'rate_limited' } })
    // The one over the limit never reached Cloudflare.
    expect(verifyCaptcha).toHaveBeenCalledTimes(REPORT_LIMIT.limit)
  })

  it('limits each caller on their own, and lets the window run out', async () => {
    const { handler } = build()

    for (let attempt = 0; attempt < REPORT_LIMIT.limit; attempt += 1) {
      expect((await post(handler, REPORT, { client: 'a' })).status).toBe(202)
    }

    expect((await post(handler, REPORT, { client: 'a' })).status).toBe(429)
    expect((await post(handler, REPORT, { client: 'b' })).status).toBe(202)

    const later = 1_700_000_000_000 + REPORT_LIMIT.windowMs + 1
    expect((await post(handler, REPORT, { client: 'a', now: later })).status).toBe(202)
  })

  /**
   * The P1: this handler is awaited inside the `node:http` callback that also
   * serves the scoreboard. A rejection escaping into it is an unhandled
   * rejection, and an unhandled rejection is the whole process — board included.
   */
  it('answers 502 when the sender throws, rather than letting it escape', async () => {
    const { handler } = build({
      sends: async () => {
        throw new Error('mailgun is having a day')
      },
    })

    await expect(post(handler, REPORT)).resolves.toEqual({ status: 502, json: { error: 'send_failed' } })
  })

  it('answers 502 when the sender simply refuses', async () => {
    const { handler } = build({ sends: false })

    expect(await post(handler, REPORT)).toEqual({ status: 502, json: { error: 'send_failed' } })
  })

  it('answers 403 when the verifier throws, rather than letting it escape', async () => {
    const { handler, sendMail } = build({
      solved: async () => {
        throw new Error('no route to cloudflare')
      },
    })

    await expect(post(handler, REPORT)).resolves.toEqual({ status: 403, json: { error: 'captcha_failed' } })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('says it is not set up rather than pretending to take a report', async () => {
    const handler = createBugReportHandler()

    expect(await post(handler, REPORT)).toEqual({ status: 503, json: { error: 'not_configured' } })
  })

  it('is a POST on the prefix and nothing else', async () => {
    const { handler } = build()

    expect((await handler({ method: 'DELETE', pathname: BUG_REPORT_PREFIX, body: '' })).status).toBe(404)
    expect((await handler({ method: 'POST', pathname: `${BUG_REPORT_PREFIX}/send`, body: '' })).status).toBe(404)
  })
})

describe('the Turnstile verifier', () => {
  const reply = (payload: unknown, ok = true) =>
    vi.fn(async () => ({ ok, json: async () => payload })) as unknown as typeof fetch

  it('is null until there is a secret to check against', () => {
    expect(createTurnstileVerifier({})).toBeNull()
    expect(createTurnstileVerifier({ TURNSTILE_SECRET_KEY: '   ' })).toBeNull()
  })

  it('posts the token and the secret to Cloudflare, form-encoded', async () => {
    const fetchImpl = reply({ success: true })
    const verify = createTurnstileVerifier({ TURNSTILE_SECRET_KEY: 'secret' }, fetchImpl)!

    expect(await verify('a-token', '198.51.100.7')).toBe(true)

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe(TURNSTILE_VERIFY_URL)
    expect(init.method).toBe('POST')
    const form = new URLSearchParams(init.body as string)
    expect(form.get('secret')).toBe('secret')
    expect(form.get('response')).toBe('a-token')
    expect(form.get('remoteip')).toBe('198.51.100.7')
  })

  it('sends no remoteip when the caller is not an address', async () => {
    const fetchImpl = reply({ success: true })
    const verify = createTurnstileVerifier({ TURNSTILE_SECRET_KEY: 'secret' }, fetchImpl)!

    await verify('a-token', 'unknown')

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(new URLSearchParams(init.body as string).has('remoteip')).toBe(false)
  })

  it('bounds the call to Cloudflare with a timeout, so a stalled provider cannot pin the handler', async () => {
    const fetchImpl = reply({ success: true })
    const verify = createTurnstileVerifier({ TURNSTILE_SECRET_KEY: 'secret' }, fetchImpl)!

    await verify('a-token', '198.51.100.7')

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal.aborted).toBe(false)
  })

  it('is false on an unsuccessful verdict, a bad status, or no network at all', async () => {
    const secret = { TURNSTILE_SECRET_KEY: 'secret' }

    expect(await createTurnstileVerifier(secret, reply({ success: false }))!('t', '')).toBe(false)
    expect(await createTurnstileVerifier(secret, reply({ success: true }, false))!('t', '')).toBe(false)
    expect(
      await createTurnstileVerifier(secret, (async () => {
        throw new Error('offline')
      }) as unknown as typeof fetch)!('t', ''),
    ).toBe(false)
  })
})

describe('the Mailgun sender', () => {
  const report: BugReport = {
    description: 'The metronome drifts.',
    email: 'ada@example.com',
    version: '1.26.1',
    client: '198.51.100.7',
    at: 1_700_000_000_000,
  }

  it('is null until there is both a key and a domain', () => {
    expect(createMailgunSender({ MAILGUN_API_KEY: 'k' })).toBeNull()
    expect(createMailgunSender({ MAILGUN_DOMAIN: 'mg.example.com' })).toBeNull()
    expect(createMailgunSender({})).toBeNull()
  })

  it('posts the report to the domain’s messages endpoint, authorized as `api`', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch
    const send = createMailgunSender(
      { MAILGUN_API_KEY: 'key-123', MAILGUN_DOMAIN: 'mg.example.com', BUG_REPORT_TO: 'inbox@example.com' },
      fetchImpl,
    )!

    expect(await send(report)).toBe(true)

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe(`${MAILGUN_API_BASE}/mg.example.com/messages`)
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('api:key-123').toString('base64')}`)

    // multipart, which is what Mailgun's /messages takes — and no Content-Type
    // of our own, so fetch can put its boundary in one.
    const form = init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(init.headers['Content-Type']).toBeUndefined()

    expect(form.get('to')).toBe('inbox@example.com')
    expect(form.get('from')).toBe('callnote bug reports <bugs@mg.example.com>')
    expect(form.get('subject')).toBe('[callnote] bug report (v1.26.1)')
    expect(form.get('h:Reply-To')).toBe('ada@example.com')
    expect(form.get('text')).toContain('The metronome drifts.')
    expect(form.get('text')).toContain('app version: 1.26.1')
  })

  it('falls back to the domain’s own inbox and leaves out a Reply-To nobody gave', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch
    const send = createMailgunSender({ MAILGUN_API_KEY: 'k', MAILGUN_DOMAIN: 'mg.example.com' }, fetchImpl)!

    await send({ ...report, email: '', version: '' })

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    const form = init.body as FormData
    expect(form.get('to')).toBe('bugs@mg.example.com')
    expect(form.get('subject')).toBe('[callnote] bug report')
    expect(form.has('h:Reply-To')).toBe(false)
    expect(form.get('text')).toContain('reply to: not given')
  })

  it('is false rather than a throw when the provider is unreachable or refuses', async () => {
    const env = { MAILGUN_API_KEY: 'k', MAILGUN_DOMAIN: 'mg.example.com' }

    expect(await createMailgunSender(env, (async () => ({ ok: false })) as unknown as typeof fetch)!(report)).toBe(false)
    expect(
      await createMailgunSender(env, (async () => {
        throw new Error('offline')
      }) as unknown as typeof fetch)!(report),
    ).toBe(false)
  })

  it('never puts the key anywhere but the Authorization header', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch
    const send = createMailgunSender({ MAILGUN_API_KEY: 'key-123', MAILGUN_DOMAIN: 'mg.example.com' }, fetchImpl)!

    await send(report)

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).not.toContain('key-123')

    for (const [, value] of init.body as FormData) {
      expect(String(value)).not.toContain('key-123')
    }
  })

  it('bounds the call to Mailgun with a timeout, so a stalled provider cannot pin the handler', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch
    const send = createMailgunSender({ MAILGUN_API_KEY: 'k', MAILGUN_DOMAIN: 'mg.example.com' }, fetchImpl)!

    await send(report)

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal.aborted).toBe(false)
  })

  it('posts to whichever region the deployment names, so an EU domain is reachable', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch
    const send = createMailgunSender(
      {
        MAILGUN_API_KEY: 'k',
        MAILGUN_DOMAIN: 'mg.example.com',
        MAILGUN_API_BASE: 'https://api.eu.mailgun.net/v3/',
      },
      fetchImpl,
    )!

    await send(report)

    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.eu.mailgun.net/v3/mg.example.com/messages')
  })
})
