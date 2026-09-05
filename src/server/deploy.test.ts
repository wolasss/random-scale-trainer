// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertInlineExecutablesMatch, extractInlineExecutables } from '../../vite.config'

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
const INDEX = read('index.html')

const POLICIES = () => NGINX.match(/add_header Content-Security-Policy "[^"]*"/g) ?? []

/** The one directive these tests are about, lifted out of a whole policy. */
const directive = (policy: string, name: string) => policy.match(new RegExp(`${name} [^;"]*`))?.[0] ?? ''

const csp = (source: string) => `'sha256-${createHash('sha256').update(source).digest('base64')}'`

// Same reasoning as the Permissions-Policy tests below: add_header does not
// merge, so every location that declares one has to repeat the whole set.
// This sweep generalises that check to any location added later.
const LOCATIONS = (NGINX.match(/^ {2}location [^\n]*\{[\s\S]*?\n {2}\}/gm) ?? [])
  .filter((block) => block.includes('add_header'))

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

  it('repeats the whole security-header set in every location that declares one', () => {
    // A guard so a broken regex can't silently pass by matching nothing.
    expect(LOCATIONS.length).toBeGreaterThanOrEqual(5)

    for (const block of LOCATIONS) {
      const name = block.split('\n')[0].trim()
      expect(block, `${name} is missing Content-Security-Policy`)
        .toMatch(/add_header Content-Security-Policy "[^"]*" always;/)
      expect(block, `${name} is missing X-Content-Type-Options`)
        .toContain('add_header X-Content-Type-Options "nosniff" always;')
      expect(block, `${name} is missing Referrer-Policy`)
        .toContain('add_header Referrer-Policy "strict-origin-when-cross-origin" always;')
      expect(block, `${name} is missing Permissions-Policy`)
        .toMatch(/add_header Permissions-Policy "[^"]*" always;/)
    }
  })

  it('spells out the CSP directives that don’t fall back to default-src', () => {
    const policies = NGINX.match(/add_header Content-Security-Policy "[^"]*"/g) ?? []

    expect(policies.length).toBeGreaterThan(0)
    for (const policy of policies) {
      expect(policy).toContain("default-src 'self'")
      expect(policy).toContain("base-uri 'self'")
      expect(policy).toContain("form-action 'self'")
      expect(policy).toContain("frame-ancestors 'none'")
      // frame-src is one of them too, and the captcha widget is an iframe.
      expect(policy).toContain("frame-src 'self' https://challenges.cloudflare.com")
    }
  })

  /**
   * The captcha on the bug-report form is the only third-party origin the page
   * runs anything from, and it buys exactly two directives. Anything wider —
   * a connect-src opened up, a wildcard, a second host — is the wrong turn, and
   * this is what says so before it ships.
   */
  it('admits the captcha host in script-src and frame-src, and nowhere else', () => {
    const policies = NGINX.match(/add_header Content-Security-Policy "[^"]*"/g) ?? []

    expect(policies.length).toBeGreaterThan(0)
    for (const policy of policies) {
      expect(policy).toContain("script-src 'self' https://challenges.cloudflare.com")
      expect(policy.match(/challenges\.cloudflare\.com/g)).toHaveLength(2)
    }

    // The page talks to its own origin only; the token check is the server's.
    expect(NGINX).not.toContain("connect-src 'self' https://challenges.cloudflare.com")
  })

  /**
   * The shell's own inline code is why script-src used to carry
   * 'unsafe-inline', which is the same as saying any injected <script> ran too.
   * It is named by hash instead now — and a hash is of exact bytes, so this
   * recomputes both from index.html rather than restating them. Edit the
   * bootstrap or the onload handler and this fails with the value to paste in.
   */
  it('admits the shell’s inline scripts by hash', () => {
    const { scripts, handlers } = extractInlineExecutables(INDEX)

    // Growing either list is a decision, not a detail: every new inline vector
    // costs another hash in all six policies.
    expect(scripts).toHaveLength(1)
    expect(handlers).toHaveLength(1)

    const policies = POLICIES()
    expect(policies.length).toBeGreaterThan(0)
    for (const policy of policies) {
      const scriptSrc = directive(policy, 'script-src')

      for (const script of scripts) {
        expect(scriptSrc, `script-src is missing the bootstrap hash ${csp(script)}`).toContain(csp(script))
      }
      // A 'sha256-…' source only ever matches a <script> element. Without this
      // keyword the onload hash is inert and the webfont never flips to all.
      expect(scriptSrc).toContain("'unsafe-hashes'")
      for (const handler of handlers) {
        expect(scriptSrc, `script-src is missing the handler hash ${csp(handler)}`).toContain(csp(handler))
      }
    }
  })

  it('no longer lets script-src run any inline script, while style-src still can', () => {
    const policies = POLICIES()

    expect(policies.length).toBeGreaterThan(0)
    for (const policy of policies) {
      expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'")
      // The skins write style at run time; there is nothing fixed to hash.
      expect(directive(policy, 'style-src')).toContain("'unsafe-inline'")
    }
  })

  /**
   * Hashes are only worth anything if the bytes nginx names are the bytes the
   * browser is served, and the build is the one thing that could come between
   * them. vite.config.ts checks the emitted dist/index.html on every build;
   * this proves the check it makes can actually tell the difference.
   */
  it('has a build guard that rejects a rewritten shell', () => {
    expect(() => assertInlineExecutablesMatch(INDEX, INDEX)).not.toThrow()
    expect(() => assertInlineExecutablesMatch(INDEX, INDEX.replace("'dark'", "'dark' "))).toThrow(/inline scripts/)
    expect(() => assertInlineExecutablesMatch(INDEX, INDEX.replace("this.media='all'", "this.media='all' ")))
      .toThrow(/inline handlers/)
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
    expect(ENTRYPOINT).toContain("su nginx -s /bin/sh -c 'exec node /opt/callnote/server/main.js' &")
  })

  /**
   * The only process in the image that parses untrusted network input
   * (report bodies, claims, event batches) must not run as uid 0.
   */
  it('starts node as the nginx user, never as root', () => {
    expect(ENTRYPOINT).toContain("su nginx -s /bin/sh -c 'exec node /opt/callnote/server/main.js' &")
    expect(ENTRYPOINT).not.toMatch(/^\s*node /m)
    expect(ENTRYPOINT.indexOf('chown')).toBeLessThan(ENTRYPOINT.indexOf('su nginx'))
  })

  /**
   * The data directory (and a freshly mounted volume over it) must be
   * handed to the nginx user before the service starts, or its writes
   * fail; the chown must stay non-recursive so it cannot re-own an
   * unrelated tree the env var happens to point at.
   */
  it('hands the data dir to the nginx user before starting the service', () => {
    expect(ENTRYPOINT).toContain('chown nginx:nginx "$DATA_DIR"')
    expect(ENTRYPOINT).not.toContain('chown -R')
    expect(DOCKERFILE).toContain('chown nginx:nginx /var/lib/callnote')
  })

  /**
   * SCOREBOARD_DATA is operator-configurable; a bare filename like
   * "/scoreboard.json" would make dirname "/". Re-owning whatever directory
   * the variable happens to point at would hand the network-facing nginx
   * user write access outside the image's own data directory, so the chown
   * only ever fires for the well-known default.
   */
  it('only re-owns the image’s own data directory, never a caller-selected path', () => {
    expect(ENTRYPOINT).toContain('if [ "$DATA_DIR" = "/var/lib/callnote" ]')
  })

  /**
   * writeSnapshot already treats an unwritable volume as best-effort; the
   * entrypoint must not turn a read-only or root-squashed mount into a
   * total outage by letting `set -e` kill the script before nginx starts.
   */
  it('does not let a failed ownership change abort nginx startup', () => {
    expect(ENTRYPOINT).toContain('chown nginx:nginx "$DATA_DIR" 2>/dev/null || true')
    expect(ENTRYPOINT).toContain('chown nginx:nginx "$SCOREBOARD_DATA" 2>/dev/null || true')
  })

  /**
   * main.js imports these at boot, and each is now named individually in the
   * COPY rather than shipped by directory — a module moved anywhere else, or
   * never added to the COPY, is a container that exits before nginx has
   * finished starting.
   */
  it('ships every module the service imports', () => {
    expect(RUNTIME).not.toBe('')

    for (const module of ['bug-report.js', 'http.js', 'main.js', 'scoreboard.js', 'session-scoring.js']) {
      expect(existsSync(fileURLToPath(new URL(`./${module}`, import.meta.url)))).toBe(true)
      expect(SERVER_SOURCES).toContain(`src/server/${module}`)
    }

    expect(MAIN).toContain("from './bug-report.js'")
    expect(MAIN).toContain("from './http.js'")
    expect(MAIN).toContain("from './scoreboard.js'")
  })

  /**
   * The image is published, and the test sources spell out the rate-limit
   * constants, the snapshot format and the ownership rules to anyone who
   * pulls it — so the runtime stage must copy exactly the runtime modules
   * and nothing else out of src/server.
   */
  it('ships nothing else from src/server — no tests, no declarations', () => {
    expect(SERVER_COPIES.length).toBeGreaterThan(0)
    expect([...SERVER_SOURCES].sort()).toEqual([
      'src/server/bug-report.js',
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
