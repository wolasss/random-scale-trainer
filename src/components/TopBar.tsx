import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { SKINS, SKIN_LABELS, type Skin } from '../lib/skins'

export type Theme = 'dark' | 'light'

type TopBarProps = {
  theme: Theme
  onToggleTheme: () => void
  /** The current visual skin, and a setter for the picker. */
  skin: Skin
  onSkinChange: (skin: Skin) => void
  /** The install button, when the browser has an install prompt to offer. */
  install?: ReactNode
}

export function TopBar({ theme, onToggleTheme, skin, onSkinChange, install }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="header-copy">
        <h1>Random note trainer</h1>
        <p className="lede">Notes are called on the beat. Find them on the neck before the next one lands.</p>
      </div>
      <div className="header-side">
        {install}
        <label className="skin-picker">
          <span className="skin-picker-label">Style</span>
          <select
            className="preset-select skin-select"
            data-testid="skin-select"
            value={skin}
            onChange={(event) => onSkinChange(event.target.value as Skin)}
            aria-label="Visual style"
          >
            {SKINS.map((option) => (
              <option key={option} value={option}>
                {SKIN_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
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
