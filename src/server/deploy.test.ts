// @vitest-environment node
import { readFileSync } from 'node:fs'
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

  it('keeps the page able to reach its own origin', () => {
    expect(NGINX).toContain("connect-src 'self'")
  })
})

describe('Dockerfile', () => {
  it('installs a node for the scoreboard to run on', () => {
    expect(DOCKERFILE).toMatch(/apk add --no-cache nodejs/)
  })

  it('ships the service and the script that starts it', () => {
    expect(DOCKERFILE).toContain('COPY src/server/ /opt/callnote/server/')
    expect(DOCKERFILE).toContain('/docker-entrypoint.d/50-scoreboard.sh')
    expect(ENTRYPOINT).toContain('/opt/callnote/server/main.js')
    // Blocking here would stop nginx from ever starting.
    expect(ENTRYPOINT).toMatch(/node .*main\.js &/)
  })

  /** The published image's run contract: `docker run -p 8080:80`, unchanged. */
  it('leaves the port and the command exactly as they were', () => {
    expect(DOCKERFILE).toContain('EXPOSE 80')
    expect(DOCKERFILE).toContain('CMD ["nginx", "-g", "daemon off;"]')
  })
})
