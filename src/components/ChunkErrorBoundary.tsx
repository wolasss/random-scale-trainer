import { Component, type ErrorInfo, type ReactNode } from 'react'

type ChunkErrorBoundaryProps = {
  children: ReactNode
}

type ChunkErrorBoundaryState = {
  failed: boolean
}

/**
 * A lazily-loaded chunk that fails to fetch — offline, or a stale service
 * worker precache missing the file — throws during render, and `Suspense`
 * does not catch that. Without this, one missing challenge chunk would
 * unmount the whole app instead of just leaving the challenge UI off.
 */
export class ChunkErrorBoundary extends Component<ChunkErrorBoundaryProps, ChunkErrorBoundaryState> {
  state: ChunkErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ChunkErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Failed to load a lazy chunk', error, info)
  }

  render() {
    if (this.state.failed) {
      return null
    }

    return this.props.children
  }
}
