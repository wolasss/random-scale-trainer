import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'

export type Theme = 'dark' | 'light'

type TopBarProps = {
  theme: Theme
  onToggleTheme: () => void
}

export function TopBar({ theme, onToggleTheme }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="header-copy">
        <h1>Random note trainer</h1>
        <p className="lede">Notes are called on the beat. Find them on the neck before the next one lands.</p>
      </div>
      <div className="header-side">
        <div className="key-hints" aria-hidden="true">
          <span>
            <kbd>Space</kbd> play / pause
          </span>
          <span>
            <kbd>←</kbd> <kbd>→</kbd> tempo
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
