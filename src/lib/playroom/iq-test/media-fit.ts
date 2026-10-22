/**
 * How many pictures and clips fill a column of porn (or a strip) exactly.
 *
 * Each item has a natural length along the column — its height at the
 * column's width, from its shape — and the column a length to fill. Too few
 * and there is a gap at the end; too many and the last runs off the edge.
 * So the count chosen is the one whose natural lengths come nearest the
 * space, and the items are then all scaled by the same small factor to fill
 * it exactly, cropping a little (`object-fit: cover`) rather than leaving a
 * gap or overflowing. Alias-free and pure, so it is tested without a browser.
 */

/**
 * The count, from `least` up to all of them, whose items' natural lengths
 * (plus the gaps between them) are nearest the space, as a ratio: shrinking
 * by a half is as far off as growing by double.
 */
export function fitCount(
	lengths: readonly number[],
	space: number,
	gap: number,
	least = 1
): number {
	if (lengths.length === 0 || space <= 0) {
		return Math.min(lengths.length, Math.max(0, least));
	}
	const from = Math.min(lengths.length, Math.max(1, least));
	let best = from;
	let bestMiss = Number.POSITIVE_INFINITY;
	let total = 0;
	for (let count = 1; count <= lengths.length; count += 1) {
		total += lengths[count - 1] ?? 0;
		if (count < from) {
			continue;
		}
		const room = space - gap * (count - 1);
		const miss = room <= 0 ? Number.POSITIVE_INFINITY : Math.abs(Math.log(room / total));
		if (miss < bestMiss) {
			best = count;
			bestMiss = miss;
		}
	}
	return best;
}

/**
 * The porn columns either side of the question, on a wide window: as many as
 * it takes to reach the window's edge from the question's, each no wider
 * than `widest`, all the same width and together exactly the room. Never one
 * running off the edge: that was a hard cut down one side of a picture, with
 * its buttons off centre, where cropping it a little to fit is not. The
 * fewest that fit, so each is as wide as it can be — at least about half the
 * widest, since one more column only comes in once each would be wider.
 */
export function sideColumns(
	room: number,
	gap: number,
	widest: number
): { count: number; width: number } {
	const count = Math.max(1, Math.ceil((room + gap) / (widest + gap)));
	const width = Math.max(0, (room - gap * (count - 1)) / count);
	return { count, width };
}

/**
 * How the porn is laid out at an intensity, in rem: the gap between pieces
 * (and between the outermost and the window's edge), how wide a column may
 * be, and how tall a strip is. At 4 it is packed, small and many; at 3 there
 * is more room between fewer, bigger pieces, so less porn shows.
 */
export type PornSpacing = { gap: number; widest: number; strip: number };

export function pornSpacing(intensity: number): PornSpacing {
	return intensity >= 4 ? { gap: 0.5, widest: 20, strip: 9 } : { gap: 2.5, widest: 40, strip: 18 };
}

/** The densest "Give up and goon" goes: its slider runs from 0 to this. */
export const GOON_DENSITY_MAX = 6;
/** Where its slider starts: about level 4's packing. */
export const GOON_DENSITY_DEFAULT = 3;

/**
 * How the porn is laid out alone, at a density from 0 to `GOON_DENSITY_MAX`:
 * from level 3's room around few big pieces at 0, through about level 4's
 * at the middle, to well past it, many small pieces almost touching. The
 * gap shrinks evenly; the widest column and the strip by a constant factor
 * a step, so each step looks about as big a change as the last.
 */
export function goonSpacing(density: number): PornSpacing {
	const t = Math.min(1, Math.max(0, density / GOON_DENSITY_MAX));
	return {
		gap: 2.5 + (0.25 - 2.5) * t,
		widest: 40 * (10 / 40) ** t,
		strip: 18 * (6 / 18) ** t
	};
}

/** The most strips a space below the question is filled with, however tall. */
export const MOST_FILL_ROWS = 8;

/**
 * How many strips of porn fill a space, each about `strip` tall: none when
 * there is not room for even a short one (under 60% of a strip), unless at
 * least `least` are wanted regardless.
 */
export function stripRows(space: number, gap: number, strip: number, least = 0): number {
	if (space < strip * 0.6) {
		return least;
	}
	const rows = Math.round((space + gap) / (strip + gap));
	return Math.min(MOST_FILL_ROWS, Math.max(least, 1, rows));
}
