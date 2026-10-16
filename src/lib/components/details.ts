/**
 * Opens a `wa-details` from the start, when `open` is true.
 *
 * An attachment rather than `open={…}` in markup: the server renderer only
 * drops a `false` boolean for attributes it knows, so `open={false}` renders
 * `open="false"`, which Lit reads as open until hydration (AGENTS.md, "Boolean
 * properties with no SSR special case stay out of markup"). An attachment
 * runs only in the browser, so a details meant to start closed is closed in
 * the server's HTML too.
 *
 * Pass a value captured once: an attachment re-runs when what it reads
 * changes, and this one would re-open a details the user had closed.
 */
export function startOpen(open: boolean) {
	return (node: HTMLElement & { open: boolean }) => {
		if (open) {
			node.open = true;
		}
	};
}
