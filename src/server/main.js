/**
 * The only socket the scoreboard opens. Everything it decides lives in
 * scoreboard.js; this reads a request off the wire, hands it over, and writes
 * the answer back.
 *
 * In the container nginx proxies /api/ here (see nginx.conf) and starts it from
 * /docker-entrypoint.d/50-scoreboard.sh, so the published image still runs with
 * `docker run -p 8080:80` and nothing else. In dev and preview the same handler
 * is mounted as a Vite middleware instead — see vite.config.ts.
 *
 *   SCOREBOARD_DATA  where to keep the board between restarts; unset means
 *                    memory only, and a restart loses it
 */
import { createServer } from 'node:http'
import { createStore, handleRequest, readSnapshot, writeSnapshot } from './scoreboard.js'

/**
 * Deliberately a constant and not an environment variable: nginx.conf proxies
 * /api/ to this exact port on loopback, and the two have no way to agree at run
 * time. A knob that moved one without the other would only ever produce 502s.
 */
const PORT = 8787
const DATA_PATH = process.env.SCOREBOARD_DATA ?? ''

/**
 * A submit is two short strings and a number. Anything past this is not a
 * scoreboard entry, and reading it to find that out is the attack.
 */
const MAX_BODY_BYTES = 4096

const store = DATA_PATH === '' ? createStore() : readSnapshot(DATA_PATH)

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

const server = createServer(async (request, response) => {
  const body = request.method === 'POST' ? await readBody(request, response) : ''
  if (body === null) {
    return
  }

  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  const answer = handleRequest(store, { method: request.method ?? 'GET', pathname, body })

  // A board is live data, and the one thing above it that caches — the service
  // worker — is told to leave /api/ alone for the same reason.
  response.writeHead(answer.status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(answer.json))

  if (answer.changed && DATA_PATH !== '') {
    writeSnapshot(DATA_PATH, store)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`scoreboard listening on 127.0.0.1:${PORT}`)
})
