# Multi-stage build for a Vite React app
FROM node:24-alpine AS build
WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci

# Build the app
COPY . .
RUN npm run build

# Serve static files with nginx, plus the one thing that is not a static file:
# the shared-challenge scoreboard. node is here to run it — it is stdlib-only,
# so there is nothing to install beside it.
#
# The unprivileged variant: nginx and the scoreboard both run as uid 101, so
# nothing in the running container is root. Its pid file and temp paths are
# already moved to /tmp for that.
#
# The tag floats on the 1.31 line on purpose: nothing in this repo bumps image
# versions, so a pinned patch would go stale. Any rebuild takes the current
# nginx security fixes.
FROM nginx/nginx-unprivileged:1.31-alpine AS runtime

# Root for the build steps only — the base image has already dropped to 101.
USER root
RUN apk add --no-cache nodejs
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# The service and its launcher. nginx's own entrypoint runs everything in
# /docker-entrypoint.d/ before the CMD below, so the run contract is unchanged:
# still `docker run -p 8080:80`, still one process to stop. Modules are listed
# one by one so the image ships no test sources.
COPY src/server/bug-report.js src/server/http.js src/server/main.js src/server/scoreboard.js src/server/session-scoring.js /opt/callnote/server/
COPY docker/50-scoreboard.sh /docker-entrypoint.d/50-scoreboard.sh
RUN chmod +x /docker-entrypoint.d/50-scoreboard.sh && mkdir -p /var/lib/callnote && chown nginx:nginx /var/lib/callnote

# Mount something here to keep the board across restarts; without it a restart
# starts everyone from zero. A new named volume takes the ownership set above;
# anything else mounted here has to be writable by uid 101 already, because
# nothing in the container can chown it any more.
VOLUME ["/var/lib/callnote"]

# Numeric, so an orchestrator can verify non-root without reading /etc/passwd.
USER 101

# Still 80, to keep the run contract. A non-root bind to it works because
# Docker lowers net.ipv4.ip_unprivileged_port_start to 0 inside its containers.
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
