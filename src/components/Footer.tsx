import { useState } from 'react'
import { Icon } from './ui/Icon'
import { faBug, faHeart, faMugHot } from '@fortawesome/free-solid-svg-icons'
import { faGithub, faInstagram } from '@fortawesome/free-brands-svg-icons'
import { version } from '../../package.json'
import { SKINS, SKIN_LABELS, type Skin } from '../lib/skins'
import { BugReportModal } from './BugReportModal'
import type { Theme } from './TopBar'
import { ThemeToggle } from './ui/ThemeToggle'

type FooterProps = {
  skin: Skin
  onSkinChange: (skin: Skin) => void
  /** Only the stage reading passes these: it has no header to hold the toggle. */
  theme?: Theme
  onToggleTheme?: () => void
}

export function Footer({ skin, onSkinChange, theme, onToggleTheme }: FooterProps) {
  // Kept here rather than lifted: the footer renders twice — once under the
  // page and once inside the practice sheet — and both of them need it.
  const [reporting, setReporting] = useState(false)

  return (
    <footer className="app-footer">
      <p>
        Made with <Icon icon={faHeart} className="heart-icon" /> by Adam Wolski
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
          <ThemeToggle
            theme={theme}
            onToggle={onToggleTheme}
            className="footer-theme-toggle"
            testId="footer-theme-toggle"
          />
        ) : null}
        {/* Icon-only, and shaped like the links beside it: the footer is one
            line on a desktop and wraps to two on a phone, and a labelled
            button here would cost it a third. */}
        <button
          type="button"
          className="social-link bug-report-button"
          onClick={() => setReporting(true)}
          aria-label="Report a bug"
          title="Report a bug"
          data-testid="report-bug-button"
        >
          <Icon icon={faBug} />
        </button>
        <a
          className="social-link"
          href="https://github.com/wolasss/random-scale-trainer"
          target="_blank"
          rel="noreferrer"
          aria-label="Project on GitHub"
          title="GitHub"
        >
          <Icon icon={faGithub} />
        </a>
        <a
          className="social-link"
          href="https://www.instagram.com/wolasso"
          target="_blank"
          rel="noreferrer"
          aria-label="wolasso on Instagram"
          title="Instagram"
        >
          <Icon icon={faInstagram} />
        </a>
        <a
          className="coffee-button"
          href="https://www.buymeacoffee.com/wolas"
          target="_blank"
          rel="noreferrer"
        >
          <Icon icon={faMugHot} /> Buy me a coffee
        </a>
      </div>

      {reporting ? <BugReportModal version={version} onDismiss={() => setReporting(false)} /> : null}
    </footer>
  )
}
