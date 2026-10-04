// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const css = readFileSync(resolve(ROOT, 'src/index.css'), 'utf8')

const block = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css)
  if (!match) throw new Error(`no CSS block found for ${selector}`)
  return match[1]
}

describe('Kwinta skin contracts', () => {
  it('ships and declares both self-hosted variable families', () => {
    const fontFiles = [
      'hanken-grotesk-latin.woff2',
      'hanken-grotesk-latin-ext.woff2',
      'spline-sans-mono-latin.woff2',
      'spline-sans-mono-latin-ext.woff2',
    ]

    for (const file of fontFiles) {
      expect(existsSync(resolve(ROOT, 'public/fonts', file))).toBe(true)
      expect(css).toContain(`url('/fonts/${file}')`)
    }
    expect(css).toContain("font-family: 'Hanken Grotesk'")
    expect(css).toContain("font-family: 'Spline Sans Mono'")
  })

  it('keeps active, positive, and failed states semantically distinct', () => {
    const tokens = block(":root[data-skin='kwinta']")
    expect(tokens).toContain('--accent: #d4db40')
    expect(tokens).toContain('--hit: #89d298')
    expect(tokens).toContain('--miss: #ff837b')
    expect(block("[data-skin='kwinta'] .session-goal-reached")).toContain('color: var(--hit)')
    expect(block("[data-skin='kwinta'] .session-progress-fill.done")).toContain('background: var(--hit)')
    expect(block("[data-skin='kwinta'] .routine-segment.done .routine-segment-fill")).toContain(
      'background: var(--hit)',
    )
    expect(css).toMatch(
      /\[data-skin='kwinta'\] \.mic-readout\[data-status='denied'\],[\s\S]*?color: var\(--miss\)/,
    )
  })

  it('uses a solid checked switch with a dark knob', () => {
    const track = block("[data-skin='kwinta'] .switch[aria-checked='true']")
    expect(track).toContain('background: var(--kwinta-action)')
    expect(track).not.toContain('gradient')
    expect(block("[data-skin='kwinta'] .switch[aria-checked='true'] .switch-knob")).toContain(
      'background: var(--kwinta-on-signal)',
    )
  })

  it('keeps the call dot tied to the primary action in both themes', () => {
    expect(block("[data-skin='kwinta'] .primary-button")).toContain('background: var(--kwinta-action)')
    expect(block("[data-skin='kwinta'] .brand-dot-call")).toContain('background: var(--kwinta-action)')
    expect(block(":root[data-skin='kwinta'][data-theme='light']")).toContain(
      '--brand-accent: var(--kwinta-action)',
    )
  })

  it('opens secondary panels and drops the practice field on compact layouts', () => {
    const panel = block("[data-skin='kwinta'] .panel")
    expect(panel).toContain('border: 0')
    expect(panel).toContain('animation: none')
    expect(panel).not.toContain('border-top:')
    expect(css).toContain("[data-skin='kwinta'] .card-row > .panel,")
    expect(css).toMatch(
      /@media \(max-width: 56\.24rem\) \{[\s\S]*?\[data-skin='kwinta'\] \.practice-stage \{[\s\S]*?background: transparent/,
    )
  })

  it('assigns compact headings and measurements to their intended type roles', () => {
    expect(css).toMatch(
      /\[data-skin='kwinta'\] \.panel-heading h2,[\s\S]*?font-size: 0\.9375rem;[\s\S]*?font-weight: 600/,
    )
    expect(css).toMatch(
      /\[data-skin='kwinta'\] \.target-time,[\s\S]*?\[data-skin='kwinta'\] \.routine-status \{[\s\S]*?font-family: var\(--kwinta-data\)/,
    )
  })
})
