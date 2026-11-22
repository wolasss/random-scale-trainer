import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareSetup } from './ShareSetup'

const setup = { pool: [0, 4, 7], bpm: 90, beatsPerNote: 2 } as const
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const originalUrl = window.location.href
const originalState: unknown = window.history.state
const link = () => `${window.location.origin}/practice?pool=0%2C4%2C7&bpm=90&beats=2`
const stubClipboard = (clipboard: unknown) => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
const share = async () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share setup' })))

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  window.history.replaceState(originalState, '', originalUrl)
})

describe('Share setup', () => {
  it('copies only the setup on the current origin and path without changing the URL', async () => {
    window.history.replaceState(null, '', '/practice?challenge=band&private=discard#hash')
    const before = window.location.href
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ writeText })
    render(<ShareSetup setup={setup} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await share()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(link())
    expect(screen.getByRole('status')).toHaveTextContent('Link copied')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(window.location.href).toBe(before)
  })

  it.each(['rejected', 'absent', 'missing method', 'synchronous throw'])('offers a selectable read-only link when clipboard is %s', async (failure) => {
    window.history.replaceState(null, '', '/practice')
    const writeText = failure === 'synchronous throw' ? vi.fn(() => { throw new Error('Denied') }) : vi.fn().mockRejectedValue(new Error('Denied'))
    stubClipboard(failure === 'absent' ? undefined : failure === 'missing method' ? {} : { writeText })
    render(<ShareSetup setup={setup} />)
    await share()
    expect(screen.getByRole('status')).toHaveTextContent('Copy this link')
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Setup link' })
    expect(input).toHaveValue(link())
    expect(input.readOnly).toBe(true)
    fireEvent.focus(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    input.setSelectionRange(2, 2)
    fireEvent.click(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it('clears feedback during retry and shows success only after the write resolves', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('Denied'))
    stubClipboard({ writeText })
    render(<ShareSetup setup={setup} />)
    await share()
    let finishWrite: (() => void) | undefined
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finishWrite = resolve }))
    await share()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByRole('textbox')).toBeNull()
    await act(async () => finishWrite!())
    expect(screen.getByRole('status')).toHaveTextContent('Link copied')
  })

  it('drops old feedback and pending results when settings change', async () => {
    let finishWrite: (() => void) | undefined
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockImplementationOnce(() => new Promise<void>((resolve) => { finishWrite = resolve }))
    stubClipboard({ writeText })
    const { rerender } = render(<ShareSetup setup={setup} />)
    await share()
    rerender(<ShareSetup setup={{ ...setup, bpm: 100 }} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await share()
    rerender(<ShareSetup setup={setup} />)
    await act(async () => finishWrite!())
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
