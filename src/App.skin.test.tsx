import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

const skinSelect = () => screen.getByTestId('skin-select') as HTMLSelectElement

describe('skin picker', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-skin')
    document.head
      .querySelectorAll('link[data-skin-font], link[data-skin-font-preload]')
      .forEach((node) => node.remove())
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-skin')
  })

  it('defaults to glass', () => {
    render(<App />)
    expect(skinSelect().value).toBe('glass')
    expect(document.documentElement.getAttribute('data-skin')).toBe('glass')
  })

  it('applies and stores a chosen skin', () => {
    render(<App />)
    fireEvent.change(skinSelect(), { target: { value: 'kwinta' } })

    expect(document.documentElement.getAttribute('data-skin')).toBe('kwinta')
    expect(window.localStorage.getItem(STORAGE_KEYS.skin)).toBe('kwinta')
  })

  it('lazily loads the webfont a skin needs, exactly once', () => {
    render(<App />)
    const link = () => document.head.querySelectorAll('link[data-skin-font="instrument"]')

    expect(link()).toHaveLength(0)
    fireEvent.change(skinSelect(), { target: { value: 'instrument' } })
    expect(link()).toHaveLength(1)

    // Leaving and returning must not append a second copy.
    fireEvent.change(skinSelect(), { target: { value: 'glass' } })
    fireEvent.change(skinSelect(), { target: { value: 'instrument' } })
    expect(link()).toHaveLength(1)
  })

  it('preloads Kwinta self-hosted fonts exactly once', () => {
    render(<App />)
    const links = () => [
      ...document.head.querySelectorAll<HTMLLinkElement>('link[data-skin-font-preload="kwinta"]'),
    ]

    expect(links()).toHaveLength(0)
    fireEvent.change(skinSelect(), { target: { value: 'kwinta' } })
    expect(links().map((link) => link.getAttribute('href')).sort()).toEqual([
      '/fonts/hanken-grotesk-latin.woff2',
      '/fonts/spline-sans-mono-latin.woff2',
    ])

    fireEvent.change(skinSelect(), { target: { value: 'glass' } })
    fireEvent.change(skinSelect(), { target: { value: 'kwinta' } })
    expect(links()).toHaveLength(2)
  })

  it('restores a stored skin on mount', () => {
    window.localStorage.setItem(STORAGE_KEYS.skin, 'warm')
    render(<App />)

    expect(skinSelect().value).toBe('warm')
    expect(document.documentElement.getAttribute('data-skin')).toBe('warm')
  })

  it('ignores an unknown stored skin and falls back to glass', () => {
    window.localStorage.setItem(STORAGE_KEYS.skin, 'neon-disco')
    render(<App />)

    expect(skinSelect().value).toBe('glass')
  })
})
