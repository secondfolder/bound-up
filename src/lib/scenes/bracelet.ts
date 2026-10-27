/**
 * Marks where each line of a subtitle drawn in beads starts and ends
 * (`MenuDesign.subtitleBeads`): the first word of each line is
 * `data-line-start` and the last `data-line-end`, for a design to give each
 * line the loose ends of a bracelet of its own. Where a line wraps is only
 * known once it is laid out, so it is worked out again whenever the
 * subtitle's width or words change. See docs/scenes.md, "Menu designs".
 *
 * Alias-free. What is drawn at the ends must not change the layout (the
 * design places it out of the flow), or marking it could move a word onto
 * another line, and round again.
 */

import { BEAD_WORD_CLASS } from './menu-frame';

/** Which words start and end a line: each word's top, in order. */
export function lineEnds(tops: readonly number[]): { start: boolean; end: boolean }[] {
	return tops.map((top, at) => ({
		start: at === 0 || Math.abs(top - (tops[at - 1] ?? top)) > 1,
		end: at === tops.length - 1 || Math.abs(top - (tops[at + 1] ?? top)) > 1
	}));
}

/**
 * Keeps `subtitle`'s line ends marked until the returned function is
 * called, or until it leaves the page after being on it: the editor's menu
 * is drawn afresh with a new design, and has no hook to stop it.
 */
export function markBraceletLines(subtitle: HTMLElement): () => void {
	let frame = 0;
	let shown = false;
	const mark = () => {
		frame = 0;
		const words = [...subtitle.querySelectorAll<HTMLElement>(`.${BEAD_WORD_CLASS}`)];
		const ends = lineEnds(words.map((word) => word.offsetTop));
		for (const [at, word] of words.entries()) {
			word.toggleAttribute('data-line-start', ends[at]?.start ?? false);
			word.toggleAttribute('data-line-end', ends[at]?.end ?? false);
		}
	};
	const later = () => {
		shown ||= subtitle.isConnected;
		if (shown && !subtitle.isConnected) {
			stop();
			return;
		}
		if (frame === 0) {
			frame = requestAnimationFrame(mark);
		}
	};
	const resized = new ResizeObserver(later);
	resized.observe(subtitle);
	// Its words are drawn afresh as they are typed; only what it holds is
	// watched, not the marks this sets.
	const typed = new MutationObserver(later);
	typed.observe(subtitle, { childList: true, subtree: true, characterData: true });
	const stop = () => {
		cancelAnimationFrame(frame);
		resized.disconnect();
		typed.disconnect();
	};
	mark();
	return stop;
}
