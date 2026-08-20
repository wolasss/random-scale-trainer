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
- `session.ts` — `useTrainerSession(options?)`, the shared browser lifecycle every spec uses: it registers the `before`/`after` that open and quit one session for the enclosing suite, takes the same `DriverOptions` as `buildDriver`, and returns an accessor for the `TrainerPage`.
- `specs/01–11` — initial defaults, playback/pause/resume, tempo controls + persistence, switches + persistence, theme + persistence, keyboard shortcuts, session completion + reset, note pool + presets, NEXT preview, enharmonic spelling, session goal/stats.
- `specs/12` — the mobile layout guard; see below.

## The mobile layout guard (spec 12)

Controls that grow wider than the phone they run on are not a local problem: the
scroll container holding one drags every sibling sideways with it. So spec 12
asserts nothing at all reaches past its container's right edge, at 320/390/430px
— rather than asserting on whichever control got it wrong last time.

It measures two roots: the page, and the practice sheet in the installed app.
Reaching the second needs both halves of `useDisplayMode`'s stage test, which
`buildDriver` takes as options:

| Option | Effect |
|---|---|
| `mobileWidth` | Chrome mobile emulation — makes `(pointer: coarse)` match and pins the viewport to an exact CSS width |
| `standalone` | launches with `--app=`, the only way `(display-mode: standalone)` matches |

Device metrics are fixed when the browser launches, so — unlike the rest of the
suite — this spec opens one session per width instead of sharing one.

Anything deliberately swipeable is exempt: the walk skips elements inside an
ancestor whose computed `overflow-x` is `auto` or `scroll`, which is what keeps
the fretboard's own scroller from reading as a failure.

## Conventions (anti-flakiness)

- Note order is random — assert set membership / distinct counts, never specific notes.
- Wait for terminal UI states with explicit waits; never sleep-and-hope, never wait on transient messages ("Loading audio...", "Resuming...").
- Timer assertions use ranges (200ms tick granularity + CI drift).
- Playback specs pin BPM to 240 and, where speed matters, seed `fretboard-beats-per-note` to `1` (250ms per note) to keep the suite fast.
- CSS animations are disabled per page load (zero-opacity text reads as `""` in WebDriver).
- Each test starts from a cleared localStorage (`openFresh()`).

`npm run typecheck:e2e` typechecks the suite without touching the app build.
