/**
 * The current context: whose things a list shows. The pure half; see
 * docs/contexts.md.
 *
 * A context is a view filter and nothing else. "Everyone" (`all`) shows every
 * space the viewer is in, and a space shows that space alone: their own
 * ("Me") or one partnership's. It lives in one cookie per device, so every tab
 * shares it and any tab can change it at any moment — which is why no write
 * may ever read it. Every action that creates or changes something names its
 * space in the form, and the server checks membership of that space.
 *
 * Alias-free, like `spaces.ts`: the server's resolver and the browser's
 * visibility check both parse the cookie with this.
 */

/** Everyone, or one space by its id. */
export type AppContext = { kind: 'all' } | { kind: 'space'; spaceId: string };

/**
 * The cookie the context lives in. Not httpOnly: the app shell reads it on
 * coming back to a tab, to see whether another tab has changed it since the
 * page was rendered. It says only which of your own spaces you were last
 * looking at, which is nothing a script on the page could not see anyway.
 */
export const CONTEXT_COOKIE = 'context';

/** Every context-dependent load `depends()` on this; switching invalidates it. */
export const CONTEXT_DEPENDENCY = 'app:context';

/** Four hundred days, the longest a browser keeps a cookie: it is a per-device preference. */
export const CONTEXT_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export const ALL_CONTEXT: AppContext = { kind: 'all' };

const ALL_VALUE = 'all';
const SPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The context a cookie value names, before anyone has checked the viewer is
 * in that space. Anything that is not `all` or the shape of a space id is
 * `all`: an ambient context never fails, it falls back.
 */
export function parseContext(value: string | null | undefined): AppContext {
	if (typeof value === 'string' && SPACE_ID.test(value)) {
		return { kind: 'space', spaceId: value.toLowerCase() };
	}
	return ALL_CONTEXT;
}

export function serialiseContext(context: AppContext): string {
	return context.kind === 'all' ? ALL_VALUE : context.spaceId;
}

export function sameContext(a: AppContext, b: AppContext): boolean {
	return serialiseContext(a) === serialiseContext(b);
}

/**
 * The context, checked against the spaces the viewer is in: one they are not
 * in (a partnership that has ended, a pasted id) is `all`.
 */
export function validContext(context: AppContext, spaceIds: readonly string[]): AppContext {
	return context.kind === 'space' && spaceIds.includes(context.spaceId) ? context : ALL_CONTEXT;
}

/** The spaces a context shows, out of the viewer's own. */
export function spacesInContext<Space extends { id: string }>(
	context: AppContext,
	spaces: readonly Space[]
): Space[] {
	return context.kind === 'all'
		? [...spaces]
		: spaces.filter((space) => space.id === context.spaceId);
}

/** The value of one cookie in a `document.cookie` string, or null. */
export function readCookie(cookieString: string, name: string): string | null {
	for (const part of cookieString.split(';')) {
		const [key, ...rest] = part.trim().split('=');
		if (key === name) {
			return decodeURIComponent(rest.join('='));
		}
	}
	return null;
}
