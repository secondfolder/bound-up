#!/usr/bin/env bash
# Boots an image twice on the same volumes and checks it survives the restart.
#
#   scripts/docker-smoke.sh [image]     (default: bound-up:local)
#
# What the Playwright suite cannot see, because it starts every run on a fresh
# directory: that the volumes really hold the state, and that the migrations
# the entrypoint applies on every start apply nothing the second time. CI runs
# it before the e2e suite; see .github/workflows/ci.yml.
set -euo pipefail

image="${1:-bound-up:local}"
name="bound-up-smoke-$$"
db_volume="$name-db"
media_volume="$name-media"
port="${SMOKE_PORT:-38$((RANDOM % 900 + 100))}"

cleanup() {
	docker rm -f "$name" >/dev/null 2>&1 || true
	docker volume rm "$db_volume" "$media_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

start() {
	docker run -d --name "$name" -p "127.0.0.1:$port:3000" \
		-v "$db_volume:/data/db" -v "$media_volume:/data/media" \
		-e BETTER_AUTH_SECRET="smoke-test-secret-$(date +%s)-padding-to-32-chars" \
		-e ORIGIN="http://localhost:$port" \
		"$image" >/dev/null
}

wait_healthy() {
	for _ in $(seq 1 60); do
		if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
			return 0
		fi
		sleep 1
	done
	echo "The container never became healthy. Its log:" >&2
	docker logs "$name" >&2
	return 1
}

# Queried inside the container, through its own libsql, so this needs nothing
# on the host but docker and curl.
query() {
	docker exec "$name" node --input-type=module -e "
		import { createClient } from '@libsql/client';
		const client = createClient({ url: process.env.DATABASE_URL });
		const result = await client.execute(\`$1\`);
		console.log(Object.values(result.rows[0])[0]);
	"
}

echo "Starting $image on fresh volumes"
start
wait_healthy
migrations=$(query 'select count(*) from __drizzle_migrations')
expected=$(find drizzle -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')
if [ "$migrations" != "$expected" ]; then
	echo "Expected $expected migrations applied, found $migrations" >&2
	exit 1
fi
# A marker that only survives if /data/db really is the volume.
query "insert into verification (id, identifier, value, expires_at, created_at, updated_at) values ('smoke', 'smoke', 'smoke', 0, 0, 0) returning id" >/dev/null
docker exec "$name" sh -c 'echo smoke > "$MEDIA_DIR/smoke"'

echo "Restarting on the same volumes"
docker rm -f "$name" >/dev/null
start
wait_healthy
if [ "$(query 'select count(*) from __drizzle_migrations')" != "$migrations" ]; then
	echo 'The second start applied migrations again' >&2
	exit 1
fi
if [ "$(query "select count(*) from verification where id = 'smoke'")" != 1 ]; then
	echo 'The database did not survive the restart' >&2
	exit 1
fi
if [ "$(docker exec "$name" sh -c 'cat "$MEDIA_DIR/smoke"')" != smoke ]; then
	echo 'The media directory did not survive the restart' >&2
	exit 1
fi
echo "OK: healthy, $migrations migrations applied once, database and media persisted"
