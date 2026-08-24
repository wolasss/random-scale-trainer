import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

function Trap({
  open = true,
  onClose,
  capture = false,
  withInitialFocus = false,
  empty = false,
}: {
  open?: boolean
  onClose: () => void
  capture?: boolean
  withInitialFocus?: boolean
  empty?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const secondRef = useRef<HTMLButtonElement>(null)
  useFocusTrap(containerRef, open, onClose, {
    capture,
    initialFocus: withInitialFocus ? secondRef : undefined,
  })

  return (
    <>
      <button data-testid="outside">outside</button>
      <div ref={containerRef} data-testid="trap">
        {!empty && (
          <>
            <button data-testid="first">first</button>
            <button data-testid="second" ref={secondRef}>
              second
            </button>
            <button data-testid="last">last</button>
          </>
        )}
      </div>
    </>
  )
}

const renderTrap = (props: Omit<Parameters<typeof Trap>[0], 'onClose'> = {}) => {
  const onClose = vi.fn()
  const rendered = render(<Trap {...props} onClose={onClose} />)
  return { ...rendered, onClose }
}

describe('useFocusTrap', () => {
  it('opens focus on the first focusable', () => {
    renderTrap()

    expect(document.activeElement).toBe(screen.getByTestId('first'))
  })

  it('opens focus on options.initialFocus when given', () => {
    renderTrap({ withInitialFocus: true })

    expect(document.activeElement).toBe(screen.getByTestId('second'))
  })

  it('wraps Tab from the last focusable to the first', () => {
    renderTrap()

    const first = screen.getByTestId('first')
    const last = screen.getByTestId('last')
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })

    expect(document.activeElement).toBe(first)
  })

  it('wraps Shift+Tab from the first focusable to the last', () => {
    renderTrap()

    const first = screen.getByTestId('first')
    const last = screen.getByTestId('last')
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(last)
  })

  it('pulls focus back in when Tab is pressed while focus is outside the container', () => {
    renderTrap()

    const outside = screen.getByTestId('outside')
    const first = screen.getByTestId('first')
    outside.focus()
    fireEvent.keyDown(outside, { key: 'Tab' })

    expect(document.activeElement).toBe(first)
  })

  it('pulls focus back to the last focusable when Shift+Tab is pressed while focus is outside', () => {
    renderTrap()

    const outside = screen.getByTestId('outside')
    const last = screen.getByTestId('last')
    outside.focus()
    fireEvent.keyDown(outside, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(last)
  })

  it('calls onClose on Escape', () => {
    const { onClose } = renderTrap()

    fireEvent.keyDown(screen.getByTestId('first'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('swallows Tab without throwing when the container has no focusable children', () => {
    renderTrap({ empty: true })

    expect(() => {
      fireEvent.keyDown(screen.getByTestId('trap'), { key: 'Tab' })
    }).not.toThrow()
  })

  it('sets document.body.style.overflow to hidden while open and restores it on close', () => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'auto'

    try {
      const onClose = vi.fn()
      const { rerender } = render(<Trap open onClose={onClose} />)

      expect(document.body.style.overflow).toBe('hidden')

      rerender(<Trap open={false} onClose={onClose} />)

      expect(document.body.style.overflow).toBe('auto')
    } finally {
      document.body.style.overflow = previousOverflow
    }
  })

  it('hands focus back to the opener on close', () => {
    const opener = document.createElement('button')
    document.body.append(opener)

    try {
      opener.focus()
      const onClose = vi.fn()
      const { rerender } = render(<Trap open={false} onClose={onClose} />)

      rerender(<Trap open onClose={onClose} />)
      expect(document.activeElement).toBe(screen.getByTestId('first'))

      rerender(<Trap open={false} onClose={onClose} />)

      expect(document.activeElement).toBe(opener)
    } finally {
      opener.remove()
    }
  })

  it('skips restoring focus when the opener has been removed from the document', () => {
    const opener = document.createElement('button')
    document.body.append(opener)

    try {
      opener.focus()
      const onClose = vi.fn()
      const { rerender } = render(<Trap open={false} onClose={onClose} />)

      rerender(<Trap open onClose={onClose} />)
      opener.remove()

      const focusedBeforeClose = document.activeElement

      expect(() => {
        rerender(<Trap open={false} onClose={onClose} />)
      }).not.toThrow()

      // No opener to hand focus back to, so whatever was focused stays focused.
      expect(document.activeElement).toBe(focusedBeforeClose)
    } finally {
      opener.remove()
    }
  })

  it('stops an Escape from reaching a window listener when capture is true', () => {
    const outer = vi.fn()
    window.addEventListener('keydown', outer)

    try {
      const { onClose } = renderTrap({ capture: true })

      fireEvent.keyDown(screen.getByTestId('first'), { key: 'Escape' })

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(outer).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', outer)
    }
  })

  it('lets an Escape reach a window listener when capture is false', () => {
    const outer = vi.fn()
    window.addEventListener('keydown', outer)

    try {
      const { onClose } = renderTrap({ capture: false })

      fireEvent.keyDown(screen.getByTestId('first'), { key: 'Escape' })

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(outer).toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', outer)
    }
  })
})
