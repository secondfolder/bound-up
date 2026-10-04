# syntax=docker/dockerfile:1
#
# The self-hosted Bound Up server: adapter-node over a SQLite file and a media
# directory. See docs/self-hosting.md. The Cloudflare build is unaffected by
# anything here — it is `npm run build`, this is `npm run build:node`.
#
# bookworm-slim rather than alpine: @libsql/client ships prebuilt glibc
# binaries, and the musl ones have lagged behind.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
# `prepare` runs husky, which has no .git to install hooks into here.
ENV HUSKY=0

# Everything, dev dependencies included: the build needs vite, the adapters
# and svelte-kit itself.
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build:node

# Only what `build/` leaves external: adapter-node bundles devDependencies into
# the output and imports `dependencies` at runtime, which is why @libsql/client
# (native) is a dependency and wrangler's plugin is not.
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts

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
# Not run by the server. Shipped so a self-hoster can generate the secrets from
# the image itself, with nothing installed but Docker (see docs/self-hosting.md):
#   docker run --rm --entrypoint node <image> scripts/secrets.mjs print … > .env
COPY scripts/secrets.mjs ./scripts/secrets.mjs
# Made here and owned by `node`, so a named volume mounted over them starts out
# writable by the unprivileged user the server runs as.
RUN mkdir -p /data/db /data/media && chown -R node:node /data
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
