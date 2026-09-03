import { Icon } from './ui/Icon'
import { faArrowUpFromBracket, faDownload, faEllipsisVertical, faRotate, faXmark } from '@fortawesome/free-solid-svg-icons'

type InstallButtonProps = {
  onInstall: () => void
}

/** Quiet by design: the browser's own install bar is suppressed in its favour. */
export function InstallButton({ onInstall }: InstallButtonProps) {
  return (
    <button type="button" className="install-button" onClick={onInstall} data-testid="install-button">
      <Icon icon={faDownload} />
      Install
    </button>
  )
}

type IosInstallHintProps = {
  onDismiss: () => void
}

/**
 * Opens the browser's own share sheet on this page — on iOS, the sheet the
 * Add to Home Screen row lives in. A share that comes back refused is not an
 * error here: the user closing the sheet is the normal way out of it, and the
 * written instructions around the button never left.
 */
const openShareSheet = () => {
  void navigator.share({ title: document.title, url: window.location.href }).catch(() => undefined)
}

/**
 * iOS fires no install event and offers no API, so the only thing left is to
 * point at the button. One line, dismissible, and remembered.
 *
 * Where the browser can open a share sheet from script, the Share step is a
 * real button that does so — one tap saved, and the sheet lands with the page
 * already on it. The words stay either way: whether the scripted sheet carries
 * the Add to Home Screen row is the browser's call, so the printed route
 * through the toolbar has to keep working on its own.
 */
export function IosInstallHint({ onDismiss }: IosInstallHintProps) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <p className="ios-install-hint" data-testid="ios-install-hint">
      <Icon icon={faArrowUpFromBracket} aria-hidden="true" />
      <span>
        Add as an app to your home screen:{' '}
        {canShare ? (
          <button type="button" className="hint-share" onClick={openShareSheet} data-testid="ios-share-button">
            Share
          </button>
        ) : (
          <strong>Share</strong>
        )}{' '}
        → <strong>Add to Home Screen</strong>.
      </span>
      <button type="button" className="hint-dismiss" onClick={onDismiss} aria-label="Dismiss install hint">
        <Icon icon={faXmark} />
      </button>
    </p>
  )
}

type AndroidInstallHintProps = {
  onDismiss: () => void
}

/**
 * The iOS hint's sibling, for the Android browsers that never fire an install
 * event — Firefox, mostly. Installing there lives in the browser's own menu,
 * which no API can open and no share sheet stands in for, so this one is words
 * all the way: the share sheet on Android carries no install row, and a
 * button that opened it would point at the wrong place. Chromium never sees
 * this — it gets the real install button instead.
 */
export function AndroidInstallHint({ onDismiss }: AndroidInstallHintProps) {
  return (
    <p className="ios-install-hint" data-testid="android-install-hint">
      <Icon icon={faEllipsisVertical} aria-hidden="true" />
      <span>
        Add as an app to your home screen: <strong>browser menu</strong> → <strong>Add to Home screen</strong>.
      </span>
      <button type="button" className="hint-dismiss" onClick={onDismiss} aria-label="Dismiss install hint">
        <Icon icon={faXmark} />
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
        <Icon icon={faRotate} />
        Update ready — reload
      </button>
      <button type="button" className="hint-dismiss" onClick={onDismiss} aria-label="Dismiss update notice">
        <Icon icon={faXmark} />
      </button>
    </div>
  )
}
