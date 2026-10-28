/**
 * The context switcher's fan as geometry: where its disk is centred, which
 * part of the ring round that centre can be seen, and where each option goes
 * on that part so that every one is the same angle from its neighbours and no
 * name runs into another option or off the screen. Pure and alias-free, so it
 * is unit-tested without a browser; `ContextSwitcher` measures the screen and
 * draws what this returns. See docs/contexts.md, "The fan".
 *
 * Angles are degrees on the screen: 0 points right, and they grow clockwise
 * because y grows downwards, so 90 is straight down and 180 is left.
 */

import { backOut, cubicIn, cubicOut } from 'svelte/easing';

export type Point = { x: number; y: number };
export type Box = { left: number; top: number; right: number; bottom: number };
/** A run of the ring from `start` to `end`, `end` ≥ `start`; `end` may pass 360. */
export type Arc = { start: number; end: number };
/** An option's size: its avatar's diameter, and the widest its name may be. */
export type OptionSize = { avatar: number; label: number };

/** Between an avatar and the name under it. */
export const LABEL_GAP = 3;
/** One line of a name, at the size the switcher sets it. */
export const LABEL_HEIGHT = 13;
/**
 * Clear space kept between any two options. Wide enough that the avatar a
 * finger is over, drawn larger, still all but clears the names beside it.
 */
export const OPTION_GAP = 4;
/**
 * How much larger the lit option's avatar is drawn. Its name moves down by
 * the growth, so the two never meet, and every layout leaves room for that
 * around every option, since any of them may be lit.
 */
export const HOVER_SCALE = 1.14;

/** How far a lit avatar grows past its edge, all round, and so how far its name moves down. */
export function hoverShift(avatar: number): number {
	return (avatar * (HOVER_SCALE - 1)) / 2;
}

/** Clear space kept between an option and the edge of what can be seen. */
export const EDGE_MARGIN = 8;
/**
 * From the control's right end and middle to the disk's centre: a little
 * right and up. 16 is the page gutter on a phone, so where the control sits
 * there (the end of the page header's first line) the centre is the screen's
 * top-right corner.
 */
export const CENTRE_OFFSET = { x: 16, y: 24 } as const;
/**
 * A centre this close to the shell's edge goes onto it. The gutter is wider
 * than 16 on a larger screen, and a disk 8px short of the corner would show
 * a sliver of its far side for nothing.
 */
export const CENTRE_SNAP = 16;
/** The avatars' sizes, largest first: a crowded fan trades size for room to name them. */
export const AVATAR_SIZES = [56, 52, 48, 44, 40, 36] as const;
/** A name this wide fits most first names whole; a fan that allows it stops growing. */
export const LABEL_TARGET = 80;
/**
 * Short of the target, a size of avatar that still allows names this wide
 * is kept rather than shrunk further: "Everyone" and "Add partner" fit.
 */
export const LABEL_GOOD = 64;
/** The widest a name is ever drawn, however much room there is; longer ones end in "…". */
export const LABEL_MAX = 120;
/** Narrower than this a name is not worth drawing at all. */
export const LABEL_MIN = 36;
/**
 * One ring that only fits its names with avatars smaller than this gives
 * way to a staggered one, if that keeps them bigger.
 */
export const ONE_RING_AVATAR = 48;
/** The ring is never tighter than this, so a short fan still reads as a fan. */
export const MIN_RADIUS = 140;
const RADIUS_STEP = 4;

/** Where a disk centred for a control at `control` goes, inside the app shell `shell`. */
export function fanCentre(control: { right: number; middle: number }, shell: Box): Point {
	let x = Math.min(control.right + CENTRE_OFFSET.x, shell.right);
	let y = Math.max(control.middle - CENTRE_OFFSET.y, shell.top);
	if (shell.right - x <= CENTRE_SNAP) {
		x = shell.right;
	}
	if (y - shell.top <= CENTRE_SNAP) {
		y = shell.top;
	}
	return { x, y };
}

const RADIANS = Math.PI / 180;

/** The point on the ring of `radius` round `centre` at `angle`. */
export function pointAt(centre: Point, radius: number, angle: number): Point {
	return {
		x: centre.x + radius * Math.cos(angle * RADIANS),
		y: centre.y + radius * Math.sin(angle * RADIANS)
	};
}

/**
 * What an option centred on `at` covers: its avatar, and under it the box
 * its name may fill. The name is centred under the avatar and may be wider
 * than it.
 */
export function optionBoxes(
	at: Point,
	{ avatar, label }: OptionSize,
	lit = false
): { avatar: Box; label: Box } {
	const half = avatar / 2 + (lit ? hoverShift(avatar) : 0);
	const top = at.y + avatar / 2 + LABEL_GAP + (lit ? hoverShift(avatar) * 2 : 0);
	return {
		avatar: { left: at.x - half, top: at.y - half, right: at.x + half, bottom: at.y + half },
		label: { left: at.x - label / 2, top, right: at.x + label / 2, bottom: top + LABEL_HEIGHT }
	};
}

/** Whether two boxes come closer than `gap`. */
export function boxesOverlap(a: Box, b: Box, gap = 0): boolean {
	return (
		a.left < b.right + gap &&
		b.left < a.right + gap &&
		a.top < b.bottom + gap &&
		b.top < a.bottom + gap
	);
}

/** `box` shrunk by `by` on every side. */
export function inset(box: Box, by: number): Box {
	return { left: box.left + by, top: box.top + by, right: box.right - by, bottom: box.bottom - by };
}

/**
 * Whether an option at `angle` on the ring is wholly inside `bounds`.
 * Inlined arithmetic rather than `optionBoxes`, since the layout asks this
 * a great many times.
 */
function optionInside(
	centre: Point,
	radius: number,
	angle: number,
	{ avatar, label }: OptionSize,
	bounds: Box
): boolean {
	const x = centre.x + radius * Math.cos(angle * RADIANS);
	const y = centre.y + radius * Math.sin(angle * RADIANS);
	const across = Math.max(avatar + 2 * hoverShift(avatar), label) / 2;
	// Room for it lit: the avatar grown, the name moved down.
	return (
		x - across >= bounds.left &&
		x + across <= bounds.right &&
		y - avatar / 2 - hoverShift(avatar) >= bounds.top &&
		y + avatar / 2 + 2 * hoverShift(avatar) + LABEL_GAP + LABEL_HEIGHT <= bounds.bottom
	);
}

const SAMPLE_STEP = 2;

/**
 * The longest unbroken run of the ring on which an option of `size` is wholly
 * inside `bounds`, or null when there is none. The whole ring when all of it
 * is. Found by sampling every 2° and then narrowing each end down to a
 * hundredth of a degree, so an end is where the option touches the edge.
 */
export function visibleArc(
	centre: Point,
	radius: number,
	bounds: Box,
	size: OptionSize
): Arc | null {
	const count = 360 / SAMPLE_STEP;
	const inside = (angle: number) => optionInside(centre, radius, angle, size, bounds);
	const samples = Array.from({ length: count }, (_, index) => inside(index * SAMPLE_STEP));
	const firstOut = samples.indexOf(false);
	if (firstOut === -1) {
		return { start: 0, end: 360 };
	}
	if (!samples.includes(true)) {
		return null;
	}
	// Walked from just after a sample that is out, so no run wraps past the end.
	let best: { from: number; to: number } | null = null;
	let from: number | null = null;
	for (let step = 1; step <= count; step += 1) {
		const index = firstOut + step;
		if (samples[index % count]) {
			from ??= index;
		} else if (from !== null) {
			if (!best || index - 1 - from > best.to - best.from) {
				best = { from, to: index - 1 };
			}
			from = null;
		}
	}
	if (!best) {
		return null;
	}
	// Between an angle that is out and one that is in, where the option touches the edge.
	const edge = (outside: number, within: number) => {
		let out = outside;
		let into = within;
		for (let round = 0; round < 10; round += 1) {
			const middle = (out + into) / 2;
			if (inside(middle)) {
				into = middle;
			} else {
				out = middle;
			}
		}
		return into;
	};
	const start = edge((best.from - 1) * SAMPLE_STEP, best.from * SAMPLE_STEP);
	const end = edge((best.to + 1) * SAMPLE_STEP, best.to * SAMPLE_STEP);
	const turns = Math.floor(start / 360) * 360;
	return { start: start - turns, end: end - turns };
}

/**
 * `count` angles evenly spread along `arc`, the first at its end and the last
 * at its start: on a disk centred at the top of the screen that is left to
 * right, so the fan reads in the switcher's order. Round a whole ring they
 * are evenly spread round it instead, since its two ends are one place.
 */
export function spreadEvenly(arc: Arc, count: number): number[] {
	if (count <= 0) {
		return [];
	}
	const span = arc.end - arc.start;
	if (count === 1) {
		return [arc.start + span / 2];
	}
	const step = span >= 360 ? 360 / count : span / (count - 1);
	return Array.from({ length: count }, (_, index) => arc.end - index * step);
}

/** The angle between neighbours in a fan of `count` along `arc`. */
export function stepAlong(arc: Arc, count: number): number {
	const span = arc.end - arc.start;
	if (count <= 1) {
		return Math.min(span, 90);
	}
	return span >= 360 ? 360 / count : span / (count - 1);
}

/**
 * The widest every name may be, with options centred on `points`, so that no
 * name comes within `OPTION_GAP` of another name or of another option's
 * avatar; at most `LABEL_MAX`. Negative infinity when two avatars already
 * collide, which no name width can mend.
 */
export function labelBudget(points: readonly Point[], avatar: number): number {
	// Any option may be lit: its avatar grown by `shift` all round and its
	// name moved down by twice that. So each name is allowed for down to its
	// lit place, and each avatar at its lit size.
	const shift = hoverShift(avatar);
	const half = avatar / 2 + shift;
	let budget: number = LABEL_MAX;
	for (const [i, a] of points.entries()) {
		for (const [j, b] of points.entries()) {
			if (i === j) {
				continue;
			}
			const across = Math.abs(a.x - b.x);
			if (i < j) {
				const apart = avatar + shift + OPTION_GAP;
				if (across < apart && Math.abs(a.y - b.y) < apart) {
					return Number.NEGATIVE_INFINITY;
				}
				// Two names on the same line, either moved down, need their
				// whole widths apart.
				if (Math.abs(a.y - b.y) < LABEL_HEIGHT + 2 * shift + OPTION_GAP) {
					budget = Math.min(budget, across - OPTION_GAP);
				}
			}
			// a's name, at rest or moved down, level with b's avatar, grown,
			// needs half of each apart.
			const labelTop = a.y + avatar / 2 + LABEL_GAP;
			const labelBottom = labelTop + LABEL_HEIGHT + 2 * shift;
			if (labelTop < b.y + half + OPTION_GAP && labelBottom + OPTION_GAP > b.y - half) {
				budget = Math.min(budget, 2 * (across - half - OPTION_GAP));
			}
		}
	}
	return budget;
}

type Fit = { label: number; arc: Arc };

/** The radius of the `index`th option: every other one is `stagger` further in. */
function radiusOf(index: number, radius: number, stagger: number): number {
	return index % 2 === 1 ? radius - stagger : radius;
}

/** The part two arcs share, either possibly a turn from the other; null when none. */
function sharedArc(a: Arc, b: Arc): Arc | null {
	if (a.end - a.start >= 360) {
		return b;
	}
	if (b.end - b.start >= 360) {
		return a;
	}
	let best: Arc | null = null;
	for (const turn of [-360, 0, 360]) {
		const start = Math.max(a.start, b.start + turn);
		const end = Math.min(a.end, b.end + turn);
		if (end >= start && (!best || end - start > best.end - best.start)) {
			best = { start, end };
		}
	}
	return best;
}

/**
 * The widest names a fan of `count` avatars of `avatar` on the ring of
 * `radius` (every other one `stagger` further in, when crowded) can have,
 * and the arc they go on; null when it cannot have even `LABEL_MIN`. The two
 * depend on each other: a wider name needs more margin at the screen's
 * edges, which shortens the arc and so crowds the options, which allows
 * narrower names. So a width is tried by laying the fan out for it and
 * checking the spacing allows it, and the widest that passes is found by
 * halving the range, to the pixel.
 */
function fitLabel(
	centre: Point,
	radius: number,
	bounds: Box,
	count: number,
	avatar: number,
	stagger: number
): Fit | null {
	const attempt = (label: number): Fit | null => {
		const outer = visibleArc(centre, radius, bounds, { avatar, label });
		const inner =
			stagger > 0 && count > 1
				? visibleArc(centre, radius - stagger, bounds, { avatar, label })
				: outer;
		const arc = outer && inner ? sharedArc(outer, inner) : null;
		if (!arc) {
			return null;
		}
		const points = spreadEvenly(arc, count).map((angle, index) =>
			pointAt(centre, radiusOf(index, radius, stagger), angle)
		);
		return labelBudget(points, avatar) >= label ? { label, arc } : null;
	};
	const widest = attempt(LABEL_MAX);
	if (widest) {
		return widest;
	}
	let best = attempt(LABEL_MIN);
	if (!best) {
		return null;
	}
	let low = LABEL_MIN;
	let high = LABEL_MAX;
	while (high - low > 1) {
		const middle = Math.floor((low + high) / 2);
		const fit = attempt(middle);
		if (fit) {
			best = fit;
			low = middle;
		} else {
			high = middle;
		}
	}
	return best;
}

export type FanLayout = {
	centre: Point;
	/** The ring's radius: the options', or the outer ones' when staggered. */
	radius: number;
	/**
	 * How much further in every other option sits: 0 on one ring. Only a fan
	 * too crowded for one ring to leave its names room staggers.
	 */
	stagger: number;
	avatar: number;
	/** The widest each name is drawn. */
	label: number;
	/** The part of the ring the options are spread along. */
	arc: Arc;
	/** The angle between neighbours, and so the selection wedge's width. */
	step: number;
	/** Each option's angle, in the switcher's order. */
	angles: number[];
	/** Each option's avatar's centre, in the switcher's order. */
	points: Point[];
	/** The disk's radius: past the names of the options on the ring. */
	disk: number;
	/** False when nothing fitted and the options are drawn regardless, overlapping. */
	fits: boolean;
};

type Candidate = { radius: number; avatar: number; stagger: number; fit: Fit };

function build(centre: Point, chosen: Candidate, count: number, fits: boolean): FanLayout {
	const { radius, avatar, stagger, fit } = chosen;
	const angles = spreadEvenly(fit.arc, count);
	return {
		centre,
		radius,
		stagger,
		avatar,
		label: fit.label,
		arc: fit.arc,
		step: stepAlong(fit.arc, count),
		angles,
		points: angles.map((angle, index) => pointAt(centre, radiusOf(index, radius, stagger), angle)),
		disk: radius + avatar / 2 + 2 * hoverShift(avatar) + LABEL_GAP + LABEL_HEIGHT + 12,
		fits
	};
}

/**
 * The best fan with every other option `stagger` in (0 for one ring): the
 * first, from the largest avatars down, whose smallest ring gives names
 * `LABEL_TARGET`; failing that the largest avatars that still give them
 * `LABEL_GOOD`; failing that whatever gives them the most.
 */
function search(
	centre: Point,
	bounds: Box,
	count: number,
	farthest: number,
	stagger: (avatar: number) => number
): Candidate | null {
	const roomiest: Candidate[] = [];
	for (const avatar of AVATAR_SIZES) {
		let best: Candidate | null = null;
		const inward = stagger(avatar);
		for (let radius = MIN_RADIUS + inward; radius <= farthest; radius += RADIUS_STEP) {
			const fit = fitLabel(centre, radius, bounds, count, avatar, inward);
			if (!fit) {
				continue;
			}
			const candidate = { radius, avatar, stagger: inward, fit };
			if (fit.label >= LABEL_TARGET) {
				return candidate;
			}
			if (!best || fit.label > best.fit.label) {
				best = candidate;
			}
		}
		if (best) {
			roomiest.push(best);
		}
	}
	return (
		roomiest.find((candidate) => candidate.fit.label >= LABEL_GOOD) ??
		roomiest.reduce<Candidate | null>(
			(most, candidate) => (!most || candidate.fit.label > most.fit.label ? candidate : most),
			null
		)
	);
}

/**
 * The fan for `count` options round `centre`, inside `bounds` (what can be
 * seen of the app shell above its bottom nav).
 *
 * The options go evenly along all of the ring that can be seen, which is a
 * quarter when the centre is a corner and a half when it is the middle of the
 * top edge. Of the layouts where no name collides, it takes the largest
 * avatars, and for those the smallest ring that gives every name
 * `LABEL_TARGET` (see `search`). A fan that one ring cannot give even
 * `LABEL_GOOD` with avatars of `ONE_RING_AVATAR` (five or six partners on a
 * phone, eight or nine options on a quarter circle) staggers instead: every other option a row further in, at the same even
 * angles, so each name has the room of two steps rather than one.
 */
export function layoutFan({
	centre,
	bounds: shown,
	count
}: {
	centre: Point;
	bounds: Box;
	count: number;
}): FanLayout {
	const bounds = inset(shown, EDGE_MARGIN);
	const farthest = Math.max(
		...[
			[bounds.left, bounds.top],
			[bounds.right, bounds.top],
			[bounds.left, bounds.bottom],
			[bounds.right, bounds.bottom]
		].map(([x = 0, y = 0]) => Math.hypot(x - centre.x, y - centre.y))
	);
	const single = search(centre, bounds, count, farthest, () => 0);
	if (single && single.fit.label >= LABEL_GOOD && single.avatar >= ONE_RING_AVATAR) {
		return build(centre, single, count, true);
	}
	// A row in by about an avatar and its name, so an inner option's avatar
	// sits level with its outer neighbours' names rather than on them.
	const staggered = search(
		centre,
		bounds,
		count,
		farthest,
		(diameter) => diameter + 2 * hoverShift(diameter) + LABEL_GAP + LABEL_HEIGHT
	);
	// Names with room first, then the larger avatars, then the roomier names.
	const better = (a: Candidate, b: Candidate) => {
		const roomy = a.fit.label >= LABEL_GOOD;
		if (roomy !== b.fit.label >= LABEL_GOOD) {
			return roomy;
		}
		if (a.avatar !== b.avatar) {
			return a.avatar > b.avatar;
		}
		return a.fit.label > b.fit.label;
	};
	const chosen = staggered && (!single || better(staggered, single)) ? staggered : single;
	if (chosen) {
		return build(centre, chosen, count, true);
	}
	// A window too small for any fan: the smallest avatars on the tightest
	// ring, along whatever of it shows, overlapping as they must.
	const avatar = AVATAR_SIZES.at(-1) ?? 36;
	const size = { avatar, label: LABEL_MIN };
	const arc = visibleArc(centre, MIN_RADIUS, bounds, size) ?? { start: 90, end: 180 };
	return build(
		centre,
		{ radius: MIN_RADIUS, avatar, stagger: 0, fit: { label: LABEL_MIN, arc } },
		count,
		false
	);
}

/** The hint's distance from the top of the shell, and from its right edge when it sits there. */
export const HINT_INSET = 12;

/**
 * The share of the disk's radius that may be cut off on the right before
 * the hint moves to the right edge of the page. "More than a third of the
 * circle's right side is cut off" means: the disk's rightmost point, its
 * centre plus its radius (`disk`, out past the names), lies more than a
 * third of that radius beyond the shell's right edge. On a phone the centre
 * is the edge itself, so the whole right half is cut off; on a wide screen
 * the disk sits clear of the edge and nothing is.
 */
export const HINT_RIGHT_CUT = 1 / 3;

/** Which way the hint sits: against the right edge, or centred over the disk. */
export type HintSide = 'right' | 'centre';

/** How far past the shell's right edge the disk reaches, as a share of its radius; 0 when it does not. */
export function rightCut(layout: FanLayout, bounds: Box): number {
	return Math.max(0, layout.centre.x + layout.disk - bounds.right) / layout.disk;
}

export function hintSide(layout: FanLayout, bounds: Box): HintSide {
	return rightCut(layout, bounds) > HINT_RIGHT_CUT ? 'right' : 'centre';
}

/**
 * Where a hint of `size` goes, at the top of the page: against its right
 * edge with its text right-aligned when more than a third of the disk is
 * cut off there (`hintSide`), centred over the disk's centre with its text
 * centred otherwise, and inside `bounds` either way. Its top-left corner,
 * and which side. Where that would cover an option (avatar or name, the
 * pill standing in for the current one included) it moves down, a few
 * pixels at a time, until clear: below the top row rather than over it.
 * Null only when nothing clear is found on the page at all.
 */
export function hintPlacement(
	layout: FanLayout,
	bounds: Box,
	size: { width: number; height: number }
): { x: number; y: number; side: HintSide } | null {
	const side = hintSide(layout, bounds);
	const width = Math.min(size.width, bounds.right - bounds.left - 2 * HINT_INSET);
	const wanted = side === 'right' ? bounds.right - HINT_INSET - width : layout.centre.x - width / 2;
	const x = Math.min(Math.max(wanted, bounds.left + HINT_INSET), bounds.right - HINT_INSET - width);
	const options = layout.points.map((at) => optionBoxes(at, layout));
	for (let y = bounds.top + HINT_INSET; y + size.height <= bounds.bottom - HINT_INSET; y += 4) {
		const box = { left: x, top: y, right: x + width, bottom: y + size.height };
		const clear = options.every(
			(option) =>
				!(
					boxesOverlap(box, option.avatar, OPTION_GAP) ||
					boxesOverlap(box, option.label, OPTION_GAP)
				)
		);
		if (clear) {
			return { x, y, side };
		}
	}
	return null;
}

/**
 * Within this of the disk's centre, nothing is under the finger: a press
 * starts on the pill, which on a phone is near the centre, and a wobble
 * there must not pick something.
 */
export const DEAD_ZONE = 48;

/**
 * Which option a point is over while sliding: the index of the one whose
 * sector of the disk it is in, or null. Each option owns the slice of the
 * disk round it, from the centre to the disk's edge, with its borders
 * halfway to its neighbours, which is exactly the selection wedge drawn
 * under it, so what lights up is what letting go picks. Off the disk, within
 * `DEAD_ZONE` of its centre, within `quiet` of `still` (where the press
 * began), or past the half-step beyond either end of the arc, it is over
 * none.
 */
export function optionAt(
	layout: FanLayout,
	at: Point,
	{ still = null, quiet = 0 }: { still?: Point | null; quiet?: number } = {}
): number | null {
	const count = layout.angles.length;
	const distance = Math.hypot(at.x - layout.centre.x, at.y - layout.centre.y);
	if (count === 0 || distance > layout.disk || distance < DEAD_ZONE) {
		return null;
	}
	if (still && Math.hypot(at.x - still.x, at.y - still.y) < quiet) {
		return null;
	}
	const { step } = layout;
	const angle = (Math.atan2(at.y - layout.centre.y, at.x - layout.centre.x) * 180) / Math.PI;
	const first = layout.angles[0] ?? 0;
	// How far round from the first option, the way the options go (towards smaller angles).
	let along = (((first - angle) % 360) + 360) % 360;
	const whole = layout.arc.end - layout.arc.start >= 360;
	if (!whole && along > 360 - step / 2) {
		// Just past the first option, on its far side.
		along -= 360;
	}
	// `|| 0`: just before the first option rounds to -0.
	const index = Math.round(along / step) || 0;
	if (whole) {
		return ((index % count) + count) % count;
	}
	return index >= 0 && index < count ? index : null;
}

/** How long an option takes to spring out of the disk's centre. */
export const OPTION_MS = 440;
/**
 * How long the fan takes to close: the options falling back into the
 * centre, the disk shrinking with them, and the pill flying home, all
 * together. Brisker than opening: closing at the opening's 440ms, on an
 * ease-in, the options and the disk barely moved for the first half while
 * the pill (on an ease-out) was already home, so the fan seemed to linger
 * behind it.
 */
export const CLOSE_MS = 260;
/** Opening, each option starts this long after the one before it. */
export const OPTION_STAGGER_MS = 35;

export type Timing = { delay: number; duration: number };

/**
 * The fan's easing, the one curve the disk, the options and the pill all
 * move on. Opening springs: out past its place and back (Penner's back-out,
 * which is Svelte's `backOut`). Closing is a clean ease-in, with no
 * overshoot at the end: the back-out run backwards had the disk and the
 * options swell, then shoot through the centre and out the other side.
 */
export function fanEase(opening: boolean): (t: number) => number {
	return opening ? backOut : cubicIn;
}

/** An easing as a CSS `linear()` function, sampled at `steps` points: the same curve, overshoot and all. */
export function cssEasing(ease: (t: number) => number, steps = 40): string {
	const points = Array.from({ length: steps + 1 }, (_, step) => ease(step / steps).toFixed(4));
	return `linear(${points.join(', ')})`;
}

/**
 * The fan's curves as CSS, for the pill, which flies to its place on the
 * ring by a CSS transition rather than a Svelte one: opening, the options'
 * own curve sampled into `linear()`, so it lands with the same bounce they
 * do (a `cubic-bezier` fit of back-out was off by nearly 5%). Going home it
 * does not fall into the centre, so it eases out, with no bounce.
 */
export const FAN_CSS_EASING = {
	opening: cssEasing(backOut),
	home: cssEasing(cubicOut)
} as const;

/**
 * When the `index`th option springs out, or back. Opening is staggered, so
 * the fan unfolds in order; closing is not, so every option falls back
 * together, on exactly the disk's own clock. Staggered both ways, the disk
 * could either wait for the last option, and was left hanging out round the
 * others as they went in, or keep up with the first and leave the rest
 * outside it.
 */
export function optionTiming(index: number, opening: boolean): Timing {
	return opening
		? { delay: index * OPTION_STAGGER_MS, duration: OPTION_MS }
		: { delay: 0, duration: CLOSE_MS };
}

/** How long the pill takes to fly to its place on the ring, or home: the options' time each way. */
export function pillDuration(opening: boolean): number {
	return opening ? OPTION_MS : CLOSE_MS;
}

/** How long the whole fan takes to open or close: until its last option lands. */
export function fanDuration(count: number, opening: boolean): number {
	const last = optionTiming(Math.max(count - 1, 0), opening);
	return last.delay + last.duration;
}

/**
 * How far out the `index`th option is, `elapsed` ms into opening or closing
 * a fan: the eased share of the way from the disk's centre to its place,
 * which may pass 1 where the easing overshoots.
 */
export function optionShare(index: number, elapsed: number, opening: boolean): number {
	const { delay, duration } = optionTiming(index, opening);
	const progress = Math.min(Math.max((elapsed - delay) / duration, 0), 1);
	// Svelte runs an `out:` transition as one less the eased progress.
	const ease = fanEase(opening);
	return opening ? ease(progress) : 1 - ease(progress);
}

/**
 * The disk's scale `elapsed` ms into opening or closing a fan of `count`:
 * the share of the option furthest out, on the options' own clock, easing
 * and overshoot. Each option moves along its ray, and grows, by its own
 * share of the way, so a disk scaled by the largest share holds every one,
 * avatar and name, and is never bigger than they need. Opening, that is the
 * first option's curve until it settles while the later ones still
 * overshoot; closing, when they all move together, it is exactly theirs.
 */
export function diskScale(elapsed: number, count: number, opening: boolean): number {
	if (count === 0) {
		return 0;
	}
	let largest = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < count; index += 1) {
		largest = Math.max(largest, optionShare(index, elapsed, opening));
	}
	return largest;
}

/**
 * How the selection wedge is shaded, as shares of the disk's radius and, for
 * its sides, degrees. Only the drawing: the sector a slide hit-tests
 * (`optionAt`) is the whole slice, edge to edge and centre to rim.
 *
 * - `feather`: each straight side fades in over this many degrees, inside
 *   the sector, so the two radial edges are soft rather than a hard line.
 *   The rim is not softened: the wedge meets it with the disk's own edge.
 * - `clear` to `full`: transparent at `clear`, well short of the centre,
 *   and solid from `full`, just inside the innermost avatar on the ring, out
 *   to the rim, so the slice reads as lighting the option rather than
 *   pointing out of the corner. One radius for every option, the inner
 *   row's when the fan is staggered, so the shading does not jump as the
 *   wedge glides.
 */
export function wedgeShading(layout: FanLayout): { feather: number; clear: number; full: number } {
	const inner = layout.radius - layout.stagger - layout.avatar / 2 - OPTION_GAP;
	const full = Math.max(inner / layout.disk, 0.2);
	return {
		feather: Math.min(layout.step * 0.22, 8),
		clear: full * 0.45,
		full
	};
}

/**
 * How much wider the first and last colours' bands are than a middle one's
 * in Everyone's spectrum wedge. The wedge's feathered sides fade the edge
 * colours out, so at equal shares they looked thinner than the rest. Chosen
 * by eye from wedges of 3 to 7 colours side by side: at 1.6 the edge
 * colours still looked narrower, at 2 they began to look wider with three.
 */
export const SPECTRUM_EDGE_WEIGHT = 1.9;

/**
 * How much of each member's own colour Everyone's spectrum keeps, mixed
 * into the cream: a pale light with a hint of each, rather than a stripe of
 * strong colours that would read as a pie of its own.
 */
export const SPECTRUM_SHARE = 38;

/**
 * Where each of `count` colours sits across a wedge `width` degrees wide,
 * in order from its start: the middle of each colour's band, the first and
 * last bands `edgeWeight` times as wide as the others. A gradient through
 * these blends smoothly from one colour to the next, with no hard bands.
 */
export function spectrumStops(
	count: number,
	width: number,
	edgeWeight = SPECTRUM_EDGE_WEIGHT
): number[] {
	if (count <= 0) {
		return [];
	}
	if (count === 1) {
		return [width / 2];
	}
	const weights = Array.from({ length: count }, (_, index) =>
		index === 0 || index === count - 1 ? edgeWeight : 1
	);
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	const stops: number[] = [];
	let start = 0;
	for (const weight of weights) {
		const band = (weight / total) * width;
		stops.push(start + band / 2);
		start += band;
	}
	return stops;
}

/**
 * The part of the `index`th option's wedge, in degrees from the wedge's
 * start (`step` wide in all), that can be seen: an end option sits where
 * its avatar touches the screen's edge, so half its sector, the half past
 * it, is off the screen. A spectrum spread over the whole sector lost half
 * its colours there, and Everyone is always at an end. Out to the far edge
 * of the avatar, so the last colour still reaches past it.
 */
export function wedgeSpan(layout: FanLayout, index: number): { from: number; to: number } {
	const angle = layout.angles[index] ?? 0;
	const start = angle - layout.step / 2;
	const radius = Math.max(layout.radius - layout.stagger, 1);
	const reach =
		(Math.asin(Math.min(1, (layout.avatar / 2 + EDGE_MARGIN) / radius)) * 180) / Math.PI;
	if (layout.arc.end - layout.arc.start >= 360) {
		return { from: 0, to: layout.step };
	}
	return {
		from: Math.max(0, layout.arc.start - reach - start),
		to: Math.min(layout.step, layout.arc.end + reach - start)
	};
}

/**
 * The selection wedge's fill, as a CSS `conic-gradient` pointing up, `width`
 * degrees wide: its two straight sides fading in over `feather` degrees, and
 * between them one colour solid, or several (Everyone's members, in the
 * pie's order) each washed well towards `wash` and blended smoothly into the
 * next at `spectrumStops`, across `span` (the part that can be seen,
 * `wedgeSpan`; all of it by default). None of the colours sits nearer a side
 * than the feather, which fades it in.
 */
export function wedgeGradient(
	colours: readonly string[],
	width: number,
	feather: number,
	{
		wash,
		edgeWeight = SPECTRUM_EDGE_WEIGHT,
		span = { from: 0, to: width }
	}: { wash: string; edgeWeight?: number; span?: { from: number; to: number } }
): string {
	const degrees = (value: number) => `${value.toFixed(2)}deg`;
	const [only] = colours;
	let fill: string;
	if (colours.length > 1) {
		const low = Math.max(span.from, feather);
		const high = Math.max(Math.min(span.to, width - feather), low);
		const stops = spectrumStops(colours.length, high - low, edgeWeight);
		fill = colours
			.map(
				(colour, index) =>
					`color-mix(in oklab, ${colour} ${SPECTRUM_SHARE}%, ${wash}) ${degrees(low + (stops[index] ?? 0))}`
			)
			.join(', ');
	} else {
		const colour = only ?? 'transparent';
		fill = `${colour} ${degrees(feather)}, ${colour} ${degrees(width - feather)}`;
	}
	return `conic-gradient(from ${degrees(-width / 2)}, transparent 0deg, ${fill}, transparent ${degrees(width)})`;
}
