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
    // Type-aware promise rules, on the app source only. The parser needs a TS
    // project, so this file list mirrors tsconfig.app.json's include/exclude —
    // keep the two in sync or the parser will reject a file it can't place.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    // Same type-aware promise rules for the test files, which the block above
    // ignores. tsconfig.test.json includes all of src, so the parser can
    // place every test file (and src/test/** helpers).
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    // src/lib is the framework-free domain layer: the UI imports from it, never
    // the other way round. That is what keeps the playback machine, the routines
    // math and the practice log testable under bare node, so it is worth a rule
    // rather than a convention. (Testing Library imports in the colocated tests
    // are fine — only React itself and the layers above are out.)
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react-dom/*'],
              message: 'src/lib is framework-free — keep React out of it and put the binding in a hook or component.',
            },
            {
              group: ['**/components/**', '**/hooks/**'],
              message: 'src/lib must not import from the UI layers — move the shared piece down into src/lib instead.',
            },
          ],
        },
      ],
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
  {
    // The repo's node-side tooling: the icon rasterizer and the root scratch
    // scripts. Matched by glob rather than by name so the block stays correct
    // as one-off scripts come and go.
    files: ['scripts/**/*.mjs', '*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
])
