import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  // Guarded: node-environment test files have no window
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  }
})
