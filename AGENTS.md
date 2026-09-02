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
- `src/App.tsx` — top-level app; composes the practice UI. Colocated tests: `App.challenge.test.tsx`, `App.firstRun.test.tsx`, `App.install.test.tsx`, `App.integration.test.tsx`, `App.mic.test.tsx`, `App.parity.test.tsx`, `App.practiceLog.test.tsx`, `App.routines.test.tsx`, `App.skin.test.tsx`, `App.stage.test.tsx`.
- `src/components/` — presentational/UI components.
- `src/components/ui/` — shared primitives (`SegmentedControl`, `SwitchRow`, `ThemeToggle`; the first two each have a colocated test).
- `src/hooks/` — React hooks (settings, keyboard shortcuts, session timer, wake lock, service worker, persistent state…), each with a colocated `*.test.tsx`.
- `src/lib/audio/` — Web Audio engine, mic capture and pitch detection (`engine.ts`, `mic.ts`, `pitch.ts`), each with tests.
- `src/lib/playback/` — playback state machine and note deck (`machine.ts`, `deck.ts`, plus the `program.ts`/`tempo.ts` split out of the machine), each with tests.
- `src/lib/` — the rest of the domain logic: practice log (`history.ts`), note/scale generation (`notes.ts`), presets and routines math (`presets.ts`, `routines.ts`), the shared-challenge client (`challenge.ts`), scoring and the scoreboard (`scoring.ts`, `scoreboard.ts`), storage and timing helpers (`storage.ts`, `tapTempo.ts`, `time.ts`, `transport.ts`), visual skins (`skins.ts`) and app constants (`src/constants.ts`), each with a colocated `*.test.ts`; plus `settingsStorage.ts` (settings persistence), which has no test file.
- `src/server/` — the shared-challenge scoreboard: `scoreboard.js` (routing, the store, nickname
  ownership, quotas and rate limits, all as pure functions of a store), `session-scoring.js` (the
  point rules and the event-validation rules, pure), `http.js` (the `node:http` edge — body cap,
  client identity, cross-site refusal) and `main.js` (the process), each with a hand-written `.d.ts`. Plain JS like the
  service worker, and for the same reason — it runs outside the app bundle, under bare `node` in the
  container. **A nickname is owned**: claiming one issues a token the server keeps only a digest of,
  and every mutation carries it as `Authorization: Bearer`. The client never sends a total; it
  streams events and the server adds them up. `bug-report.js` is the other route the same process
  serves — the footer's "report a bug" form, with a Cloudflare Turnstile check and Mailgun delivery,
  both injected so nothing in a test reaches the network, and both optional (unset keys make the
  route answer `not_configured` and the app say so). Tests are colocated TypeScript, including
  `api.integration.test.ts` (a real socket) and `deploy.test.ts`, which reads `nginx.conf` and the
  `Dockerfile`.
- `src/sw/` — service-worker source (`service-worker.js`) and its tests; built into `dist/sw.js` by the `callnote-service-worker` Vite plugin in `vite.config.ts` (never hand-edit `dist`).
- `src/test/` — test setup/helpers.
- `e2e/` — Selenium specs (separate `tsconfig`, typechecked via `typecheck:e2e`).
- `brand/` — the brand guide and the generated logo/icon exports; `scripts/generate-brand-assets.py` and `scripts/rasterize-icons.mjs` produce them.

## Conventions
- **TypeScript is strict** (`strict`, `noUnusedLocals`). Keep it type-clean — no `any` escape hatches, no unused symbols.
- **Tests are colocated** as `*.test.tsx?` next to the code. Add/adjust tests with behavior changes.
- **Test environment:** `vitest.config.ts` sets `environment: 'jsdom'` globally. DOM-free suites (e.g. `src/lib/*.test.ts`, `src/lib/playback/*.test.ts`, `src/sw/*.test.ts`) opt out with a `// @vitest-environment node` pragma at the top of the file — a new lib test only runs node-side if its author adds the pragma, which is why `src/test/setup.ts` guards its `window` access.
- **Console discipline:** `src/test/consoleGuard.ts` (imported by `src/test/setup.ts`, the configured `setupFiles`) fails a test that emits an unexpected `console.error` or `console.warn`. A test that means to provoke one opts in with `allowConsole()` from `src/test/consoleGuard`.
- **Determinism:** never let unit tests depend on real wall-clock time, randomness, or live audio — mock them (fake timers, seeded/stubbed generators, mocked audio/speech). Flaky tests are treated as bugs.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`). Releases are automated by `semantic-release` from commit messages, so the type/scope matters.
- Keep changes small and cohesive — one focused concern per PR.
- **Brand:** never hard-code a brand colour. The mark reads `--brand-*`, which alias the active skin's tokens — that is what keeps the call dot the same colour as the Resume button in every skin. Rules live in `brand/callnote-brand-guide.md`; the SVGs beside it are generated output, so edit the generator instead.

## Do NOT touch (unless that IS the task)
- `.github/workflows/` (CI) and release config (`semantic-release`, version bumps) — releases are automated.
- Precomputed audio assets and generated files under `src/assets` unless explicitly asked.
- `master` directly — always work on a branch and open a PR.

## Preview servers
Don't run `npm run dev`/`preview` directly for a shareable preview. Use the `tportless` wrapper so the server is exposed on the tailnet, and report the Tailscale URL (not localhost).
