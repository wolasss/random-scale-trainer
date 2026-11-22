import type { SharedSetup } from '../lib/sharedSetup'

type SharedSetupNoticeProps = {
  setup: SharedSetup
  onUse: () => void
  onDismiss: () => void
}

export function SharedSetupNotice({ setup, onUse, onDismiss }: SharedSetupNoticeProps) {
  return (
    <div className="shared-setup-notice" role="status">
      <span>
        Shared setup: {setup.pool.length} {setup.pool.length === 1 ? 'note' : 'notes'}, {setup.bpm} BPM,
        {' '}a note every {setup.beatsPerNote} {setup.beatsPerNote === 1 ? 'beat' : 'beats'}
      </span>
      <div className="shared-setup-actions">
        <button type="button" className="primary-button" onClick={onUse}>Use this setup</button>
        <button type="button" className="ghost-button" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  )
}
