import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandLockup } from './BrandLockup'

describe('BrandLockup', () => {
  it('reads as the full name in the accessibility tree', () => {
    render(<BrandLockup />)

    // Live text, not an image: the name has to be the element's text content,
    // and the dots — decoration — must not land in it.
    expect(screen.getByTestId('brand-lockup')).toHaveTextContent(/^callnote\.app$/)
  })

  it('drops the suffix when compact, and never the name', () => {
    render(<BrandLockup compact />)

    expect(screen.getByTestId('brand-lockup')).toHaveTextContent(/^callnote$/)
  })

  it('keeps the suffix inside the wordmark rather than beside the dots', () => {
    const { container } = render(<BrandLockup />)

    // As a sibling of the dot column the suffix would inherit the lockup's
    // 0.22em gap and drift off the final 'e'.
    const suffix = container.querySelector('.brand-suffix')
    expect(suffix?.parentElement).toHaveClass('brand-wordmark')
  })

  it('hides the dot column from assistive tech', () => {
    const { container } = render(<BrandLockup />)

    expect(container.querySelector('.brand-dots')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('.brand-dot')).toHaveLength(2)
  })
})
