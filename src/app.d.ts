// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { AnyD1Database } from 'drizzle-orm/d1';
import type { AppContext } from '$lib/context';
import type { Auth, Session, User } from '$lib/server/auth';
import type { ContextSpace } from '$lib/server/context';
import type { Db } from '$lib/server/db';
import type { Mailer } from '$lib/server/mail';
import type { MediaBucket } from '$lib/server/media';
import type { PornRelayNamespace } from '$lib/server/porn-relay/binding';
import type { TunnelService } from '$lib/server/porn-relay/tunnel';
import type {
	AuthRateLimiter,
	DaydreamRateLimiter,
	EmailRateLimiter
} from '$lib/server/rate-limit';
import type { RealtimeNamespace } from '$lib/server/realtime/binding';
import type { ServerSettings } from '$lib/server-settings';

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
			 * One attempt against a sign-in, sign-up, change-password or
			 * verification-email bucket, for this request's client. Form actions
			 * call it before Better Auth; the hook calls it for the `/api/auth`
			 * equivalents. See `$lib/server/rate-limit`.
			 */
			authRateLimit: AuthRateLimiter;
			/**
			 * One verification email to an address, counted per address rather
			 * than per client, and off wherever `authRateLimit` is. Better Auth's
			 * sends are held to it (`sendLimited` in `$lib/server/auth`), and the
			 * check-email page's resend is refused by it. Counts each address
			 * once per request (`onceEach`). See `$lib/server/rate-limit`.
			 */
			emailRateLimit: EmailRateLimiter;
			/**
			 * One Daydreams reply for an account, against
			 * `DAYDREAM_REPLY_LIMITS`. On everywhere, because it limits what
			 * the server spends on a model provider. See `$lib/server/rate-limit`.
			 */
			daydreamRateLimit: DaydreamRateLimiter;
			/**
			 * One Daydreams suggestion (chips, filling in, "Surprise me") for an
			 * account, against `DAYDREAM_SUGGEST_LIMITS`: a scope of its own, so
			 * setting up never uses up the story's replies.
			 */
			daydreamSuggestRateLimit: DaydreamRateLimiter;
			/** A picture, for this account: `DAYDREAM_IMAGE_LIMITS`, its own scope. */
			daydreamImageRateLimit: DaydreamRateLimiter;
			/**
			 * This server's mailer, built on its first send (`lazyMailer` in
			 * hooks.server.ts). Send through `sendInBackground` so no response
			 * waits on the provider. See `$lib/server/mail` and docs/email.md.
			 */
			mailer: Mailer;
			/**
			 * This server's settings, read once per request in hooks.server.ts
			 * (`loadServerSettings`). `''` for one that is not set. See
			 * `$lib/server/settings` and docs/server-settings.md.
			 */
			settings: ServerSettings;
			/**
			 * The current context — Everyone, or one space — from the `context`
			 * cookie, checked against the viewer's spaces: one they are not in
			 * is Everyone. Lazy and memoised per request. Display only: no
			 * action may read it to decide where a write goes, since another
			 * tab can change it at any moment. See docs/contexts.md.
			 */
			context: () => Promise<AppContext>;
			/** The spaces the viewer can switch between, solo first. Lazy and memoised, like `context`. */
			contextSpaces: () => Promise<ContextSpace[]>;
		}
		// interface PageData {}
		interface PageState {
			/**
			 * The space an add sheet (`/tasks/add`, `/rewards/add`) was opened
			 * for, by the add button's fan in Everyone. History state rather
			 * than a query string, so the URL stays the route's own; gone after
			 * a reload, when the sheet asks "For whom?" instead.
			 */
			addFor?: string;
		}
		interface Platform {
			// Only `env` and `ctx.waitUntil` are declared: nothing in this app
			// uses caches / cf. `AnyD1Database` comes from drizzle rather than
			// @cloudflare/workers-types on purpose — that package exposes its
			// types as ambient globals, and pulling them in would overwrite the
			// DOM's Request/Response/fetch/Cache for the whole project,
			// including the component test project.
			env: {
				DB: AnyD1Database;
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
				 * The Durable Object that fetches sites refusing the visitor's
				 * country from Europe instead. See `$lib/server/porn-relay`.
				 */
				PORN_RELAY: PornRelayNamespace;
				/**
				 * Workers VPC services through the tunnel to darcy, one per host,
				 * for when a host refuses every Cloudflare address. Optional: without
				 * one, that host simply has no fallback. See
				 * `$lib/server/porn-relay/tunnel`.
				 */
				TUNNEL_REDGIFS?: TunnelService;
				TUNNEL_PMVHAVEN?: TunnelService;
				/**
				 * The stand-in model providers' roots, which only the e2e suite
				 * sets. Test seams rather than settings: see
				 * `$lib/server/daydream/config` and `image-config`.
				 */
				OPENROUTER_BASE_URL?: string;
				RUNWARE_BASE_URL?: string;
				/** Likewise for Resend, so a Workers e2e run can read its mail. See `$lib/server/mail`. */
				RESEND_BASE_URL?: string;
				/**
				 * TEMPORARY: what the server settings were before they moved into
				 * the database. Read only by the one-time import
				 * (`$lib/server/settings/legacy-env`); remove with it. See
				 * docs/temporary-code.md.
				 */
				BETTER_AUTH_SECRET?: string;
				VAPID_PUBLIC_KEY?: string;
				VAPID_PRIVATE_KEY?: string;
				VAPID_SUBJECT?: string;
				MAIL_FROM?: string;
				RESEND_API_KEY?: string;
				SMTP_URL?: string;
				MAIL_OUTBOX_DIR?: string;
				OPENROUTER_API_KEY?: string;
				DAYDREAM_MODEL?: string;
				RUNWARE_AI_API_KEY?: string;
				RUNWARE_AI_IMAGE_MODEL?: string;
				RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED?: string;
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
