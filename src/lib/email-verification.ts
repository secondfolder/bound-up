import { safeRedirect } from './safe-redirect';

/**
 * The paths the email-verification round trip passes through, and what the
 * login page makes of where it lands. See docs/email.md.
 *
 * Sign-up ends on the check-email page; the link in the email goes through
 * Better Auth's `/api/auth/verify-email`, which marks the address verified and
 * redirects to the `callbackURL` it was sent with — the login page, saying so.
 * An invite's `redirectTo` rides along the whole way, so accepting one still
 * works when the account was created to accept it.
 *
 * Alias-free and pure, so both the actions and their tests can build the same
 * URLs.
 */

function withRedirect(path: string, redirectTo: string | null | undefined): string {
	const safe = safeRedirect(redirectTo);
	if (!safe) {
		return path;
	}
	return `${path}${path.includes('?') ? '&' : '?'}redirectTo=${encodeURIComponent(safe)}`;
}

/** Where Better Auth sends someone once their link has been followed. */
export function verifiedCallback(redirectTo: string | null | undefined): string {
	return withRedirect('/login?verified=1', redirectTo);
}

/** The "we've sent you a link" page sign-up ends on. */
export function checkEmailPath(redirectTo: string | null | undefined): string {
	return withRedirect('/signup/check-email', redirectTo);
}

/**
 * Where sign-up sends the very first account on a server whose email is not
 * set up yet, which is let in without a link (see the sign-up action).
 */
export function firstAccountPath(redirectTo: string | null | undefined): string {
	return withRedirect('/login?setup=1', redirectTo);
}

/**
 * What the login page says about the link someone just followed, if anything;
 * or, for `first-account`, that there was no link to follow.
 */
export type VerificationNotice = 'verified' | 'expired' | 'invalid' | 'first-account' | null;

/**
 * Reads the login page's query. `verified=1` is ours; `error` is appended by
 * Better Auth when the token does not check out — `TOKEN_EXPIRED` for an old
 * one, and `INVALID_TOKEN` or `USER_NOT_FOUND` otherwise, which read the same
 * here: the person's next step is a new link either way.
 */
export function verificationNotice(query: URLSearchParams): VerificationNotice {
	const error = query.get('error');
	if (error === 'TOKEN_EXPIRED') {
		return 'expired';
	}
	if (error) {
		return 'invalid';
	}
	if (query.get('setup') === '1') {
		return 'first-account';
	}
	return query.get('verified') === '1' ? 'verified' : null;
}

/**
 * The address sign-up just used, handed to the check-email page so it can say
 * where the link went. A cookie rather than a query parameter, so the address
 * stays out of the URL, the history and any access log.
 *
 * It also carries when the last link went, so the page counts down only what
 * is left of the minute: someone coming back half an hour later can ask for
 * another link at once. Written by `checkEmailCookie`, read by
 * `readCheckEmailCookie`.
 */
export const CHECK_EMAIL_COOKIE = 'check_email';

/** Scoped to the page that reads it, and gone within the hour the per-address limit counts. */
export const CHECK_EMAIL_COOKIE_OPTIONS = {
	path: '/signup/check-email',
	httpOnly: true,
	sameSite: 'lax',
	maxAge: 60 * 60
} as const;

/** The cookie's value: when the last link went (ms since the epoch), then the address. */
export function checkEmailCookie(email: string, sentAt: number): string {
	return `${Math.floor(sentAt)}|${email}`;
}

const CHECK_EMAIL_VALUE: RegExp = /^(?<sentAt>\d{1,16})\|(?<email>.+)$/;

/** Reads `checkEmailCookie`'s value, or null for anything else. */
export function readCheckEmailCookie(
	value: string | undefined
): { email: string; sentAt: number } | null {
	// Split at the first bar: the timestamp is digits, and an address may
	// itself contain one.
	const match: RegExpExecArray | null = CHECK_EMAIL_VALUE.exec(value ?? '');
	if (!(match?.groups?.sentAt && match.groups.email)) {
		return null;
	}
	return { email: match.groups.email, sentAt: Number(match.groups.sentAt) };
}

/** Seconds of the resend cooldown still to wait after a link sent at `sentAt`. */
export function cooldownRemaining(sentAt: number, now: number): number {
	return Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000));
}

/** Where the check-email page's resend form posts: its action, keeping `redirectTo`. */
export function resendAction(redirectTo: string | null | undefined): string {
	// A form `action` of `?/resend` replaces the page's whole query string, so
	// without this the invite an account was made for was dropped from every
	// resent link.
	return withRedirect('?/resend', redirectTo);
}

/** What the resend form says after any resend that was not refused. Never "no such account". */
export const RESENT_MESSAGE =
	'If that address has an account waiting to be confirmed, a new link is on its way.';

/**
 * How long the check-email page waits before offering another link, and the
 * window `VERIFICATION_EMAIL_PER_ADDRESS` in `server/rate-limit.ts` enforces
 * it with: one link per address per this many seconds.
 */
export const RESEND_COOLDOWN_SECONDS = 60;
