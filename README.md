# callnote.app

**Fretboard fluency, one beat at a time.**

callnote.app is a small React and Vite practice app for guitar fretboard memorization. A metronome clicks, a note name is called on the beat, and you find it on the neck before the next one lands.

![callnote.app calling notes on metronome clicks](docs/callnote.gif)

Pick your notes and a tempo, press start, and it calls a note on the metronome click.

## Features

- Shuffled-bag note calling: every note in the pool appears exactly once per cycle, no repeats —
  with a NEXT preview and a "note N of M" cycle position
- Note pool control: 12 tappable pitch-class chips plus presets (all 12, naturals, accidentals, the
  six major keys, the A/E/D minor pentatonics and A minor blues) — plus Custom, which is what the
  selector reads back once the chips no longer match a preset
- Enharmonic spelling as flats, sharps, or mixed — the spoken name always matches the displayed one
- Tempo (30–240 BPM, live-adjustable, tap tempo) split from the note-change rate
  (every 1/2/4/8/12 beats; the beat a new note lands on gets the accented click)
- Drift-free Web Audio scheduling: clicks and spoken samples are scheduled at explicit
  AudioContext times by a look-ahead scheduler
- "On the neck" fretboard map showing every position of the called note (frets 0–12, standard
  tuning), hideable from "How it runs"
- Speed ramp, in the Tempo card: the tempo climbs 2 BPM every completed round until it reaches a
  target you choose, then holds there — so a session ends on a tempo you reached, not the first one
  you missed. Routine blocks own their own ramp and ceiling
- Routines: an ordered list of blocks, where a block sets tempo, note pool, note-change rate and
  spelling for you. One untimed block is a saved setup that runs until you stop; add timed blocks
  and it becomes a workout that advances itself, with a proportional timeline and a Skip block
  button. A shelf of routines is seeded on first load, and touching a control mid-routine is
  reported as "adjusted, next block resets it" rather than silently overridden
- Practice log: 14 days of daily bars, current and best streak (a day counts at one minute of
  practice), and rolling 7-day minutes/notes totals. A History button on the card opens the whole log
  — a month-by-month heatmap with each day shaded by minutes, totals across everything stored, and
  JSON backup export/import, where an import merges with what is already there (keeping the longer of
  any two days) rather than replacing it
- Listen for my playing (off by default): with the setting on, the app opens the microphone
  alongside playback and shows the note it hears under the called one, with a tick when it is the
  note asked for and a cross when it isn't. How in tune the string was is left to a tuner. A note
  that matches the call is named the way the call named it — E♭ stays E♭ rather than turning into
  D♯ — and the reading stays up until you play something else or the next note is called, rather
  than blinking out with the string. The count-in between rounds clears it: no note on screen, so
  nothing to be right or wrong about. The detector is a hand-rolled Web Audio autocorrelation
  on the same AudioContext playback uses, and what the app plays through the speakers is suppressed
  by the cue intervals the engine records, so the readout reports you rather than itself. The mic is
  released the moment you pause, stop or leave, and a refusal or a browser without one says so and
  changes nothing else. Finding the called note in two octaves before the next one is called earns a
  bonus — the mic hears pitch and nothing else, so two unison positions are one octave and earn
  nothing
- "How it runs": keep going (loop past the end of a cycle), a four-beat count-in, listening for
  your playing, and the fretboard map toggle. The spoken note name is always on
- Session card with practice goal (5/10/20 min), progress bar, and notes/cycles stats
- Installable PWA: a service worker precaches the app shell and every note clip, so it launches
  and runs with no network. Chromium gets an Install button in the header, iOS a one-time
  Add-to-Home-Screen hint, and a cached new build offers a reload chip instead of reloading
  mid-session
- Stage layout: installed on a touch device, the app drops to the note, the beat dots and a
  transport, and moves the setup cards into a full-screen practice sheet — landscape puts the neck
  alongside the note
- The screen is kept awake while playing, and playback stops itself after a minute in the
  background rather than clicking on in a pocket
- Light/dark theme, and every setting persisted to localStorage
- Keyboard shortcuts: Space play/pause, ←/→ (or ↑/↓) tempo, R reset

## Run locally

```bash
npm install
npm run dev
```

Node 22 or newer. Audio playback begins only after a user interaction such as pressing the start
button.

## Build

```bash
npm run build
```

## Deploy

The repo ships a multi-stage `Dockerfile`: `node:24-alpine` builds the Vite app, and
`nginx:1.30-alpine` serves the static `dist/` output on port 80.

```bash
docker build -t callnote .
docker run --rm -p 8080:80 callnote                            # http://localhost:8080

docker run --rm -p 8080:80 wolasss/random-scale-trainer:latest # the published image
```

Every release pushes `wolasss/random-scale-trainer` to Docker Hub for linux/amd64 and
linux/arm64, tagged with the semantic-release version and `latest`
(`.github/workflows/release.yml`).

`nginx.conf` sets the caching deliberately. Unknown paths fall back to `index.html`, so client-side
routes resolve. `/sw.js` is sent `no-cache, no-store, must-revalidate`, and `index.html` and
`manifest.webmanifest` are sent `no-cache`: a cached service worker is a build the browser can
never move off, and index.html is what names the hashed bundles, so a stale shell pins everyone to
the old ones. Everything else matching the static-file extension list (js, css, images, fonts,
mp3) gets `expires 7d` and `Cache-Control: public` — that rule is matched on extension, not on the
presence of a content hash, so only the three exact-match locations above it escape it.

## Tests

```bash
npm test             # Vitest unit + integration suite
npm run test:e2e:ci  # Selenium e2e against a production preview (see e2e/README.md)
npm run check        # lint + e2e typecheck + Vitest + build — what CI runs
```

## Notes

- Spoken note names are pre-rendered MP3s (`public/audio/notes/`, generated by
  `scripts/generate-note-audio.sh`) covering both flat and sharp spellings. A clip that fails to
  download falls back to SpeechSynthesis for that note.
- The click is the authoritative beat: everything is scheduled ~250ms ahead at exact
  AudioContext times, and visuals sync to the audio clock via a rAF queue.
- The service worker is built from `src/sw/service-worker.js` by a Vite plugin
  (`vite.config.ts`), which fills in the content-hashed precache list and a cache version derived
  from it, and is registered in production builds only.

## Brand

`brand/callnote-brand-guide.md` is the source of truth for the mark. In the app the lockup is live
text (`src/components/BrandLockup.tsx` + the BRAND block in `src/index.css`) whose `--brand-*`
tokens alias the active skin's own palette — so the call dot is always the same colour as the
Resume button, in every skin, without a per-skin logo.

The exported SVGs in `brand/` and the PWA's PNG icons are generated, not drawn:

```bash
python3 scripts/generate-brand-assets.py   # brand/*.svg + public/favicon.svg
node scripts/rasterize-icons.mjs           # public/icon-*.png (needs playwright)
```

Adding a skin means adding a row to `THEMES` in the first script; there is no second drawing to
keep in sync.

## License

MIT — see [LICENSE](LICENSE). Free for anyone to use, modify and redistribute, personally or
commercially, as long as the copyright and permission notice travel with the code.

MIT ships the app as-is: no warranty and no support obligation. It is a copyright licence only —
the `callnote.app` name and the marks in `brand/` stay trademarks of the copyright holder, so a
fork can copy and change those files but shouldn't pass itself off as Callnote. If your team needs
more than that — a support
commitment, a warranty, indemnity, or different terms — open an issue at
<https://github.com/wolasss/random-scale-trainer/issues> and we can talk about a commercial
agreement.
