import { Component, type ErrorInfo, type ReactNode } from 'react'

type ChunkErrorBoundaryProps = {
  children: ReactNode
  /** Injectable for tests; otherwise the browser's own reload. */
  reload?: () => void
  /** Pin the notice to the viewport, for a slot that has no box of its own on screen (the nickname prompt is a fixed overlay). */
  overlay?: boolean
}

type ChunkErrorBoundaryState = {
  failed: boolean
}

/**
 * A lazily-loaded chunk that fails to fetch — offline, or a stale service
 * worker precache missing the file — throws during render, and `Suspense`
 * does not catch that. Without this, one missing challenge chunk would
 * unmount the whole app instead of just leaving the challenge UI off. Once a
 * new build has activated in this tab, `React.lazy` keeps the rejected
 * import cached, so the chunk stays missing until a reload — this shows a
 * notice with a way to trigger one instead of silently dropping the UI.
 */
export class ChunkErrorBoundary extends Component<ChunkErrorBoundaryProps, ChunkErrorBoundaryState> {
  state: ChunkErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ChunkErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Failed to load a lazy chunk', error, info)
  }

  reload = (): void => {
    const reload = this.props.reload ?? (() => window.location.reload())
    reload()
  }

  render() {
    if (this.state.failed) {
      return (
        <div className={this.props.overlay ? 'chunk-error chunk-error-overlay' : 'chunk-error'} role="alert">
          <p className="chunk-error-copy">The challenge couldn’t load. Reloading picks up the latest version.</p>
          <button type="button" className="primary-button" onClick={this.reload}>
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
