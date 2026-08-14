import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { BrandLockup } from './BrandLockup'

export type Theme = 'dark' | 'light'

type TopBarProps = {
  theme: Theme
  onToggleTheme: () => void
  /** The install button, when the browser has an install prompt to offer. */
  install?: ReactNode
}

export function TopBar({ theme, onToggleTheme, install }: TopBarProps) {
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
        <button
          type="button"
          className="theme-toggle"
          data-testid="theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </header>
  )
}
