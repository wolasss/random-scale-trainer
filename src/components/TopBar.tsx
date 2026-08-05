import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'

export type Theme = 'dark' | 'light'

type TopBarProps = {
  theme: Theme
  onToggleTheme: () => void
}

export function TopBar({ theme, onToggleTheme }: TopBarProps) {
  return (
    <div className="topbar">
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
  )
}
