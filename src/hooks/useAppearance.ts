/**
 * The app's two persisted appearance choices — the theme and the skin — and the
 * document element they are applied to. Everything skinned or themed in the
 * stylesheet keys off `data-theme` and `data-skin`, so the whole of the look
 * follows from these two attributes.
 *
 * The one wrinkle is the webfont: the skins that need one get their `<link>`
 * appended the first time that skin is picked, and it stays for the rest of the
 * session.
 */
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { usePersistentState } from './usePersistentState'
import { type Theme } from '../components/TopBar'
import { DEFAULT_SKIN, isSkin, SKIN_FONT_HREF, SKIN_GROUND, type Skin } from '../lib/skins'
import { STORAGE_KEYS } from '../constants'

export type Appearance = {
  theme: Theme
  setTheme: Dispatch<SetStateAction<Theme>>
  skin: Skin
  setSkin: Dispatch<SetStateAction<Skin>>
}

export function useAppearance(): Appearance {
  const [theme, setTheme] = usePersistentState<Theme>(STORAGE_KEYS.theme, {
    defaultValue: 'dark',
    deserialize: (raw) => (raw === 'light' || raw === 'dark' ? raw : undefined),
  })
  const [skin, setSkin] = usePersistentState<Skin>(STORAGE_KEYS.skin, {
    defaultValue: DEFAULT_SKIN,
    deserialize: (raw) => (isSkin(raw) ? raw : undefined),
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // The chosen skin drives every skinned rule in the stylesheet.
  useEffect(() => {
    document.documentElement.setAttribute('data-skin', skin)
  }, [skin])

  // The window chrome of an installed app — status bar, title bar — and the
  // UA's own widgets and scrollbars are painted outside the stylesheet, so they
  // only follow the theme if we tell them: the ground colour of the chosen
  // skin, and the scheme the document is written for.
  useEffect(() => {
    document.documentElement.style.colorScheme = theme

    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = SKIN_GROUND[skin][theme]
  }, [theme, skin])

  // Instrument and warm each need one webfont the base document doesn't load.
  // Add it the first time that skin is picked, so glass never pays for it, and
  // leave it in place afterwards (switching back and forth shouldn't re-fetch).
  useEffect(() => {
    const href = SKIN_FONT_HREF[skin]
    if (!href || document.querySelector(`link[data-skin-font="${skin}"]`)) {
      return
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-skin-font', skin)
    document.head.appendChild(link)
  }, [skin])

  return { theme, setTheme, skin, setSkin }
}
