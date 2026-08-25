import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpFromBracket, faDownload, faRotate, faXmark } from '@fortawesome/free-solid-svg-icons'

type InstallButtonProps = {
  onInstall: () => void
}

/** Quiet by design: the browser's own install bar is suppressed in its favour. */
export function InstallButton({ onInstall }: InstallButtonProps) {
  return (
    <button type="button" className="install-button" onClick={onInstall} data-testid="install-button">
      <FontAwesomeIcon icon={faDownload} />
      Install
    </button>
  )
}

type IosInstallHintProps = {
  onDismiss: () => void
}

/**
 * iOS fires no install event and offers no API, so the only thing left is to
 * point at the button. One line, dismissible, and remembered.
 */
export function IosInstallHint({ onDismiss }: IosInstallHintProps) {
  return (
    <p className="ios-install-hint" data-testid="ios-install-hint">
      <FontAwesomeIcon icon={faArrowUpFromBracket} aria-hidden="true" />
      <span>
        Add as an app to your home screen: <strong>Share</strong> → <strong>Add to Home Screen</strong>.
      </span>
      <button type="button" className="hint-dismiss" onClick={onDismiss} aria-label="Dismiss install hint">
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </p>
  )
}

type UpdateChipProps = {
  onReload: () => void
  onDismiss: () => void
}

/**
 * A new build is cached and waiting. It is never applied on its own: reloading
 * mid-session would kill a running metronome, and nothing here is urgent enough
 * to be worth that.
 */
export function UpdateChip({ onReload, onDismiss }: UpdateChipProps) {
  return (
    <div className="update-chip" role="status" data-testid="update-chip">
      <button type="button" className="update-chip-action" onClick={onReload}>
        <FontAwesomeIcon icon={faRotate} />
        Update ready — reload
      </button>
      <button type="button" className="hint-dismiss" onClick={onDismiss} aria-label="Dismiss update notice">
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  )
}
