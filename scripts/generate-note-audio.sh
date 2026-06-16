#!/usr/bin/env bash
# Generates MP3 audio files for all 12 chromatic note names (sharp + flat variants).
# Requires: macOS `say` command (built-in) and `ffmpeg` (brew install ffmpeg).
#
# Output: public/audio/notes/*.mp3

set -euo pipefail

OUTDIR="$(dirname "$0")/../public/audio/notes"
TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT

mkdir -p "$OUTDIR"

gen() {
  local key="$1"; shift
  local text="$*"
  say -v Samantha -o "$TMPDIR_WORK/${key}.aiff" "$text"
  ffmpeg -y -i "$TMPDIR_WORK/${key}.aiff" -ar 22050 -ac 1 -b:a 64k "$OUTDIR/${key}.mp3" 2>/dev/null
  echo "Generated: ${key}.mp3  (\"${text}\")"
}

# Compound notes — hyphen context prevents mispronunciation of A/E
gen c-sharp    "C-sharp"
gen d-flat     "D-flat"
gen d-sharp    "D-sharp"
gen e-flat     "E-flat"
gen f-sharp    "F-sharp"
gen g-flat     "G-flat"
gen g-sharp    "G-sharp"
gen a-flat     "A-flat"
gen a-sharp    "A-sharp"
gen b-flat     "B-flat"

# Single letters — trailing period forces letter reading, not article/"capital X" prefix
gen a  "A."
gen b  "B."
gen c  "C."
gen d  "D."
gen e  "E."
gen f  "F."
gen g  "G."

echo "Done. $(ls "$OUTDIR"/*.mp3 | wc -l | tr -d ' ') files in $OUTDIR"
