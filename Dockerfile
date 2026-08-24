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
FROM nginx:1.30-alpine AS runtime
RUN apk add --no-cache nodejs
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# The service and its launcher. nginx's own entrypoint runs everything in
# /docker-entrypoint.d/ before the CMD below, so the run contract is unchanged:
# still `docker run -p 8080:80`, still one process to stop. Modules are listed
# one by one so the image ships no test sources.
COPY src/server/http.js src/server/main.js src/server/scoreboard.js src/server/session-scoring.js /opt/callnote/server/
COPY docker/50-scoreboard.sh /docker-entrypoint.d/50-scoreboard.sh
RUN chmod +x /docker-entrypoint.d/50-scoreboard.sh && mkdir -p /var/lib/callnote

# Mount something here to keep the board across restarts; without it a restart
# starts everyone from zero.
VOLUME ["/var/lib/callnote"]

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
