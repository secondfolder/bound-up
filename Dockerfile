# syntax=docker/dockerfile:1
#
# The self-hosted Bound Up server: adapter-node over a SQLite file and a media
# directory. See docs/self-hosting.md. The Cloudflare build is unaffected by
# anything here — it is `npm run build`, this is `npm run build:node`.
#
# bookworm-slim rather than alpine: @libsql/client ships prebuilt glibc
# binaries, and the musl ones have lagged behind.
#
# Every stage but the last runs on the BUILD platform, never under emulation.
# A release builds linux/arm64 on an amd64 runner through QEMU, where `npm ci`
# and `vite build` took over ten minutes; `build/` is plain JavaScript, so it is
# built once, natively, and both architectures share it — and share the cache
# entries the CI image job already wrote. The one thing that differs per
# architecture is which prebuilt native binaries `prod-deps` downloads, and npm
# picks those by `--os`/`--cpu`/`--libc` rather than by the machine it runs on.
ARG NODE_VERSION=24

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
# `prepare` runs husky, which has no .git to install hooks into here.
ENV HUSKY=0

# package.json without its `scripts` and tool config, which change far more
# often than the dependencies do. `npm ci` keys its layer on the files copied
# in before it, so the whole package.json there meant that editing any npm
# script reinstalled every dependency and pushed a fresh ~500 MB layer into a
# GitHub Actions cache already at its 10 GB limit. COPY --from is keyed on the
# content this stage produces, so an unchanged result keeps the layers below.
FROM base AS manifest
COPY package.json ./
RUN node -e "const p = require('./package.json'); for (const k of ['scripts', 'lint-staged']) delete p[k]; require('node:fs').writeFileSync('manifest.json', JSON.stringify(p, null, '\t'))"

# Everything, dev dependencies included: the build needs vite, the adapters
# and svelte-kit itself.
FROM base AS deps
COPY --from=manifest /app/manifest.json ./package.json
COPY package-lock.json .npmrc ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build:node

# Only what `build/` leaves external: adapter-node bundles devDependencies into
# the output and imports `dependencies` at runtime, which is why @libsql/client
# (native) is a dependency and wrangler's plugin is not. Installed for the
# TARGET architecture: npm takes Docker's `amd64` as `x64`, and `--libc` is
# what picks @libsql's glibc binary over its musl one.
FROM base AS prod-deps
ARG TARGETARCH
COPY --from=manifest /app/manifest.json ./package.json
COPY package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts --os=linux --libc=glibc \
	--cpu="$(if [ "$TARGETARCH" = amd64 ]; then echo x64; else echo "$TARGETARCH"; fi)"

# The volume mount points, made here rather than with a RUN in the runtime
# stage: that stage is the target architecture, and a RUN there is the one
# thing that would still need QEMU to build arm64.
FROM base AS data-dirs
RUN mkdir -p /data/db /data/media

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	DATABASE_URL=file:/data/db/bound-up.db \
	MEDIA_DIR=/data/media \
	# adapter-node refuses bodies over 512 KB by default, which is every message
	# with a photo in it. The routes enforce the real cap themselves
	# (MAX_REQUEST_BYTES, 26 MB, in api/partnerships/[id]/send.ts) with a
	# message that says so; this only has to sit above it, which
	# src/lib/server/self-hosted/dockerfile.test.ts checks.
	BODY_SIZE_LIMIT=32M
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY drizzle ./drizzle
COPY package.json ./
COPY scripts/docker-entrypoint.mjs ./scripts/docker-entrypoint.mjs
# Owned by `node`, so a named volume mounted over them starts out writable by
# the unprivileged user the server runs as. --chown resolves the name from this
# image's /etc/passwd without running anything in it.
COPY --from=data-dirs --chown=node:node /data /data
USER node
VOLUME ["/data/db", "/data/media"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["node", "scripts/docker-entrypoint.mjs"]

# Last, so that every layer above is identical between the image CI tests and
# the one it releases — only these labels and APP_VERSION differ. The app
# shows APP_VERSION on its settings page (src/lib/server/app-version.ts): the
# build stage has no .git to work a version out from, and must not take one
# from here without giving up that identity.
ARG VERSION=0.0.0-dev
ENV APP_VERSION="${VERSION}"
LABEL org.opencontainers.image.title="Bound Up" \
	org.opencontainers.image.source="https://github.com/secondfolder/bound-up" \
	org.opencontainers.image.version="${VERSION}"
