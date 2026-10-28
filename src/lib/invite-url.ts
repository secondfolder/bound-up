/**
 * The invite's path, which is all the server sends. The browser makes it
 * absolute with `inviteUrl`.
 *
 * Not an absolute URL from the server, because the request's origin is not
 * always the one the inviter is on: behind the dev tunnel, which ends TLS and
 * forwards plain HTTP to `vite dev`, the server saw `http://` while the page
 * was on `https://`. The link it built then opened on an insecure origin,
 * where `crypto.subtle` does not exist and the invite cannot be opened.
 */
export function invitePath(token: string): string {
	return `/invite/${encodeURIComponent(token)}`;
}

/**
 * Builds the absolute URL that gets shared out-of-band, on the origin the
 * inviter's browser is actually on (`location.origin`).
 *
 * Absolute rather than relative because it leaves the app entirely — it is
 * pasted into a message.
 */
export function inviteUrl(origin: string, path: string): string {
	return new URL(path, origin).toString();
}
