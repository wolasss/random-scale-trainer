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
# This script still runs as root (that's how the nginx entrypoint invokes
# everything under /docker-entrypoint.d/), but the service itself is the only
# process in the image that parses untrusted network input, so it is started
# as the image's existing unprivileged nginx user rather than as root.
set -e

SCOREBOARD_DATA="${SCOREBOARD_DATA:-/var/lib/callnote/scoreboard.json}"
export SCOREBOARD_DATA

DATA_DIR="$(dirname "$SCOREBOARD_DATA")"
mkdir -p "$DATA_DIR"

# Only the image's own data directory is re-owned. SCOREBOARD_DATA is
# operator-configurable, and chowning wherever it happens to point (up to
# and including "/", if it were ever set to a bare filename) would hand the
# network-facing nginx user write access to a directory outside our
# control. A custom path is the operator's to provision permissions for.
#
# Non-recursive: the service only ever needs to write into the directory
# (snapshots go through temp-file + rename) and this also re-owns a
# freshly mounted volume. The file chown covers a root-owned snapshot left
# behind by an earlier image. Failures are swallowed rather than aborting
# the entrypoint under `set -e` — an unwritable volume is a persistence
# problem, not a reason to stop nginx from serving the app, and writeSnapshot
# already treats a failed write as best-effort.
if [ "$DATA_DIR" = "/var/lib/callnote" ]; then
  chown nginx:nginx "$DATA_DIR" 2>/dev/null || true
  if [ -e "$SCOREBOARD_DATA" ]; then chown nginx:nginx "$SCOREBOARD_DATA" 2>/dev/null || true; fi
fi

# The port is fixed in main.js because nginx.conf proxies to it by number; there
# is nothing to configure here that would not break that pairing.
echo "$0: starting the scoreboard (data: ${SCOREBOARD_DATA})"
su nginx -s /bin/sh -c 'exec node /opt/callnote/server/main.js' &
