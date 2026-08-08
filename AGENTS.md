# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, etc.) working in this repository. Human contributors may find it useful too.

## What this is
A React + Vite + TypeScript web app for guitar-fretboard memorization practice: random note calling from a user-chosen pitch-class pool (a shuffled bag, so every note comes up once per cycle), spoken note clips scheduled over a Web Audio metronome with a SpeechSynthesis fallback, BPM control, a session timer, a practice log, and a continuous "routines" mode. Ships as a PWA.

## The one command that defines "done"
Before considering any change complete, it must pass:

```bash
npm run check
```

This runs, in order: `lint` → `typecheck:e2e` → `test` (Vitest) → `build` (`tsc -b` + `vite build`). CI runs the exact same command, so green locally means green in CI. If you can't make it pass, revert rather than leaving it broken.

The end-to-end suite (`npm run test:e2e:ci`, Selenium) also runs in CI but is not part of `npm run check`; run it only when your change could affect real browser behavior.

## Layout
- `src/App.tsx` — top-level app; composes the trainer UI. Colocated tests: `App.integration.test.tsx`, `App.routines.test.tsx`, `App.practiceLog.test.tsx`, `App.stage.test.tsx`, `App.skin.test.tsx`.
- `src/components/` — presentational/UI components.
- `src/hooks/` — React hooks (settings, keyboard shortcuts, session timer, wake lock, service worker, persistent state…), most with a colocated `*.test.tsx` (`useBeatPulse.ts` and `usePlayback.ts` have none).
- `src/lib/` — pure logic modules (notes, presets, routines, transport, history, tap tempo, skins, storage, time), most with colocated tests (`skins.ts` and `storage.ts` have none).
- `src/lib/audio/` — Web Audio engine (`engine.ts` + tests).
- `src/lib/playback/` — playback state machine (`machine.ts` + tests).
- `src/constants.ts` — shared constants (tempo/beat limits, speed ramp, session goals, scheduler timing, storage keys).
- `src/test/` — test setup/helpers.
- `e2e/` — Selenium specs (separate `tsconfig`, typechecked via `typecheck:e2e`).

## Conventions
- **TypeScript is strict** (`strict`, `noUnusedLocals`). Keep it type-clean — no `any` escape hatches, no unused symbols.
- **Tests are colocated** as `*.test.tsx?` next to the code. Add/adjust tests with behavior changes.
- **Determinism:** never let unit tests depend on real wall-clock time, randomness, or live audio — mock them (fake timers, seeded/stubbed generators, mocked audio/speech). Flaky tests are treated as bugs.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`). Releases are automated by `semantic-release` from commit messages, so the type/scope matters.
- Keep changes small and cohesive — one focused concern per PR.

## Do NOT touch (unless that IS the task)
- `.github/workflows/` (CI) and release config (`semantic-release`, version bumps) — releases are automated.
- Precomputed audio assets and generated files — the note clips under `public/audio/notes/` (produced by `scripts/generate-note-audio.sh`) and assets under `src/assets` — unless explicitly asked.
- `master` directly — always work on a branch and open a PR.

## Preview servers
Don't run `npm run dev`/`preview` directly for a shareable preview. Use the `tportless` wrapper so the server is exposed on the tailnet, and report the Tailscale URL (not localhost).
