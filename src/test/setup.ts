import { afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import './consoleGuard'
import { cleanup } from '@testing-library/react'
import { STORAGE_KEYS } from '../constants'

// Captured once per test file, before any suite has had a chance to install a
// fake, so afterEach can put back exactly what jsdom shipped with.
const ORIGINAL_MATCH_MEDIA =
  typeof window === 'undefined' ? undefined : Object.getOwnPropertyDescriptor(window, 'matchMedia')

/**
 * Every test renders as somebody who has practised before, so the setup cards
 * are on screen. The first-run fold is a property of one launch, not of the
 * app, and making fifty tests open it would test the fold fifty times and
 * everything else once. The tests that are about the fold clear this key.
 */
beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEYS.setupRevealed, 'true')
  }
})

afterEach(() => {
  cleanup()
  // Guarded: node-environment test files have no window
  if (typeof window !== 'undefined') {
    window.localStorage.clear()

    // A suite installing a fake matchMedia, or letting the app paint the
    // document, must not leak either into whatever test runs next.
    if (ORIGINAL_MATCH_MEDIA) {
      Object.defineProperty(window, 'matchMedia', ORIGINAL_MATCH_MEDIA)
    } else {
      Reflect.deleteProperty(window, 'matchMedia')
    }
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-skin')
    document.documentElement.removeAttribute('data-stage')
    document.head.querySelectorAll('link[data-skin-font]').forEach((node) => node.remove())
  }
})
