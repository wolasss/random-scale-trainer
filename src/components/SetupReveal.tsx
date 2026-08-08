import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faSliders } from '@fortawesome/free-solid-svg-icons'

type SetupRevealProps = {
  onReveal: () => void
}

/**
 * Stands in for the whole setup stack on a first run. The defaults are playable
 * as they are, so a page that opens with seven cards of controls is answering a
 * question nobody has asked yet — this is the one row that says where they went.
 *
 * It is a one-time fold, not an accordion: the first start press opens the
 * setup for good, and so does this button. Somebody who has practised once
 * knows the controls exist, and hiding them again would only cost them a click.
 */
export function SetupReveal({ onReveal }: SetupRevealProps) {
  return (
    <button type="button" className="panel setup-reveal" data-testid="setup-reveal" onClick={onReveal}>
      <span className="setup-reveal-icon">
        <FontAwesomeIcon icon={faSliders} />
      </span>
      <span className="setup-reveal-copy">
        <span className="setup-reveal-title">Set up practice</span>
        <span className="setup-reveal-subtitle">Notes, tempo, saved setups, session goal — all optional.</span>
      </span>
      <FontAwesomeIcon className="setup-reveal-chevron" icon={faChevronDown} />
    </button>
  )
}
