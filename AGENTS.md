# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, etc.) working in this repository. Human contributors may find it useful too.

## What this is
**callnote.app** — a React + Vite + TypeScript web app for guitar-fretboard practice: shuffled note calling, spoken note playback (Web Audio + SpeechSynthesis), BPM control, a session timer, a practice log, and a continuous "routines" mode. Ships as a PWA. The name is written `callnote.app` in prose and lowercase everywhere in the UI; `callnote` alone is the short form where the suffix won't fit.

## The one command that defines "done"
Before considering any change complete, it must pass:

```bash
npm run check
```

This runs, in order: `lint` → `typecheck:e2e` → `test` (Vitest) → `build` (`tsc -b` + `vite build`). CI runs the exact same command, so green locally means green in CI. If you can't make it pass, revert rather than leaving it broken.

The end-to-end suite (`npm run test:e2e:ci`, Selenium) also runs in CI but is not part of `npm run check`; run it only when your change could affect real browser behavior.

## Layout
- `src/App.tsx` — top-level app; composes the practice UI. Colocated tests: `App.integration.test.tsx`, `App.routines.test.tsx`, `App.practiceLog.test.tsx`, `App.stage.test.tsx`, `App.skin.test.tsx`.
- `src/components/` — presentational/UI components.
- `src/hooks/` — React hooks (settings, keyboard shortcuts, session timer, wake lock, service worker, persistent state…), each with a colocated `*.test.tsx`.
- `src/lib/audio/` — Web Audio engine (`engine.ts` + tests).
- `src/lib/playback/` — playback state machine (`machine.ts` + tests).
- `src/lib/skins.ts`, `src/constants.ts` — the visual skins and app constants.
- `src/test/` — test setup/helpers.
- `e2e/` — Selenium specs (separate `tsconfig`, typechecked via `typecheck:e2e`).
- `brand/` — the brand guide and the generated logo/icon exports; `scripts/generate-brand-assets.py` and `scripts/rasterize-icons.mjs` produce them.

## Conventions
- **TypeScript is strict** (`strict`, `noUnusedLocals`). Keep it type-clean — no `any` escape hatches, no unused symbols.
- **Tests are colocated** as `*.test.tsx?` next to the code. Add/adjust tests with behavior changes.
- **Determinism:** never let unit tests depend on real wall-clock time, randomness, or live audio — mock them (fake timers, seeded/stubbed generators, mocked audio/speech). Flaky tests are treated as bugs.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`). Releases are automated by `semantic-release` from commit messages, so the type/scope matters.
- Keep changes small and cohesive — one focused concern per PR.
- **Brand:** never hard-code a brand colour. The mark reads `--brand-*`, which alias the active skin's tokens — that is what keeps the call dot the same colour as the Resume button in every skin. Rules live in `brand/callnote-brand-guide.md`; the SVGs beside it are generated output, so edit the generator instead.

## Do NOT touch (unless that IS the task)
- `.github/workflows/` (CI) and release config (`semantic-release`, version bumps) — releases are automated.
- Precomputed audio assets and generated files under `src/assets`/`src/data` unless explicitly asked.
- `master` directly — always work on a branch and open a PR.

## Preview servers
Don't run `npm run dev`/`preview` directly for a shareable preview. Use the `tportless` wrapper so the server is exposed on the tailnet, and report the Tailscale URL (not localhost).
