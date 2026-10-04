/**
 * The app's two persisted appearance choices — the theme and the skin — and the
 * document element they are applied to. Everything skinned or themed in the
 * stylesheet keys off `data-theme` and `data-skin`, so the whole of the look
 * follows from these two attributes.
 *
 * The one wrinkle is the webfont: skins can add a remote stylesheet or preload
 * self-hosted faces the first time they are picked. Those links stay for the
 * rest of the session.
 */
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { usePersistentState } from './usePersistentState'
import { type Theme } from '../components/TopBar'
import {
  DEFAULT_SKIN,
  isSkin,
  SKIN_FONT_HREF,
  SKIN_FONT_PRELOAD_HREFS,
  SKIN_GROUND,
  type Skin,
} from '../lib/skins'
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

  // Remote font stylesheets remain lazy, so glass never pays for another
  // skin's face. Leave a loaded link in place when the user switches away.
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

  // Kwinta's defining faces are local PWA assets. Preload their Latin subsets
  // when that skin is picked; the latin-ext faces remain demand-driven through
  // unicode-range in the stylesheet.
  useEffect(() => {
    for (const href of SKIN_FONT_PRELOAD_HREFS[skin] ?? []) {
      if (document.querySelector(`link[data-skin-font-preload="${skin}"][href="${href}"]`)) {
        continue
      }

      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'font'
      link.type = 'font/woff2'
      link.crossOrigin = 'anonymous'
      link.href = href
      link.setAttribute('data-skin-font-preload', skin)
      document.head.appendChild(link)
    }
  }, [skin])

  return { theme, setTheme, skin, setSkin }
}
