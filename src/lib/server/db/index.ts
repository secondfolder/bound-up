import { type AnyD1Database, drizzle } from 'drizzle-orm/d1';
// biome-ignore lint/performance/noNamespaceImport: Drizzle takes the schema as one object holding every table, and the namespace is how a new table joins it without anyone having to remember to list it.
import * as tables from './schema';

/**
 * Creates a Drizzle client over a D1 binding.
 *
 * D1 bindings only exist inside a request context on Cloudflare Workers, so
 * unlike the old Postgres setup there is no module-level singleton — this is
 * called once per request from `hooks.server.ts`.
 *
 * This module must stay free of `$lib` / `$env` / `$app` imports so it can also
 * be loaded by drizzle-kit and by the seed script, both of which run outside
 * Vite. The dev/prod driver switch lives in `./backend.ts` for that reason.
 */
export function createD1Db(d1: AnyD1Database) {
	return drizzle(d1, { schema });
}

/**
 * The app's database type is deliberately the D1 one. The local libsql client
 * (dev and the self-hosted build) is cast to it, so all application code is
 * typed against what runs on Workers and cannot accidentally rely on a
 * capability D1 lacks.
 */
export type Db = ReturnType<typeof createD1Db>;

/** Every table, as the one object Drizzle's relational queries and Better Auth's adapter take. */
export const schema = tables;
