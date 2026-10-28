import { passkey } from '@better-auth/passkey';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
// `better-auth/minimal` rather than `better-auth`: the full entry's `init`
// pulls in getMigrations and the Kysely adapter, which we never use and which
// would otherwise be bundled into the worker. The core is identical.
import { createAuthMiddleware } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { admin } from 'better-auth/plugins/admin';
import { defaultAc, userAc } from 'better-auth/plugins/admin/access';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { AUTH_SECRET_LENGTH } from '../encryption';
import { type Db, schema } from './db';
import type { MailMessage } from './mail';
import { existingAccountEmail, verificationEmail } from './mail/templates';
import type { EmailRateLimiter } from './rate-limit';
import { deleteSpacesOfUserStatements } from './spaces';

/**
 * The type `@better-auth/passkey` accepts for WebAuthn extensions, derived from
 * the plugin rather than hard-coded, so it stays correct across upgrades.
 */
type PasskeyExtensions = NonNullable<
	NonNullable<NonNullable<Parameters<typeof passkey>[0]>['registration']>['extensions']
>;

/**
 * Ask the authenticator to associate a PRF key with a new passkey.
 *
 * Cast because `@simplewebauthn/server` — whose types the plugin uses — ships
 * its own hand-rolled `AuthenticationExtensionsClientInputs` listing only four
 * extensions, and PRF is not among them. TypeScript's own `lib.dom.d.ts` has
 * had `prf` for a while, and better-auth passes this value through untouched
 * into `generateRegistrationOptions` and on into the options JSON the browser
 * hands to `navigator.credentials.create()` — so the shape that matters at
 * runtime is the DOM one.
 *
 * A narrow cast at one boundary, deliberately, rather than a module
 * augmentation of `@simplewebauthn/server/esm/types/dom`: that path is not in
 * the package's `exports`, so an augmentation would be dropped silently on
 * upgrade, and a silently-dropped PRF request is the worst possible failure
 * here — passkeys would register without a PRF key and could never be used to
 * unlock, which is only discoverable on a new device with no password to hand.
 * If the library ever adds `prf`, this cast becomes a no-op and still compiles.
 */
const PRF_REGISTRATION_EXTENSIONS = { prf: {} } as PasskeyExtensions;

/**
 * The admin role, narrowed from the plugin's default to what the admin pages
 * actually use: finding an account and making or unmaking an admin.
 *
 * The plugin's own `admin` role can do far more, over `/api/auth/admin/*`,
 * whether or not any screen here calls it. What is left out, and why:
 *
 * - `impersonate` would hand an admin a session inside someone's partner
 *   data — tasks, rewards, who they are linked to — which is the privacy
 *   boundary docs/user-commitments-and-product-goals.md draws.
 * - `create` and `set-password` make a credential the browser never derived,
 *   so there is no password wrap for it and the account's message key can
 *   never be opened again (docs/encryption.md). It would look like a working
 *   account and be a broken one.
 * - `set-email`, `update`, `delete` and `ban` have no screen and no use yet.
 *   Grant one when something needs it, not before.
 *
 * Granting a feature is not in here at all: `user_features` is an app table,
 * written by our own admin actions behind `requireAdmin`.
 */
const adminRole = defaultAc.newRole({
	user: ['list', 'get', 'set-role'],
	session: ['list', 'revoke']
});

export type AuthRequestConfig = {
	/** The `serverSecret` server setting (`locals.settings`), generated when missing. */
	secret: string;
	/**
	 * MUST be `event.url.origin` verbatim. `svelteKitHandler`'s `isAuthPath`
	 * bails out when `options.baseURL.origin !== request.url.origin`, which
	 * would silently 404 every `/api/auth/*` endpoint.
	 */
	origin: string;
	/** `event.url.hostname` — the WebAuthn rpID, which never includes a port. */
	rpID: string;
	/** `event.url.host` — used to also trust the https form of this host. */
	host: string;
	/**
	 * Hands an email to the mailer without waiting for it — `sendInBackground`
	 * from `./mail`, bound to this request. Never throws, which is what keeps
	 * `/send-verification-email` from answering differently for an address
	 * with an account (see `emailVerification` below).
	 *
	 * `onlyIf`, when given, runs in the background too and the message is
	 * dropped if it resolves false — which is how the per-address limit is
	 * applied without the response waiting on it.
	 */
	sendMail: (message: MailMessage, what: string, onlyIf?: () => Promise<boolean>) => void;
	/**
	 * `locals.emailRateLimit`: one email to an address, counted against
	 * `VERIFICATION_EMAIL_PER_ADDRESS`. Applied here, where Better Auth sends,
	 * rather than in the forms that ask it to — the per-client limits on those
	 * forms are all that `/api/auth/send-verification-email` and a repeated
	 * sign-up would otherwise meet.
	 */
	emailRateLimit: EmailRateLimiter;
};

/** How long a verification link works. A day: long enough to find the email tomorrow. */
export const VERIFICATION_LINK_TTL_SECONDS = 24 * 60 * 60;

/**
 * Builds a Better Auth instance for one request.
 *
 * Per-request rather than module-level because the D1 binding only exists
 * inside a request, and because deriving `baseURL`/`rpID` from the actual
 * request URL makes localhost, the dev tunnel and production all correct with
 * no per-environment configuration.
 */
export function createAuth(db: Db, config: AuthRequestConfig) {
	/**
	 * The Better Auth endpoint this request is running, recorded by the
	 * `before` hook below — which Better Auth runs for `auth.api.*` calls from
	 * the form actions as well as for its HTTP routes. The instance is built per
	 * request, so this is per request too.
	 *
	 * Read by `sendVerificationEmail`, the one callback several endpoints share,
	 * because Better Auth does not say which of them called it.
	 */
	let endpoint: string | undefined;

	/**
	 * Sends an email that anyone could have asked for — a sign-up or a resend
	 * names any address it likes — only while that address is under its limit.
	 * Counting happens in the background with the send, so a refusal takes no
	 * longer than a success and says nothing about the account.
	 */
	const sendLimited = (message: MailMessage, what: string) =>
		config.sendMail(message, what, async () => (await config.emailRateLimit(message.to)).allowed);

	return betterAuth({
		appName: 'Bound Up',
		// Passed explicitly: Better Auth's own env lookup reads
		// `globalThis.process.env`, and its fallback is a hard-coded default
		// secret that only throws when NODE_ENV === 'production' — which
		// Workers does not set.
		secret: config.secret,
		baseURL: config.origin,
		// In dev the app may be reached over an https tunnel while `vite dev`
		// builds `event.url` as http://<host> (kit hard-codes the scheme), so the
		// browser's Origin header is https while baseURL is http. `validateOrigin`
		// runs on every cookie-bearing POST to /api/auth/* and would reject it.
		// `hooks.server.ts` now corrects the scheme from `X-Forwarded-Proto`, so
		// through the Cloudflare tunnel the two already agree; this still covers
		// a proxy that does not send that header. Trusting both forms of the same
		// host fixes that without changing baseURL, which `isAuthPath` compares
		// against the request origin.
		trustedOrigins: [config.origin, `https://${config.host}`],
		// Sign-up over HTTP is off: the app signs up only from the sign-up form
		// action, which calls `auth.api.signUpEmail` in-process, where this does
		// not apply. Reachable, `/api/auth/sign-up/email` skipped everything
		// that action adds — the response floor that stops its timing saying
		// whether an address has an account (docs/email.md), and the account's
		// keys, so a call left a keyless, unverified account squatting the
		// address. Better Auth checks this list only in its HTTP router, and
		// answers 404.
		disabledPaths: ['/sign-up/email'],
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		databaseHooks: {
			user: {
				// No create hook: every account's solo space is made by the
				// `user_has_solo_space` trigger, which holds however the row is
				// inserted. Deleting is the other way round: a space has no owner
				// column, so nothing cascades to it from `user`, and its rows'
				// `space_id` has no ON DELETE. The admin plugin's remove-user (and
				// any other Better Auth deletion) takes the account's spaces with
				// it here — every one, which for a shared space is ending the
				// partnership, as the old cascades did. See docs/spaces.md.
				delete: {
					before: async (deleted) => {
						const statements = await deleteSpacesOfUserStatements(db, deleted.id);
						if (statements) {
							await db.batch(statements);
						}
					}
				}
			}
		},
		user: {
			additionalFields: {
				timezone: {
					type: 'string',
					defaultValue: 'UTC',
					required: true,
					returned: true
				}
			}
		},
		emailAndPassword: {
			enabled: true,
			// An account cannot sign in until its address is confirmed. That is
			// what lets partner-assisted sign-in and, later, changing an email
			// lean on the address actually being the account holder's. See
			// docs/email.md.
			requireEmailVerification: true,
			// Off, and implied off by the line above anyway: signing up ends at
			// "check your email", not in a session. Better Auth also answers a
			// sign-up for an address that already has an account exactly as it
			// answers a new one once either is set, which is what stops the
			// sign-up form telling a stranger who has an account here.
			autoSignIn: false,
			// The one person who needs telling about that duplicate is the
			// address's owner, so they hear it by email rather than the
			// stranger hearing it on the page.
			// Limited per address, since the sign-up form can name anyone's.
			onExistingUserSignUp: ({ user }) => {
				sendLimited(existingAccountEmail(user.email, `${config.origin}/login`), 'existing account');
				return Promise.resolve();
			},
			// NOT a password policy. The browser posts a 43-character base64url
			// HKDF output in the `password` field and the real password never
			// leaves the device (see src/lib/crypto/kdf.ts and
			// docs/encryption.md), so these are an exact-shape assertion at the
			// auth layer, behind the Zod check that already enforces it.
			//
			// Pinned rather than left at the 8/128 defaults — 43 sits inside those
			// — so that a client bug producing a short secret is a loud 400 instead
			// of a silently accepted weak credential. Safe to pin because
			// /sign-in/email does not length-check at all; only sign-up,
			// change-password and set-password do.
			//
			// The real strength policy is client-side and structurally
			// unenforceable here. That is a consequence of the design, not an
			// oversight; rate limiting (`server/rate-limit.ts`) is the
			// compensating server-side control.
			minPasswordLength: AUTH_SECRET_LENGTH,
			maxPasswordLength: AUTH_SECRET_LENGTH
		},
		emailVerification: {
			sendOnSignUp: true,
			// An unverified account signing in with the right password gets a
			// fresh link, so an expired or lost one is never a dead end. Better
			// Auth checks the password first, so nobody else can trigger it.
			sendOnSignIn: true,
			// Off on purpose. The link may be opened in another browser or on
			// another device, and a session made there without the password has
			// no key: EncryptionGate would bounce it straight to
			// /login?reason=device. Instead the link lands on the login page
			// saying the address is confirmed, and signing in — which is what
			// unlocks, as everywhere else — finishes the job.
			autoSignInAfterVerification: false,
			expiresIn: VERIFICATION_LINK_TTL_SECONDS,
			// Never awaits the provider. `/send-verification-email` awaits this
			// for an unverified account and skips it otherwise, so a send that
			// took longer, or threw, would tell an unauthenticated caller which
			// addresses have accounts — Better Auth's 500ms floor only hides a
			// fast provider.
			//
			// Limited per address unless it came from signing in. Sign-in only
			// sends once the password has checked out, so it cannot be pointed at
			// a stranger's inbox, and it is already limited per client. Leaving it
			// out of the address's count is what keeps the owner able to get a
			// link when someone else has used that count up from the resend form.
			sendVerificationEmail: ({ user, url }) => {
				const message = verificationEmail(user.email, url);
				if (endpoint === '/sign-in/email') {
					config.sendMail(message, 'verification');
				} else {
					sendLimited(message, 'verification');
				}
				return Promise.resolve();
			}
		},
		// NOT enabled by default once a database is configured, so opt in
		// explicitly: this turns the per-request session lookup into a signed
		// cookie read instead of two D1 queries. Cost: revocation lags by up to
		// `maxAge` seconds.
		session: { cookieCache: { enabled: true, maxAge: 60 } },
		// Off, because the app limits these itself (`server/rate-limit.ts`).
		// Better Auth's limiter only runs in its HTTP router, which the /login,
		// /signup and change-password form actions never go through; it
		// defaults to on only when NODE_ENV is 'production', which Workers does
		// not set; and it counts in memory, which on Workers is per isolate.
		// Left on, it also logged that it could not find the client's address,
		// because nothing here tells it where to look.
		rateLimit: { enabled: false },
		telemetry: { enabled: false },
		hooks: {
			before: createAuthMiddleware((ctx) => {
				endpoint = ctx.path;
				return Promise.resolve();
			})
		},
		plugins: [
			// `origin` is deliberately left unset so the plugin uses the real
			// browser Origin header as `expectedOrigin` — which is what the
			// authenticator actually signed. Pinning it would break passkeys
			// behind the https dev tunnel. `expectedRPID` is pinned here, which
			// is the check that matters.
			passkey({
				rpID: config.rpID,
				rpName: 'Bound Up',
				/**
				 * PRF, so a passkey can later unlock the message identity with the
				 * same touch that signs the user in.
				 *
				 * This MUST be requested at credential *creation* — a passkey
				 * registered without it can never be used for PRF and cannot be
				 * upgraded — so it is requested for every registration, whether or
				 * not the user has set up messaging yet.
				 *
				 * The PRF *salt* is deliberately not set here. Extensions
				 * configured server-side are JSON-serialised, and a salt has to
				 * reach `navigator.credentials.get()` as real bytes; SimpleWebAuthn
				 * spreads `extensions` through untouched and converts only
				 * `challenge` and `allowCredentials`. So the salt is passed
				 * per-call from the browser, which is also what keeps the derived
				 * secret out of this process entirely — the passkey client strips
				 * `clientExtensionResults` before posting the assertion.
				 */
				registration: { extensions: PRF_REGISTRATION_EXTENSIONS }
			}),
			// Adds `user.role`. There is no hook here making the first account an
			// admin: a trigger in the migrations does that, so it holds however
			// the row is inserted — see drizzle/*_promote_first_user_to_admin.sql
			// and docs/features-and-admin.md.
			// No `ac`: the plugin only reads it on the client, for a client-side
			// permission check this app does not use; the server checks `roles`.
			admin({ roles: { admin: adminRole, user: userAc } }),
			// Must be last — Better Auth warns if the cookie plugin is not.
			sveltekitCookies(getRequestEvent)
		]
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth['$Infer']['Session']['session'];
export type User = Auth['$Infer']['Session']['user'];
