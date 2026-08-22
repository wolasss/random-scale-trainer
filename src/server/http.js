/**
 * The HTTP edge: bytes off a socket, a decision from scoreboard.js, bytes back.
 *
 * It is its own module rather than part of main.js so the integration test can
 * stand a real server up on port 0 and drive it — the body cap, the client
 * identity and the header pass-through are all things that only exist here, and
 * only a real socket exercises them.
 *
 * Nothing in here logs a body, a header or a token. The one thing worth saying
 * about a scoreboard request is that the process is listening, and main.js says
 * that once.
 */
import { createServer } from 'node:http'
import { handleRequest, writeSnapshot } from './scoreboard.js'

/**
 * A claim is a short string; a batch of events is twenty small objects. Anything
 * past this is not a scoreboard request, and reading it to find that out is the
 * attack.
 */
export const MAX_BODY_BYTES = 4096

/** Addresses that mean "the proxy in front of us", not "the caller". */
const LOOPBACK = /^(::1|::ffff:127\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+)$/

/**
 * Who to rate-limit as.
 *
 * A direct peer is whoever opened the socket. Behind the container's nginx the
 * peer is always loopback, so the forwarded header is used instead — and the
 * *last* hop of it, never the first. nginx.conf sets `X-Forwarded-For` to
 * `$remote_addr` rather than appending to it, so the last hop is the one nginx
 * itself observed; the earlier ones, if a caller sent any, are whatever that
 * caller felt like typing. Trusting the first hop would let anybody hand
 * themselves a fresh rate-limit bucket per request.
 */
export const clientIdentity = (remoteAddress, forwardedFor) => {
  const peer = typeof remoteAddress === 'string' ? remoteAddress : ''
  if (peer !== '' && !LOOPBACK.test(peer)) {
    return peer
  }

  const hops = typeof forwardedFor === 'string' ? forwardedFor.split(',') : []
  const last = hops.length === 0 ? '' : hops[hops.length - 1].trim()

  return last === '' ? peer : last
}

/**
 * Whether a request is a cross-site POST, and so a forgery (CWE-352).
 *
 * Nothing here sends CORS headers, so a cross-origin `fetch` that needs a
 * preflight is stopped by the browser on its own. What is *not* stopped is the
 * CORS "simple request": a form-shaped POST with `Content-Type: text/plain`
 * goes out without a preflight, carrying whatever the victim's browser would
 * carry, and `…/nickname` needs no Authorization to succeed. That is a page
 * anywhere squatting names on somebody else's board and burning their claim
 * quota, so both halves of the loophole are refused at the edge:
 *
 * - a `Sec-Fetch-Site` the browser attached that is not same-origin/same-site;
 * - a Content-Type that is not `application/json`, declared or missing, which
 *   is exactly the shape that skips the preflight the missing CORS headers
 *   would fail. Missing counts because `fetch` sends no Content-Type at all for
 *   a body built from a `Blob` or a typed array with no MIME type — still valid
 *   JSON on the wire, still a simple request, and the way a forgery would dodge
 *   a check that only read a declared type.
 *
 * The Sec-Fetch-Site rule is *present-and-allowed*, not present-and-non-empty:
 * an absent header is allowed, so `curl` and the container's own checks still
 * work, but a header that is there must pass — an empty value is not an allowed
 * one. A POST with no body at all is likewise left alone: there is nothing for
 * it to declare, and it is the shape a bodyless `…/finish` takes.
 */
export const isCrossSitePost = (method, headers) => {
  if (method !== 'POST') {
    return false
  }

  // Node lowercases header names, and so does the Connect middleware in
  // vite.config.ts that shares this rule.
  const site = headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'same-site') {
    return true
  }

  const type = headers['content-type']
  if (typeof type === 'string') {
    return type.split(';')[0].trim().toLowerCase() !== 'application/json'
  }

  // Nothing declared, so the only question left is whether there is a body to
  // declare. `Content-Length: 0` — what a bodyless POST carries — is not one.
  const length = headers['content-length']
  const declared = typeof length === 'string' ? length.trim() : ''

  return typeof headers['transfer-encoding'] === 'string' || (declared !== '' && declared !== '0')
}

/**
 * The body, capped — or null if the caller went over and the socket was cut.
 *
 * The chunks are kept as bytes and decoded once at the end: a nickname is text
 * somebody typed, and a multi-byte character that happens to straddle two data
 * events decodes to a pair of replacement characters if each chunk is turned
 * into a string on its own.
 */
const readBody = (request, response) =>
  new Promise((resolve) => {
    const chunks = []
    let bytes = 0

    request.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        response.writeHead(413, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'body too large' }))
        request.destroy()
        resolve(null)
        return
      }

      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => resolve(null))
  })

/**
 * A server over one store. `dataPath` of '' keeps the board in memory only, and
 * a restart loses it; `now` is injectable so a test can age a session out
 * without waiting ten minutes.
 */
export const createScoreboardServer = ({ store, dataPath = '', now = Date.now }) =>
  createServer(async (request, response) => {
    // Before readBody: a forged POST is refused without its body ever being read.
    if (isCrossSitePost(request.method, request.headers)) {
      response.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ error: 'cross_site' }))
      request.destroy()
      return
    }

    const body = request.method === 'POST' ? await readBody(request, response) : ''
    if (body === null) {
      return
    }

    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    const answer = handleRequest(store, {
      method: request.method ?? 'GET',
      pathname,
      body,
      headers: { authorization: request.headers.authorization },
      client: clientIdentity(request.socket.remoteAddress, request.headers['x-forwarded-for']),
      now: now(),
    })

    // A board is live data, and the one thing above it that caches — the service
    // worker — is told to leave /api/ alone for the same reason.
    response.writeHead(answer.status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    response.end(JSON.stringify(answer.json))

    if (answer.changed && dataPath !== '') {
      writeSnapshot(dataPath, store)
    }
  })
