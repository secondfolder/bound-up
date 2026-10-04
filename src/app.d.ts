// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { AnyD1Database } from 'drizzle-orm/d1';
import type { Auth, Session, User } from '$lib/server/auth';
import type { Db } from '$lib/server/db';
import type { MediaBucket } from '$lib/server/media';
import type { AuthRateLimiter } from '$lib/server/rate-limit';
import type { RealtimeNamespace } from '$lib/server/realtime/binding';

declare global {
	var litIssuedWarnings: Set<string> | undefined;

	/**
	 * True only in the self-hosted Node build (`npm run build:node`). Replaced
	 * at build time by `define` in vite.config.ts, so a branch on it is dead
	 * code in the Workers bundle. See docs/self-hosting.md.
	 */
	const __SELF_HOSTED__: boolean;

	/**
	 * The release version, computed at build time from the git history by
	 * `vite-plugins/app-version.ts`. Read through `$lib/server/app-version`,
	 * which lets the Docker image's runtime `APP_VERSION` take precedence.
	 */
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		interface Locals {
			/** Per-request Drizzle client — D1 in production, libsql in dev. */
			db: Db;
			/** Per-request Better Auth instance. */
			auth: Auth;
			session: Session | null;
			user: User | null;
			/**
			 * One attempt against a sign-in, sign-up or change-password bucket,
			 * for this request's client. Form actions call it before Better Auth;
			 * the hook calls it for the `/api/auth` equivalents. See
			 * `$lib/server/rate-limit`.
			 */
			authRateLimit: AuthRateLimiter;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			// Only `env` and `ctx.waitUntil` are declared: nothing in this app
			// uses caches / cf. `AnyD1Database` comes from drizzle rather than
			// @cloudflare/workers-types on purpose — that package exposes its
			// types as ambient globals, and pulling them in would overwrite the
			// DOM's Request/Response/fetch/Cache for the whole project,
			// including the component test project.
			env: {
				DB: AnyD1Database;
				BETTER_AUTH_SECRET: string;
				/** `off` disables the sign-in rate limit. Unset in production. */
				AUTH_RATE_LIMIT?: string;
				/**
				 * The R2 bucket holding encrypted attachments.
				 *
				 * Structurally typed in `$lib/server/media` rather than imported
				 * from @cloudflare/workers-types, for the same ambient-globals
				 * reason as `AnyD1Database` above.
				 */
				MEDIA: MediaBucket;
				/**
				 * The Durable Object namespace behind the live message feed.
				 *
				 * Structurally typed in `$lib/server/realtime/binding` rather
				 * than imported from @cloudflare/workers-types, for the same
				 * ambient-globals reason as the two above.
				 */
				REALTIME: RealtimeNamespace;
				/**
				 * Web Push. All three or none: without them push is off rather
				 * than an error. See `$lib/server/push` and docs/notifications.md.
				 */
				VAPID_PUBLIC_KEY?: string;
				VAPID_PRIVATE_KEY?: string;
				VAPID_SUBJECT?: string;
			};
			/**
			 * Optional because the self-hosted and dev servers have no platform
			 * at all; on Workers it is always present.
			 */
			ctx?: {
				/** Keeps the invocation alive for work finished after the response. */
				waitUntil: (promise: Promise<unknown>) => void;
			};
		}
	}
}
