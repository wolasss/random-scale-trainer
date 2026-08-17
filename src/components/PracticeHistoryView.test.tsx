import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PracticeHistoryView } from './PracticeHistoryView'
import { MAX_BACKUP_BYTES, serializeBackup, type PracticeHistory } from '../lib/history'

const TODAY = new Date(2026, 1, 14, 12)

const history: PracticeHistory = {
  days: {
    '2026-01-20': { sec: 30 * 60, notes: 200 },
    '2026-02-10': { sec: 20, notes: 2 },
    '2026-02-13': { sec: 15 * 60, notes: 80 },
    '2026-02-14': { sec: 10 * 60, notes: 60 },
  },
}

const renderView = (overrides: Partial<Parameters<typeof PracticeHistoryView>[0]> = {}) => {
  const props = {
    open: true,
    history,
    onClose: vi.fn(),
    getBackup: vi.fn(() => 'BACKUP-FILE-TEXT'),
    onImport: vi.fn(),
    today: TODAY,
    ...overrides,
  }

  return { ...render(<PracticeHistoryView {...props} />), props }
}

/**
 * jsdom has both halves of the object-URL API, but a real blob URL handed to a
 * real anchor click would try to navigate — so the download is stubbed end to
 * end and the file is read back out of the blob it was handed.
 */
const captureDownload = () => {
  const captured: { blob: Blob | null; name: string | null } = { blob: null, name: null }
  const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  const revoked: string[] = []

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      captured.blob = blob

      return 'blob:practice-log'
    },
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: (url: string) => revoked.push(url),
  })

  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    captured.name = this.download
  })

  const restore = () => {
    click.mockRestore()
    for (const [name, descriptor] of [
      ['createObjectURL', createDescriptor],
      ['revokeObjectURL', revokeDescriptor],
    ] as const) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(URL, name)
      } else {
        Object.defineProperty(URL, name, descriptor)
      }
    }
  }

  return { captured, revoked, restore }
}

const fileOf = (contents: string) => new File([contents], 'backup.json', { type: 'application/json' })

/**
 * A file the picker would hand back that must never be read — faked rather than
 * allocated, so the size case doesn't cost four megabytes to assert. The `text`
 * spy is what makes these tests about the guard and not about the error string.
 */
const unreadableFile = (overrides: { size?: number; type?: string }) => {
  const file = fileOf('{}')
  const text = vi.fn(async () => '{}')
  Object.defineProperty(file, 'text', { value: text })
  if (overrides.size !== undefined) {
    Object.defineProperty(file, 'size', { value: overrides.size })
  }
  if (overrides.type !== undefined) {
    Object.defineProperty(file, 'type', { value: overrides.type })
  }

  return { file, text }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PracticeHistoryView', () => {
  it('stays out of the tree until it is opened', () => {
    renderView({ open: false })

    expect(screen.queryByTestId('practice-history-view')).toBeNull()
  })

  it('opens through the body, clear of the card that owns it', () => {
    // It is opened from inside a .panel, and a panel keeps the transform its
    // entry animation ends on — which would make it the containing block for
    // the fixed overlay and pin a full-screen sheet inside one card.
    render(
      <div className="panel">
        <PracticeHistoryView
          open
          history={history}
          today={TODAY}
          onClose={vi.fn()}
          getBackup={vi.fn(() => '')}
          onImport={vi.fn()}
        />
      </div>,
    )

    expect(screen.getByTestId('practice-history-view').parentElement).toBe(document.body)
  })

  it('leads with the streak and what has been put in altogether', () => {
    renderView()

    expect(screen.getByTestId('history-streak')).toHaveTextContent('2 days in a row')
    expect(screen.getByTestId('history-best')).toHaveTextContent('best 2')
    expect(screen.getByTestId('history-totals')).toHaveTextContent('4 days practised · 55 min · 342 notes')
  })

  it('draws a month for every month back to the first day on record', () => {
    renderView()

    expect(screen.getByRole('heading', { name: 'February 2026' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'January 2026' })).toBeInTheDocument()
    expect(document.querySelectorAll('.practice-history-month')).toHaveLength(2)
  })

  it('names every day, practised or not', () => {
    renderView()

    expect(screen.getByLabelText('2026-02-14: 10 min')).toHaveClass('is-today')
    expect(screen.getByLabelText('2026-02-13: 15 min')).toBeInTheDocument()
    expect(screen.getByLabelText('2026-02-12: no practice')).toBeInTheDocument()
    expect(screen.getByLabelText('2026-02-10: under a minute')).toBeInTheDocument()
    // The month runs to its end; the days it hasn't reached say so.
    expect(screen.getByLabelText('2026-02-28: no practice')).toHaveClass('is-future')
  })

  it('shades a day against the busiest one on record', () => {
    renderView()

    // 30 minutes is the busiest day, so January's is full strength and the
    // 10-minute day today lands two steps below it.
    expect(screen.getByLabelText('2026-01-20: 30 min')).toHaveClass('is-l4')
    expect(screen.getByLabelText('2026-02-14: 10 min')).toHaveClass('is-l2')
    expect(screen.getByLabelText('2026-02-12: no practice')).toHaveClass('is-l0')
  })

  it('reads today out under the calendar before anything is picked', () => {
    renderView()

    expect(screen.getByTestId('history-day')).toHaveTextContent('2026-02-14 · 10 min · 60 notes')
  })

  it('reads out whichever day is tapped', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByLabelText('2026-02-13: 15 min'))
    expect(screen.getByTestId('history-day')).toHaveTextContent('2026-02-13 · 15 min · 80 notes')
    expect(screen.getByLabelText('2026-02-13: 15 min')).toHaveClass('is-selected')
    expect(screen.getByLabelText('2026-02-14: 10 min')).not.toHaveClass('is-selected')

    // A day with nothing on it is still an answer, not a dead square.
    await user.click(screen.getByLabelText('2026-02-12: no practice'))
    expect(screen.getByTestId('history-day')).toHaveTextContent('2026-02-12 · no practice · 0 notes')
  })

  it('puts the days within reach of the keyboard', async () => {
    const user = userEvent.setup()
    renderView()

    expect(document.activeElement).toBe(screen.getByTestId('practice-history-close'))

    await user.tab()

    expect(document.activeElement).toHaveClass('practice-history-cell')
    expect(document.activeElement?.tagName).toBe('BUTTON')
  })

  it('leaves the days it hasn’t reached inert', () => {
    renderView()

    const future = screen.getByLabelText('2026-02-28: no practice')
    expect(future.tagName).not.toBe('BUTTON')

    fireEvent.click(future)

    expect(screen.getByTestId('history-day')).toHaveTextContent('2026-02-14 · 10 min · 60 notes')
  })

  it('closes on Escape', () => {
    const { props } = renderView()

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })

    expect(props.onClose).toHaveBeenCalled()
  })

  it('opens on the close button and keeps Tab inside itself', () => {
    renderView()

    const close = screen.getByTestId('practice-history-close')
    expect(document.activeElement).toBe(close)

    const last = screen.getByTestId('history-import')
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('downloads whatever the backup handler gives it, under a dated name', async () => {
    const download = captureDownload()

    try {
      const { props } = renderView()
      fireEvent.click(screen.getByTestId('history-export'))

      expect(props.getBackup).toHaveBeenCalledTimes(1)
      expect(download.captured.name).toBe('callnote-practice-log-2026-02-14.json')
      expect(await download.captured.blob?.text()).toBe('BACKUP-FILE-TEXT')
      expect(download.revoked).toEqual(['blob:practice-log'])
    } finally {
      download.restore()
    }
  })

  it('hands a valid backup over, sanitised', async () => {
    const { props } = renderView()

    const backup = serializeBackup(
      { days: { '2026-02-01': { sec: 600, notes: 12 }, 'not-a-day': { sec: 600, notes: 12 } } },
      TODAY,
    )
    fireEvent.change(screen.getByTestId('history-file'), { target: { files: [fileOf(backup)] } })

    await waitFor(() => expect(props.onImport).toHaveBeenCalledTimes(1))
    expect(props.onImport).toHaveBeenCalledWith({ days: { '2026-02-01': { sec: 600, notes: 12 } } })
    expect(screen.queryByTestId('history-import-error')).toBeNull()
  })

  it('says so and changes nothing when the file is not a backup', async () => {
    const { props } = renderView()

    fireEvent.change(screen.getByTestId('history-file'), { target: { files: [fileOf('{"days":{}}')] } })

    expect(await screen.findByTestId('history-import-error')).toHaveTextContent('nothing was changed')
    expect(props.onImport).not.toHaveBeenCalled()
  })

  it('refuses a file past the size ceiling without reading it', async () => {
    const { props } = renderView()
    const { file, text } = unreadableFile({ size: MAX_BACKUP_BYTES + 1 })

    fireEvent.change(screen.getByTestId('history-file'), { target: { files: [file] } })

    expect(await screen.findByTestId('history-import-error')).toHaveTextContent('nothing was changed')
    expect(text).not.toHaveBeenCalled()
    expect(props.onImport).not.toHaveBeenCalled()
  })

  it('refuses a file that says it is something else without reading it', async () => {
    const { props } = renderView()
    const { file, text } = unreadableFile({ type: 'video/mp4' })

    fireEvent.change(screen.getByTestId('history-file'), { target: { files: [file] } })

    expect(await screen.findByTestId('history-import-error')).toHaveTextContent('nothing was changed')
    expect(text).not.toHaveBeenCalled()
    expect(props.onImport).not.toHaveBeenCalled()
  })

  it('still imports a backup the system has no type for', async () => {
    const { props } = renderView()

    const backup = serializeBackup({ days: { '2026-02-01': { sec: 600, notes: 12 } } }, TODAY)
    const file = new File([backup], 'backup.json', { type: '' })
    fireEvent.change(screen.getByTestId('history-file'), { target: { files: [file] } })

    await waitFor(() => expect(props.onImport).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('history-import-error')).toBeNull()
  })
})
