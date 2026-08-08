/**
 * The callnote.app mark: two stacked dots — the call and its response — beside
 * the wordmark.
 *
 * Live text rather than an SVG, for three reasons: it stays selectable and
 * readable to a screen reader, it scales with whatever type size its container
 * gives it (every measurement in the CSS is in `em`), and it re-inks itself
 * from the `--brand-*` tokens, which alias the active skin's own palette. One
 * component covers every skin; see brand/callnote-brand-guide.md.
 */

type BrandLockupProps = {
  /**
   * Drops the `.app` suffix. For placements too tight to carry it — the guide
   * forbids it at icon size, where it would only close up into a smudge.
   */
  compact?: boolean
}

export function BrandLockup({ compact = false }: BrandLockupProps) {
  return (
    <span className="brand-lockup" data-testid="brand-lockup">
      <span className="brand-dots" aria-hidden="true">
        <span className="brand-dot brand-dot-call" />
        <span className="brand-dot brand-dot-response" />
      </span>
      {/* The suffix is nested inside the wordmark, never a sibling of the dot
          column: as a flex child it would inherit the column's 0.22em gap and
          drift away from the final 'e'. */}
      <span className="brand-wordmark">
        callnote
        {!compact && <span className="brand-suffix">.app</span>}
      </span>
    </span>
  )
}
