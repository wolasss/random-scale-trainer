import type { ReactNode } from 'react'
import { BrandLockup } from './BrandLockup'
import { ThemeToggle } from './ui/ThemeToggle'
import { useHardwareKeyboard } from '../hooks/useHardwareKeyboard'

export type Theme = 'dark' | 'light'

type TopBarProps = {
  theme: Theme
  onToggleTheme: () => void
  /** The install button, when the browser has an install prompt to offer. */
  install?: ReactNode
}

export function TopBar({ theme, onToggleTheme, install }: TopBarProps) {
  // The hints name keys a touch-only browser has no way to press: keep them for
  // the machines that can act on them.
  const hasKeyboard = useHardwareKeyboard()

  return (
    <header className="topbar">
      <div className="header-copy">
        <h1>
          <BrandLockup />
        </h1>
        <p className="lede">Fretboard fluency, one beat at a time.</p>
      </div>
      <div className="header-side">
        {install}
        {hasKeyboard && (
          <div className="key-hints">
            <span>
              <kbd>Space</kbd> play / pause
            </span>
            <span>
              <kbd>←</kbd> <kbd>→</kbd> tempo
            </span>
            <span>
              <kbd>R</kbd> reset
            </span>
          </div>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  )
}
