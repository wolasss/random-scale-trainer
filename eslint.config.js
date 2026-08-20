import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Shipped as dist/sw.js, so it gets linted like everything else that runs
    // in a browser — just with the service worker globals and the two names
    // vite.config.ts substitutes at build time.
    files: ['src/sw/service-worker.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        __CACHE_VERSION__: 'readonly',
        __PRECACHE_MANIFEST__: 'readonly',
      },
    },
  },
  {
    // The scoreboard service. Plain JS like the worker above, and for the same
    // reason — it runs outside the app bundle, here under bare node.
    files: ['src/server/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
