import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppearance } from './useAppearance'
import { SKIN_GROUND } from '../lib/skins'
import { STORAGE_KEYS } from '../constants'

const themeColor = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content
const colorScheme = () => document.documentElement.style.colorScheme

/** jsdom hands every test in the file the same document. */
afterEach(() => {
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
  document.documentElement.style.colorScheme = ''
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-skin')
  vi.restoreAllMocks()
})

describe('useAppearance', () => {
  it('paints the chrome the dark ground by default', () => {
    renderHook(() => useAppearance())

    expect(themeColor()).toBe(SKIN_GROUND.glass.dark)
    expect(colorScheme()).toBe('dark')
  })

  it('paints the chrome the light ground when light is stored', () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'light')
    renderHook(() => useAppearance())

    expect(themeColor()).toBe(SKIN_GROUND.glass.light)
    expect(colorScheme()).toBe('light')
  })

  it('follows the stored skin, not just the theme', () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'light')
    localStorage.setItem(STORAGE_KEYS.skin, 'warm')
    renderHook(() => useAppearance())

    expect(themeColor()).toBe(SKIN_GROUND.warm.light)
    expect(colorScheme()).toBe('light')
  })

  it('follows a switch made after mounting', () => {
    const { result } = renderHook(() => useAppearance())
    expect(themeColor()).toBe(SKIN_GROUND.glass.dark)

    act(() => result.current.setTheme('light'))
    expect(themeColor()).toBe(SKIN_GROUND.glass.light)
    expect(colorScheme()).toBe('light')

    act(() => result.current.setSkin('editorial'))
    expect(themeColor()).toBe(SKIN_GROUND.editorial.light)
  })

  it('reuses the meta the document already ships with', () => {
    const existing = document.createElement('meta')
    existing.name = 'theme-color'
    existing.content = SKIN_GROUND.glass.dark
    document.head.appendChild(existing)

    localStorage.setItem(STORAGE_KEYS.theme, 'light')
    renderHook(() => useAppearance())
    renderHook(() => useAppearance())

    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1)
    expect(existing.content).toBe(SKIN_GROUND.glass.light)
  })
})

/**
 * The bootstrap can't import a module, so it carries its own copy of the ground
 * table. Reading the shipped bytes and running them against jsdom is what keeps
 * that copy honest.
 */
describe('index.html bootstrap', () => {
  // Under jsdom `import.meta.url` is an http URL, so the project root — which
  // vitest also uses as its own — is the way back to the shipped file.
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  const source = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]

  const run = () => {
    // A colour no skin uses, so every assertion below is about a write the
    // script made rather than about the value it started from.
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#ff00ff'
    document.head.appendChild(meta)

    expect(source).toBeTruthy()
    new Function(source as string)()
  }

  it('leaves a first-time visitor on the default dark ground', () => {
    run()

    expect(themeColor()).toBe(SKIN_GROUND.glass.dark)
    expect(colorScheme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('applies the stored theme and skin before first paint', () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'light')
    localStorage.setItem(STORAGE_KEYS.skin, 'warm')
    run()

    expect(themeColor()).toBe(SKIN_GROUND.warm.light)
    expect(colorScheme()).toBe('light')
    expect(document.documentElement.getAttribute('data-skin')).toBe('warm')
  })

  it('still declares a scheme when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    run()

    expect(colorScheme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(themeColor()).toBe(SKIN_GROUND.glass.dark)
  })
})
