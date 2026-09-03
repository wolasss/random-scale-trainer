import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { Icon } from './Icon'

describe('Icon', () => {
  it('renders a solid icon with the Font Awesome markup shape', () => {
    const { container } = render(<Icon icon={faXmark} className="extra" />)
    const svg = container.querySelector('svg')

    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('class')?.split(' ')).toEqual(
      expect.arrayContaining(['svg-inline--fa', 'fa-xmark', 'extra']),
    )
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('data-prefix', 'fas')
    expect(svg).toHaveAttribute('data-icon', 'xmark')
    expect(svg).toHaveAttribute('viewBox', '0 0 384 512')

    const path = svg?.querySelector('path')
    expect(path).toHaveAttribute('fill', 'currentColor')
    expect(path).toHaveAttribute('d', faXmark.icon[4] as string)
  })

  it('renders a brands icon with its own prefix and viewBox', () => {
    const { container } = render(<Icon icon={faGithub} />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('data-prefix', 'fab')
    expect(svg).toHaveAttribute('data-icon', 'github')
    expect(svg).toHaveAttribute('viewBox', '0 0 512 512')
  })

  it('lets a spread prop override the default aria-hidden without duplicating it', () => {
    const { container } = render(<Icon icon={faXmark} aria-hidden="false" />)
    const svg = container.querySelector('svg')

    expect(svg?.getAttributeNames().filter((name) => name === 'aria-hidden')).toHaveLength(1)
    expect(svg).toHaveAttribute('aria-hidden', 'false')
  })
})
