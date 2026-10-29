/**
 * The links in a brief, and what reading them may touch (docs/dreams.md,
 * "Research"). The model chooses every URL it fetches, so a page could
 * otherwise send it on to a URL of the page's choosing with the brief in its
 * query string: only the sites the brief's own links are on can be opened,
 * and only so many pages.
 *
 * Pure and alias-free.
 */

const LINK = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/** The most links in one brief that are read. */
export const MAX_BRIEF_LINKS = 5;
/** The most pages read for one brief: its own links and a few they lead to. */
export const MAX_PAGES_READ = 8;
/** Pages besides the brief's own that may be read, for a brief that links an index. */
const LINKED_PAGES_ALLOWED = 4;

/** The http(s) links in a brief, each once; a sentence's punctuation after one is not part of it. */
export function briefLinks(brief: string): string[] {
	const links = (brief.match(LINK) ?? []).map((link) => link.replace(TRAILING_PUNCTUATION, ''));
	return [...new Set(links)].slice(0, MAX_BRIEF_LINKS);
}

/** How many pages a brief's reading may fetch in all (the fetch tool's `max_uses`). */
export function pagesToRead(brief: string): number {
	return Math.min(briefLinks(brief).length + LINKED_PAGES_ALLOWED, MAX_PAGES_READ);
}

/** The sites a brief's reading may fetch from: only those its own links are on. */
export function readableHosts(brief: string): string[] {
	const hosts = briefLinks(brief).flatMap((link) => {
		try {
			return [new URL(link).hostname];
		} catch {
			return [];
		}
	});
	return [...new Set(hosts)];
}

/**
 * Whether a page that was fetched is one the brief allowed: on one of its
 * sites. The provider enforces the same list; this is the check that the
 * page shows, with ✓ or ✗.
 */
export function isAllowedPage(url: string, hosts: readonly string[]): boolean {
	try {
		return hosts.includes(new URL(url).hostname);
	} catch {
		return false;
	}
}
