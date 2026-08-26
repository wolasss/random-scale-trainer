import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIC_DEBUG_POLL_MS, MicDebugPanel } from './MicDebugPanel'
import type { MicDebugInfo } from '../hooks/useMicPitch'

const INFO: MicDebugInfo = {
  trackSettings: { echoCancellation: true, noiseSuppression: false, sampleRate: 48000 },
  appContextState: 'running',
  appContextRate: 44100,
  captureContextState: 'interrupted',
  captureContextRate: 48000,
  ownContext: true,
  sampleRate: 48000,
  frames: 41,
  detections: 3,
  lastRms: 0.01,
  lastClarity: 0.97,
  lastFrequency: 196.4,
  lastWithinCue: false,
}

describe('MicDebugPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says what to do while no capture is open', () => {
    render(<MicDebugPanel status="idle" getDebugInfo={() => null} />)

    expect(screen.getByTestId('mic-debug-panel')).toHaveTextContent('no capture open')
  })

  it('prints the applied settings, the contexts and the levels', () => {
    render(<MicDebugPanel status="listening" getDebugInfo={() => INFO} />)

    act(() => {
      vi.advanceTimersByTime(MIC_DEBUG_POLL_MS)
    })

    const panel = screen.getByTestId('mic-debug-panel')
    // The applied truth is the whole point: `ec on` here would mean the
    // browser ignored the raw-capture constraints.
    expect(panel).toHaveTextContent('ec on · ns off · agc ? · track 48000 Hz')
    expect(panel).toHaveTextContent('app ctx: 44100 Hz running · cap ctx: 48000 Hz interrupted (own)')
    expect(panel).toHaveTextContent('level: -40.0 dB · frames: 41 · detections: 3')
    expect(panel).toHaveTextContent('196.4 Hz · clarity 0.97')
  })
})
