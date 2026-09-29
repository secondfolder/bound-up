// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** Any origin works, as long as nothing an attacker writes can be it. */
const PROBE_ORIGIN = 'http://redirect.invalid';

/**
 * Validates a `?redirectTo=` value before it is used in a redirect.
 *
 * Needed because the invite flow sends a signed-out visitor to /login and has
 * to bring them back to the invite afterwards. Anything that could leave the
 * origin is rejected outright rather than sanitised: `//evil.example` and
 * `/\evil.example` are both read as protocol-relative URLs by browsers, and an
 * absolute URL is an open redirect by definition.
 *
 * The prefix checks alone were not enough. A browser parses `Location` with the
 * WHATWG URL parser, which strips every tab and newline before reading it, so
 * `/<TAB>/evil.example` passed the second-character check and was followed as
 * `//evil.example`. Control characters are refused outright, and the value is
 * then resolved with that same parser and must stay on the origin, so what is
 * checked is what the browser will do.
 */
export function safeRedirect(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	if (!value.startsWith('/')) {
		return null;
	}
	// Second character decides: '/' or '\' makes it protocol-relative.
	if (value.length > 1 && (value[1] === '/' || value[1] === '\\')) {
		return null;
	}
	if (CONTROL_CHARACTER.test(value)) {
		return null;
	}
	if (new URL(value, PROBE_ORIGIN).origin !== PROBE_ORIGIN) {
		return null;
	}
	return value;
}

/** `next` if it is safe, otherwise the signed-in landing page. */
export function redirectTargetOrHome(value: string | null | undefined): string {
	return safeRedirect(value) ?? '/home';
}
