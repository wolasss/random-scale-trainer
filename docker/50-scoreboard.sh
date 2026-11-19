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
#
# The image runs as the unprivileged nginx user from its first process (see
# USER in the Dockerfile), so the service — the only thing here that parses
# untrusted network input — inherits that and there is no privilege to drop.
#
# Nothing here prepares the data directory. The script cannot chown, and a
# mkdir that fails under `set -e` would stop nginx from starting; an unwritable
# volume is a persistence problem, not a reason to take the app down.
# writeSnapshot creates the directory itself and treats a failed write as
# best-effort.
set -e

SCOREBOARD_DATA="${SCOREBOARD_DATA:-/var/lib/callnote/scoreboard.json}"
export SCOREBOARD_DATA

# The port is fixed in main.js because nginx.conf proxies to it by number; there
# is nothing to configure here that would not break that pairing.
echo "$0: starting the scoreboard (data: ${SCOREBOARD_DATA})"
node /opt/callnote/server/main.js &
