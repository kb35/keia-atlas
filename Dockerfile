# Keia Atlas container: builds the static site, then serves it with nginx.
#
#   docker build -t keia-atlas .
#   docker run --rm -p 8080:8080 keia-atlas
#   open http://localhost:8080/keia-atlas/
#
# IMPORTANT: this repo uses a git submodule (vendor/keia). The build context must
# include it, so clone with:
#
#   git clone --recurse-submodules <repo-url>
#
# or, in an existing clone: git submodule update --init
# (.dockerignore keeps vendor/keia in the context on purpose.)

# ---- Stage 1: build the site -------------------------------------------------
# package.json needs Node >= 22.12; the node:22 image tracks the latest 22.x LTS.
# Pinned by digest (multi-arch index) so builds are repeatable; Dependabot keeps it fresh.
# Tag: node:22-alpine
FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1 \
    CI=true

# Install dependencies first so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

# Then the rest of the source (filtered by .dockerignore).
COPY . .

# "npm run build" checks all data against its schemas, then runs "astro build".
# Output goes to /app/dist. Astro's base is /keia-atlas, so the built pages sit at
# the dist root while every link carries the /keia-atlas/ prefix.
RUN npm run build

# The site has no 404 page of its own yet. If none was built, make a plain one so
# nginx still shows something friendly. A real dist/404.html wins when it exists.
RUN test -f dist/404.html || printf '%s' \
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found - Keia Atlas</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>Page not found</h1><p>That address does not exist in Keia Atlas.</p><p><a href="/keia-atlas/">Go to the home page</a></p></body></html>' \
  > dist/404.html

# ---- Stage 2: serve it -------------------------------------------------------
# The "unprivileged" nginx image runs as a non-root user (nginx, uid 101) and
# listens on 8080 rather than 80.
# Pinned by digest (multi-arch index). Tag: nginxinc/nginx-unprivileged:stable-alpine
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:ed04ec1ff34502c339ee5c3ae3f855442398edc1d05591e2b98981dcbbd20b1e

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# dist/ goes into a keia-atlas/ folder so the URL prefix /keia-atlas/ maps straight
# onto the files with a plain "root" (no alias tricks).
COPY --from=build /app/dist /usr/share/nginx/html/keia-atlas

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/keia-atlas/ || exit 1
