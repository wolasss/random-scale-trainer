import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHeart, faMoon, faMugHot, faSun } from '@fortawesome/free-solid-svg-icons'
import { faGithub, faInstagram } from '@fortawesome/free-brands-svg-icons'
import { version } from '../../package.json'
import { SKINS, SKIN_LABELS, type Skin } from '../lib/skins'
import type { Theme } from './TopBar'

type FooterProps = {
  skin: Skin
  onSkinChange: (skin: Skin) => void
  /** Only the stage reading passes these: it has no header to hold the toggle. */
  theme?: Theme
  onToggleTheme?: () => void
}

export function Footer({ skin, onSkinChange, theme, onToggleTheme }: FooterProps) {
  return (
    <footer className="app-footer">
      <p>
        Made with <FontAwesomeIcon icon={faHeart} className="heart-icon" /> by Adam Wolski
      </p>
      <p className="app-version">v{version}</p>
      <div className="footer-links">
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
        {theme && onToggleTheme ? (
          <button
            type="button"
            className="theme-toggle footer-theme-toggle"
            data-testid="footer-theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        ) : null}
        <a
          className="social-link"
          href="https://github.com/wolasss/random-scale-trainer"
          target="_blank"
          rel="noreferrer"
          aria-label="Project on GitHub"
          title="GitHub"
        >
          <FontAwesomeIcon icon={faGithub} />
        </a>
        <a
          className="social-link"
          href="https://www.instagram.com/wolasso"
          target="_blank"
          rel="noreferrer"
          aria-label="wolasso on Instagram"
          title="Instagram"
        >
          <FontAwesomeIcon icon={faInstagram} />
        </a>
        <a
          className="coffee-button"
          href="https://www.buymeacoffee.com/wolas"
          target="_blank"
          rel="noreferrer"
        >
          <FontAwesomeIcon icon={faMugHot} /> Buy me a coffee
        </a>
      </div>
    </footer>
  )
}
