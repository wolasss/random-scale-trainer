# E2E tests (Selenium WebDriver)

Critical-path regression suite driven through a **remote Selenium server** (never a local chromedriver). Tests run with Node's built-in test runner via `tsx`, serially, one browser session per spec file.

## Running

A Selenium standalone server must be reachable (default `http://localhost:4444`), e.g.:

```sh
docker run -d --rm -p 4444:4444 --shm-size=2g selenium/standalone-chrome:4
# Apple Silicon: seleniarm/standalone-chromium:latest
```

Then either the one-command flow (builds, serves on :4173, runs, shuts down):

```sh
APP_BASE_URL=http://host.docker.internal:4173 npm run test:e2e:ci
```

or two terminals:

```sh
npm run build && npm run e2e:serve     # terminal 1
APP_BASE_URL=http://host.docker.internal:4173 npm run test:e2e   # terminal 2
```

`APP_BASE_URL` is the app URL **as seen from the browser inside Selenium** — use `host.docker.internal` when Selenium runs in Docker, plain `http://localhost:4173` when it runs natively.

## Configuration (env vars)

| Var | Default | |
|---|---|---|
| `SELENIUM_REMOTE_URL` | `http://localhost:4444` | Remote WebDriver endpoint |
| `APP_BASE_URL` | `http://localhost:4173` | App under test, from the browser's perspective |
| `BROWSER` | `chrome` | WebDriver browser name |
| `HEADLESS` | `false` | Adds `--headless=new` |

## Layout

- `pages/trainer.page.ts` — the **only** place selectors, app strings, and wait conditions live. When refactoring the UI, update this file (and the `data-testid` attributes in `src/components/`); specs should not need to change.
- `specs/01–11` — initial defaults, playback/pause/resume, tempo controls + persistence, switches + persistence, theme + persistence, keyboard shortcuts, session completion + reset, note pool + presets, NEXT preview, enharmonic spelling, session goal/stats.

## Conventions (anti-flakiness)

- Note order is random — assert set membership / distinct counts, never specific notes.
- Wait for terminal UI states with explicit waits; never sleep-and-hope, never wait on transient messages ("Loading audio...", "Resuming...").
- Timer assertions use ranges (200ms tick granularity + CI drift).
- Playback specs pin BPM to 240 and, where speed matters, seed `fretboard-beats-per-note` to `1` (250ms per note) to keep the suite fast.
- CSS animations are disabled per page load (zero-opacity text reads as `""` in WebDriver).
- Each test starts from a cleared localStorage (`openFresh()`).

`npm run typecheck:e2e` typechecks the suite without touching the app build.
