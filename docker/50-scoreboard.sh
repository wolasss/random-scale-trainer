#!/bin/sh
# Starts the shared-challenge scoreboard beside nginx.
#
# The nginx image runs everything in /docker-entrypoint.d/ before handing over
# to the CMD, so hanging the service off here is what keeps the published
# image's contract intact: `docker run -p 8080:80` and nothing else, with no
# second process manager and no change to CMD or EXPOSE.
#
# Backgrounded on purpose — a blocking script here would stop nginx from ever
# starting. If the service dies, the app keeps serving; only the board goes.
set -e

SCOREBOARD_DATA="${SCOREBOARD_DATA:-/var/lib/callnote/scoreboard.json}"
SCOREBOARD_PORT="${SCOREBOARD_PORT:-8787}"
export SCOREBOARD_DATA SCOREBOARD_PORT

mkdir -p "$(dirname "$SCOREBOARD_DATA")"

echo "$0: starting the scoreboard on 127.0.0.1:${SCOREBOARD_PORT} (data: ${SCOREBOARD_DATA})"
node /opt/callnote/server/main.js &
