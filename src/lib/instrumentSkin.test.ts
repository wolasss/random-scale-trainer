// @vitest-environment node
import { readFileSync } from 'node:fs'
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

const tokens = (selector: string): Record<string, string> =>
  Object.fromEntries(
    [...block(selector).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  )

type Rgba = { red: number; green: number; blue: number; alpha: number }

const parseColor = (value: string): Rgba => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (hex) {
    return { red: parseInt(hex[1], 16), green: parseInt(hex[2], 16), blue: parseInt(hex[3], 16), alpha: 1 }
  }
  const rgba = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(value)
  if (rgba) {
    return { red: Number(rgba[1]), green: Number(rgba[2]), blue: Number(rgba[3]), alpha: Number(rgba[4] ?? 1) }
  }
  throw new Error(`unsupported colour ${value}`)
}

// WCAG 2.x relative luminance of an opaque colour.
const luminance = ({ red, green, blue }: Rgba): number => {
  const linear = (channel: number) => {
    const scaled = channel / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}

const contrast = (foreground: string, background: string): number => {
  const ink = parseColor(foreground)
  const ground = parseColor(background)
  const over = (inkChannel: number, groundChannel: number) =>
    inkChannel * ink.alpha + groundChannel * (1 - ink.alpha)
  const composited: Rgba = {
    red: over(ink.red, ground.red),
    green: over(ink.green, ground.green),
    blue: over(ink.blue, ground.blue),
    alpha: 1,
  }
  const [lighter, darker] = [luminance(composited), luminance(ground)].sort((first, second) => second - first)
  return (lighter + 0.05) / (darker + 0.05)
}

const darkTokens = tokens(":root[data-skin='instrument']")
const themes = {
  dark: darkTokens,
  light: { ...darkTokens, ...tokens(":root[data-skin='instrument'][data-theme='light']") },
}

describe('Instrument skin contracts', () => {
  it('prints the next chip on the dark readout glass, with LCD ink', () => {
    expect(block("[data-skin='instrument'] .next-chip")).toContain('background: var(--lcd-bg)')
    expect(block("[data-skin='instrument'] .next-chip-value")).toContain('color: var(--lcd-amber)')
    expect(block("[data-skin='instrument'] .next-chip .chip-label")).toContain('color: var(--lcd-ink-soft)')
  })

  it.each(Object.entries(themes))('%s: the next-chip label holds 4.5:1 on the readout glass', (_theme, values) => {
    expect(contrast(values['--lcd-ink-soft'], values['--lcd-bg'])).toBeGreaterThanOrEqual(4.5)
  })
})
