import { useMediaQuery } from './useMediaQuery'

export const STANDALONE_QUERY = '(display-mode: standalone)'
export const COARSE_POINTER_QUERY = '(pointer: coarse)'
export const LANDSCAPE_QUERY = '(orientation: landscape)'

type IosNavigator = Navigator & { standalone?: boolean }

/** iOS only started answering the display-mode query in 16.4; before that the
 * launched-from-home-screen flag was the only signal. */
const iosStandalone = (): boolean =>
  typeof navigator !== 'undefined' && (navigator as IosNavigator).standalone === true

export const isIos = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false
  }

  // iPadOS reports itself as MacIntel; the touch points give it away.
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export type DisplayMode = {
  /** Launched from the home screen rather than a browser tab. */
  standalone: boolean
  /**
   * Standalone on a touch device: the propped-on-a-stand case, and the only
   * state in which the app rearranges itself. A desktop browser can never
   * match this, installed or not.
   */
  stage: boolean
  landscape: boolean
}

export function useDisplayMode(): DisplayMode {
  const standaloneQuery = useMediaQuery(STANDALONE_QUERY)
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  const landscape = useMediaQuery(LANDSCAPE_QUERY)

  const standalone = standaloneQuery || iosStandalone()

  return { standalone, stage: standalone && coarse, landscape }
}
