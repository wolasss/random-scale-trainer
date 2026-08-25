import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import type { Theme } from '../TopBar'

type ThemeToggleProps = {
  theme: Theme
  onToggle: () => void
  className?: string
  testId?: string
}

/**
 * The dark/light switch. The footer renders a second copy because the installed
 * stage view has no header — the two must never disagree, so they share this.
 */
export function ThemeToggle({ theme, onToggle, className, testId }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className={className ? `theme-toggle ${className}` : 'theme-toggle'}
      data-testid={testId ?? 'theme-toggle'}
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
