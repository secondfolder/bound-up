/**
 * Console diagnostics for the IQ test's pictures and clips.
 *
 * Everything goes to the console under one prefix, so it can be filtered on.
 * The pictures come from third parties the page does not control, and a
 * browser can refuse them in ways the page cannot see as an error — a content
 * blocker, tracking protection, a DNS filter. When pictures do not appear,
 * this is what says which: the feed (what the server found), and each image
 * and clip (what this browser then managed to load).
 *
 * `info` for what happened, `warn` only for a failure. Progress must not be a
 * warning: the e2e fixture fails a run on any console warning, and its stubbed
 * empty feed is a normal case, not a failure.
 */

const PREFIX = '[IQ test media]';

export function mediaInfo(message: string, ...details: unknown[]): void {
	console.info(`${PREFIX} ${message}`, ...details);
}

export function mediaWarn(message: string, ...details: unknown[]): void {
	console.warn(`${PREFIX} ${message}`, ...details);
}

/**
 * How many images from each host have loaded or failed on this page.
 *
 * One failure is noise — a deleted post, a slow CDN. Every image from a host
 * failing is a pattern with one likely cause, so that gets a summary of its
 * own, once, naming the host to look for in a blocker's log.
 */
const counts = new Map<string, { loaded: number; failed: number; summarised: boolean }>();

/** After this many failures with no success, a host is reported as blocked. */
export const BLOCKED_AFTER = 4;

export function recordImage(url: string, outcome: 'loaded' | 'failed'): void {
	const host = hostOf(url);
	const count = counts.get(host) ?? { loaded: 0, failed: 0, summarised: false };
	count[outcome] += 1;
	counts.set(host, count);
	if (outcome === 'failed') {
		mediaWarn(`Image failed to load from ${host}:`, url);
	}
	if (!count.summarised && count.loaded === 0 && count.failed >= BLOCKED_AFTER) {
		count.summarised = true;
		mediaWarn(
			`Every image from ${host} has failed (${count.failed} so far, none loaded). ` +
				'Something in this browser or network is probably blocking it: a content ' +
				"blocker, the browser's tracking protection, or a DNS filter. Opening one of " +
				'the URLs above directly in this browser will show which.'
		);
	}
}

/** Forget the counts. Tests only. */
export function resetMediaLog(): void {
	counts.clear();
}

export function hostOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

/** "12 from media.redgifs.com, 3 from i.redd.it", for the feed summary. */
export function byHost(urls: readonly string[]): string {
	const hosts = new Map<string, number>();
	for (const url of urls) {
		const host = hostOf(url);
		hosts.set(host, (hosts.get(host) ?? 0) + 1);
	}
	return [...hosts].map(([host, count]) => `${count} from ${host}`).join(', ') || 'none';
}
