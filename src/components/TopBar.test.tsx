import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TopBar } from './TopBar'
import { TOUCH_INPUT_QUERY } from '../hooks/useHardwareKeyboard'
import { installMatchMedia } from '../test/matchMedia'

/** jsdom's own matchMedia never matches anything, so each test says whether the
 * browser reports a touchscreen among its inputs. */
const installTouchInput = (touchInput: boolean) => installMatchMedia({ [TOUCH_INPUT_QUERY]: touchInput })

const renderTopBar = () => render(<TopBar theme="dark" onToggleTheme={() => undefined} />)

describe('TopBar key hints', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('lists the shortcuts on a browser with no touch input', () => {
    installTouchInput(false)

    renderTopBar()

    expect(document.querySelector('.key-hints')).not.toBeNull()
    expect(screen.getByText('Space')).toBeInTheDocument()
  })

  it('drops them until there is a keyboard to press them with', () => {
    installTouchInput(true)

    renderTopBar()

    expect(document.querySelector('.key-hints')).toBeNull()
    expect(screen.queryByText('Space')).toBeNull()
  })

  it('brings them back once a physical key is pressed', () => {
    installTouchInput(true)

    renderTopBar()
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })

    expect(document.querySelector('.key-hints')).not.toBeNull()
    expect(screen.getByText('Space')).toBeInTheDocument()
  })
})
