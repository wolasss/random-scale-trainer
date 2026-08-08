import { afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { STORAGE_KEYS } from '../constants'

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
  }
})
