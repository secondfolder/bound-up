/**
 * A point in a drawn passage, as an offset into the passage as stored.
 *
 * A passage is drawn without its markup (`passage-format.ts`), so the length
 * of the text before a point on screen is not its offset in the stored text:
 * every hidden `**` or say tag before it would be missing. Each run is drawn
 * as one element holding one text node and carrying `data-start`, its offset
 * in the stored text, so a point inside a run is that plus how far into the
 * run it is. A point anywhere else, between elements, counts as the start of
 * the next run, or the end of the last.
 *
 * Browser-only: it reads the DOM.
 */
export function storedOffset(root: Element, node: Node, offset: number): number {
	const element = node instanceof Element ? node : node.parentElement;
	const run = node.nodeType === Node.TEXT_NODE ? element?.closest('[data-start]') : null;
	if (run instanceof HTMLElement && root.contains(run)) {
		return Number(run.dataset.start) + offset;
	}
	const point = document.createRange();
	point.setStart(node, offset);
	let last: HTMLElement | null = null;
	for (const candidate of root.querySelectorAll<HTMLElement>('[data-start]')) {
		if (point.comparePoint(candidate, 0) >= 0) {
			return Number(candidate.dataset.start);
		}
		last = candidate;
	}
	return last ? Number(last.dataset.start) + (last.textContent?.length ?? 0) : 0;
}
