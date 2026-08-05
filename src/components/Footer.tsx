import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHeart, faMugHot } from '@fortawesome/free-solid-svg-icons'
import { faGithub, faInstagram } from '@fortawesome/free-brands-svg-icons'
import { version } from '../../package.json'

export function Footer() {
  return (
    <footer className="app-footer">
      <p>
        Made with <FontAwesomeIcon icon={faHeart} className="heart-icon" /> by Adam Wolski
      </p>
      <p className="app-version">v{version}</p>
      <div className="footer-links">
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
