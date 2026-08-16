import { useEffect, useState } from 'react'
import { useMediaQuery } from './useMediaQuery'

/**
 * A touchscreen somewhere in the input mix. Nothing in CSS reports keys, and a
 * mouse or a hover-capable stylus paired with a tablet says nothing about
 * whether one is attached — this only names the devices that can be driven
 * without a keyboard at all.
 */
export const TOUCH_INPUT_QUERY = '(any-pointer: coarse)'

/** On-screen keyboards send a keydown with no physical key behind it. */
const isPhysicalKey = (event: KeyboardEvent) => event.code !== '' && event.code !== 'Unidentified'

/**
 * Whether the app can promise a keyboard shortcut. A browser reporting no touch
 * input at all is already being driven by keys; once a touchscreen is in play
 * the platform will not say, so the answer starts as no and upgrades the moment
 * a key is actually pressed on hardware.
 */
export function useHardwareKeyboard(): boolean {
  const touchInput = useMediaQuery(TOUCH_INPUT_QUERY)
  const [keyPressed, setKeyPressed] = useState(false)

  useEffect(() => {
    if (!touchInput || keyPressed) {
      return undefined
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isPhysicalKey(event)) {
        setKeyPressed(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [touchInput, keyPressed])

  return !touchInput || keyPressed
}
