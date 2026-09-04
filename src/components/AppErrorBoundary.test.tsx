import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../constants'
import { allowConsole } from '../test/consoleGuard'
import { withFakeStorage } from '../test/blockedStorage'
import { AppErrorBoundary } from './AppErrorBoundary'

const Bomb = () => {
  throw new Error('render failed')
}

describe('AppErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <div data-testid="child">hi</div>
      </AppErrorBoundary>,
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the fallback with its actions when a child throws', () => {
    allowConsole('error')
    const reload = vi.fn()

    render(
      <AppErrorBoundary reload={reload}>
        <Bomb />
      </AppErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Something broke')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start fresh' })).toBeInTheDocument()
  })

  it('reloads when Reload is pressed', async () => {
    allowConsole('error')
    const reload = vi.fn()
    const user = userEvent.setup()

    render(
      <AppErrorBoundary reload={reload}>
        <Bomb />
      </AppErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: 'Reload' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('clears exactly the app storage keys and reloads when Start fresh is pressed', async () => {
    allowConsole('error')
    const reload = vi.fn()
    const user = userEvent.setup()

    for (const key of Object.values(STORAGE_KEYS)) {
      window.localStorage.setItem(key, 'x')
    }
    window.localStorage.setItem('some-other-app', 'keep-me')

    render(
      <AppErrorBoundary reload={reload}>
        <Bomb />
      </AppErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: 'Start fresh' }))

    for (const key of Object.values(STORAGE_KEYS)) {
      expect(window.localStorage.getItem(key)).toBeNull()
    }
    expect(window.localStorage.getItem('some-other-app')).toBe('keep-me')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('still clears the other keys and reloads when one removal throws', async () => {
    allowConsole('error')
    const reload = vi.fn()
    const user = userEvent.setup()

    const keys = Object.values(STORAGE_KEYS)
    const throwingKey = keys[0]
    const entries = new Map<string, string>()
    for (const key of keys) {
      entries.set(key, 'x')
    }
    entries.set('some-other-app', 'keep-me')

    const restore = withFakeStorage({
      get length() {
        return entries.size
      },
      clear: () => entries.clear(),
      getItem: (key) => entries.get(key) ?? null,
      key: () => null,
      removeItem: (key) => {
        if (key === throwingKey) {
          throw new DOMException('The operation is insecure.', 'SecurityError')
        }
        entries.delete(key)
      },
      setItem: (key, value) => entries.set(key, value),
    })

    try {
      render(
        <AppErrorBoundary reload={reload}>
          <Bomb />
        </AppErrorBoundary>,
      )

      await user.click(screen.getByRole('button', { name: 'Start fresh' }))

      for (const key of keys) {
        if (key === throwingKey) continue
        expect(entries.has(key)).toBe(false)
      }
      expect(entries.get('some-other-app')).toBe('keep-me')
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      restore()
    }
  })

  it('is reachable by keyboard and announced to assistive tech', () => {
    allowConsole('error')
    const reload = vi.fn()

    render(
      <AppErrorBoundary reload={reload}>
        <Bomb />
      </AppErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()

    const reloadButton = screen.getByRole('button', { name: 'Reload' })
    const startFreshButton = screen.getByRole('button', { name: 'Start fresh' })

    reloadButton.focus()
    expect(reloadButton).toHaveFocus()

    startFreshButton.focus()
    expect(startFreshButton).toHaveFocus()
  })
})
