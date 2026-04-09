# Random notes trainer

Random notes trainer is a small React and Vite practice app for guitar fretboard memorization. It generates a random scale, calls out each note name with browser speech synthesis, and keeps the notes aligned to a metronome click.

## Features

- Random scale generation across all 12 roots
- Spoken note playback using the browser SpeechSynthesis API
- Web Audio metronome click with adjustable BPM
- Continuous mode for endless random scale drills
- Separate session timer with start, stop, and reset
- Editable built-in scale library using semitone intervals

## Run locally

```bash
npm install
npm run dev
```

The app is intended for a modern desktop browser. Audio playback begins only after a user interaction such as pressing the play button.

## Build

```bash
npm run build
```

A VS Code task named `build random-notes-trainer` is also available.

## Notes

- SpeechSynthesis timing is not sample-accurate, so the metronome click is the authoritative beat and the spoken note follows it as closely as the browser allows.
- Scale intervals are edited as comma-separated semitone offsets from the root. Example: `0, 2, 4, 5, 7, 9, 11, 12` for a major scale.
- Enharmonic spelling for ambiguous roots is randomized between sharps and flats.
