import { Component, type ErrorInfo, type ReactNode } from 'react'
import { removeRaw } from '../lib/storage'
import { STORAGE_KEYS } from '../constants'

type AppErrorBoundaryProps = {
  children: ReactNode
  /** Injectable for tests; otherwise the browser's own reload. */
  reload?: () => void
}

type AppErrorBoundaryState = {
  failed: boolean
}

/**
 * The last line of defense: if App itself throws while rendering, this is what
 * stands between the user and a blank white page with no way back in. It has to
 * stay dependency-light — importing app modules risks the fallback crashing for
 * the same reason the app did — so it only reaches for the storage helpers and
 * constants, not App state or hooks.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App crashed during render', error, info)
  }

  reload = (): void => {
    const reload = this.props.reload ?? (() => window.location.reload())
    reload()
  }

  startFresh = (): void => {
    for (const key of Object.values(STORAGE_KEYS)) {
      removeRaw(key)
    }
    this.reload()
  }

  render() {
    if (!this.state.failed) {
      return this.props.children
    }

    return (
      <div className="app-error" role="alert">
        <h1 className="app-error-title">Something broke</h1>
        <p className="app-error-copy">
          The app hit an error it can’t draw past. Reloading may fix it — if it keeps happening, “Start fresh”
          clears saved practice settings on this device and reloads.
        </p>
        <div className="app-error-actions">
          <button type="button" className="primary-button" onClick={this.reload}>
            Reload
          </button>
          <button type="button" className="ghost-button" onClick={this.startFresh}>
            Start fresh
          </button>
        </div>
      </div>
    )
  }
}
