/**
 * The Docker image's entrypoint: check the environment, apply migrations,
 * then hand over to the adapter-node server.
 *
 * Migrating here rather than from a hook keeps it out of `vite dev`, where
 * `npm run db:migrate:dev` stays a deliberate step, and means a migration that
 * fails stops the container before it serves a single request against a
 * half-migrated database. `migrate()` from drizzle-orm keeps the same
 * `__drizzle_migrations` ledger as `drizzle-kit migrate`, so a database first
 * made by one can be carried on by the other. It is idempotent: a restart
 * applies nothing.
 *
 * Plain JavaScript, not TypeScript: it runs from the production image, which
 * has no dev dependencies and no build step of its own.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Stops the container with a message naming the fix, as hooks.server.ts does. */
function fail(message) {
	console.error(`bound-up: ${message}`);
	process.exit(1);
}

// hooks.server.ts would catch this too, but only on the first request, as a
// 500. Refusing to start is the clearer failure for a container.
if (!process.env.BETTER_AUTH_SECRET) {
	fail(
		'BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -hex 32` and ' +
			'pass it with `-e BETTER_AUTH_SECRET=…` (or `environment:` in docker-compose.yml). ' +
			'Keep it: changing it signs everyone out.'
	);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith('file:')) {
	fail(`DATABASE_URL must be a file: URL for the SQLite database, not "${databaseUrl ?? ''}".`);
}
const mediaDir = process.env.MEDIA_DIR;
if (!mediaDir) {
	fail('MEDIA_DIR is not set. It is where attachments are stored: mount a volume there.');
}

// The volumes may be empty, or bind mounts of a fresh host directory.
await mkdir(path.dirname(databaseUrl.slice('file:'.length)), { recursive: true });
await mkdir(mediaDir, { recursive: true });

const client = createClient({ url: databaseUrl, timeout: 5000 });
try {
	await migrate(drizzle(client), { migrationsFolder: path.join(root, 'drizzle') });
} catch (error) {
	console.error(error);
	fail(`Applying migrations to ${databaseUrl} failed; the server was not started.`);
} finally {
	client.close();
}
console.info(`bound-up: database ${databaseUrl} is up to date`);

await import('../build/index.js');
