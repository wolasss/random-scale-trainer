// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The three deployed facts a shared challenge depends on, none of which any
 * other test can see: the served Permissions-Policy has to allow the
 * microphone, /api/ has to reach the service, and the runtime image has to have
 * a node to run it with.
 *
 * Reading the config files is crude, and it is still the only thing standing
 * between "green locally" and a container where `getUserMedia` is refused
 * before it is asked. All three were broken before this feature existed.
 */
const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), 'utf8')

const NGINX = read('nginx.conf')
const DOCKERFILE = read('Dockerfile')
const ENTRYPOINT = read('docker/50-scoreboard.sh')
const MAIN = read('src/server/main.js')

const RUNTIME = DOCKERFILE.match(/^FROM [^\n]*\bAS runtime\b[\s\S]*$/m)?.[0] ?? ''
const SERVER_COPIES = (RUNTIME.match(/^COPY .*$/gm) ?? [])
  .filter((line) => line.includes('/opt/callnote/server'))
const SERVER_SOURCES = SERVER_COPIES.flatMap((line) =>
  line.replace(/^COPY\s+/, '').trim().split(/\s+/).slice(0, -1))

describe('nginx.conf', () => {
  /**
   * add_header does not merge: a location that declares one of its own inherits
   * none of the server block's. So it is not enough for the policy to be right
   * once — every copy of it has to be, or the microphone is forbidden on
   * whichever documents that location happens to serve.
   */
  it('allows the microphone in every Permissions-Policy it serves', () => {
    const policies = NGINX.match(/add_header Permissions-Policy "[^"]*"/g) ?? []

    expect(policies.length).toBeGreaterThan(0)
    for (const policy of policies) {
      expect(policy).toContain('microphone=(self)')
      // (self), never (*): this origin, and nothing it embeds.
      expect(policy).not.toContain('microphone=(*)')
      expect(policy).not.toContain('microphone=*')
    }
  })

  it('still refuses the camera and the user’s location everywhere', () => {
    for (const policy of NGINX.match(/add_header Permissions-Policy "[^"]*"/g) ?? []) {
      expect(policy).toContain('camera=()')
      expect(policy).toContain('geolocation=()')
    }
  })

  it('proxies /api/ to the scoreboard, and never lets it be cached', () => {
    const location = NGINX.match(/location \/api\/ \{[\s\S]*?\n {2}\}/)?.[0]

    expect(location).toBeDefined()
    expect(location).toContain('proxy_pass http://127.0.0.1:8787')
    expect(location).toContain('add_header Cache-Control "no-store"')
    // A location with add_header of its own inherits none of the rest.
    expect(location).toContain('X-Content-Type-Options')
    expect(location).toContain('Content-Security-Policy')
  })

  /**
   * http.js's own socket timeouts and streaming body cap only ever see the
   * fast loopback connection nginx makes to it — nginx is the client-facing
   * listener, and with request buffering on (nginx's default) it reads a
   * slow or oversized public body in full before those protections ever run.
   * Streaming instead, and bounding the client-facing connection here too,
   * is what makes them apply to the caller they were written for.
   */
  it('bounds a slow or oversized public caller itself, rather than only the upstream it proxies to', () => {
    const location = NGINX.match(/location \/api\/ \{[\s\S]*?\n {2}\}/)?.[0]

    expect(location).toBeDefined()
    expect(location).toContain('proxy_request_buffering off')
    expect(location).toContain('client_max_body_size 8k')
    expect(NGINX).toContain('client_header_timeout')
    expect(NGINX).toContain('client_body_timeout')
  })

  /**
   * The proxy names a port and the service binds one, and nothing at run time
   * reconciles them — so they are pinned on both sides and checked here. A
   * service that could be moved by the environment would only ever move out
   * from under this proxy, and every scoreboard request would be a 502.
   */
  it('proxies to the very port the service listens on', () => {
    const port = MAIN.match(/^const PORT = (\d+)$/m)?.[1]

    expect(port).toBeDefined()
    expect(NGINX).toContain(`proxy_pass http://127.0.0.1:${port}`)
    expect(ENTRYPOINT).not.toContain('SCOREBOARD_PORT')
    expect(MAIN).not.toContain('SCOREBOARD_PORT')
  })

  it('keeps the page able to reach its own origin', () => {
    expect(NGINX).toContain("connect-src 'self'")
  })

  /**
   * The scoreboard's rate limits key on the address nginx forwards, and
   * $proxy_add_x_forwarded_for *appends* to whatever the caller sent. Under
   * that setting a caller can prepend a hop of their own invention and take a
   * fresh bucket per request, which is the whole limit gone. Setting the header
   * outright leaves exactly one hop in it: the one nginx observed.
   */
  it('forwards the address it observed rather than the one it was handed', () => {
    const location = NGINX.match(/location \/api\/ \{[\s\S]*?\n {2}\}/)?.[0]

    expect(location).toContain('proxy_set_header X-Forwarded-For $remote_addr;')
    expect(NGINX).not.toContain('$proxy_add_x_forwarded_for')
  })
})

describe('Dockerfile', () => {
  it('installs a node for the scoreboard to run on', () => {
    expect(DOCKERFILE).toMatch(/apk add --no-cache nodejs/)
  })

  it('ships the service and the script that starts it', () => {
    expect(DOCKERFILE).toContain('/docker-entrypoint.d/50-scoreboard.sh')
    expect(ENTRYPOINT).toContain('/opt/callnote/server/main.js')
    // Blocking here would stop nginx from ever starting.
    expect(ENTRYPOINT).toMatch(/node .*main\.js &/)
  })

  /**
   * main.js imports these at boot, and each is now named individually in the
   * COPY rather than shipped by directory — a module moved anywhere else, or
   * never added to the COPY, is a container that exits before nginx has
   * finished starting.
   */
  it('ships every module the service imports', () => {
    expect(RUNTIME).not.toBe('')

    for (const module of ['http.js', 'main.js', 'scoreboard.js', 'session-scoring.js']) {
      expect(existsSync(fileURLToPath(new URL(`./${module}`, import.meta.url)))).toBe(true)
      expect(SERVER_SOURCES).toContain(`src/server/${module}`)
    }

    expect(MAIN).toContain("from './http.js'")
    expect(MAIN).toContain("from './scoreboard.js'")
  })

  /**
   * The image is published, and the test sources spell out the rate-limit
   * constants, the snapshot format and the ownership rules to anyone who
   * pulls it — so the runtime stage must copy exactly the four runtime
   * modules and nothing else out of src/server.
   */
  it('ships nothing else from src/server — no tests, no declarations', () => {
    expect(SERVER_COPIES.length).toBeGreaterThan(0)
    expect([...SERVER_SOURCES].sort()).toEqual([
      'src/server/http.js',
      'src/server/main.js',
      'src/server/scoreboard.js',
      'src/server/session-scoring.js',
    ])
  })

  /** The published image's run contract: `docker run -p 8080:80`, unchanged. */
  it('leaves the port and the command exactly as they were', () => {
    expect(DOCKERFILE).toContain('EXPOSE 80')
    expect(DOCKERFILE).toContain('CMD ["nginx", "-g", "daemon off;"]')
  })
})
