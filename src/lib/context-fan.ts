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
export function optionBoxes(at: Point, { avatar, label }: OptionSize): { avatar: Box; label: Box } {
	const half = avatar / 2;
	const top = at.y + half + LABEL_GAP;
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
	const across = Math.max(avatar, label) / 2;
	return (
		x - across >= bounds.left &&
		x + across <= bounds.right &&
		y - avatar / 2 >= bounds.top &&
		y + avatar / 2 + LABEL_GAP + LABEL_HEIGHT <= bounds.bottom
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
	const half = avatar / 2;
	let budget: number = LABEL_MAX;
	for (const [i, a] of points.entries()) {
		for (const [j, b] of points.entries()) {
			if (i === j) {
				continue;
			}
			const across = Math.abs(a.x - b.x);
			if (i < j) {
				if (across < avatar + OPTION_GAP && Math.abs(a.y - b.y) < avatar + OPTION_GAP) {
					return Number.NEGATIVE_INFINITY;
				}
				// Two names on the same line need their whole widths apart.
				if (Math.abs(a.y - b.y) < LABEL_HEIGHT + OPTION_GAP) {
					budget = Math.min(budget, across - OPTION_GAP);
				}
			}
			// a's name level with b's avatar needs half of each apart.
			const labelTop = a.y + half + LABEL_GAP;
			const labelBottom = labelTop + LABEL_HEIGHT;
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
		disk: radius + avatar / 2 + LABEL_GAP + LABEL_HEIGHT + 14,
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
		(diameter) => diameter + LABEL_GAP + LABEL_HEIGHT
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

/**
 * Where a hint of `size` goes: inside the ring, on the line through the
 * middle of the arc, clear of every option and inside `bounds`. Its top-left
 * corner, or null when the ring is too tight to hold it.
 */
export function hintPlacement(
	layout: FanLayout,
	bounds: Box,
	size: { width: number; height: number }
): Point | null {
	const inner = inset(bounds, EDGE_MARGIN);
	const middle = (layout.arc.start + layout.arc.end) / 2;
	const room = layout.radius - layout.stagger - layout.avatar / 2 - OPTION_GAP;
	const options = layout.points.map((at) => optionBoxes(at, layout));
	for (const share of [0.5, 0.42, 0.34, 0.26, 0.58]) {
		const at = pointAt(layout.centre, layout.radius * share, middle);
		const left = Math.min(Math.max(at.x - size.width / 2, inner.left), inner.right - size.width);
		const top = Math.min(Math.max(at.y - size.height / 2, inner.top), inner.bottom - size.height);
		const box = { left, top, right: left + size.width, bottom: top + size.height };
		const corners = [
			[box.left, box.top],
			[box.right, box.top],
			[box.left, box.bottom],
			[box.right, box.bottom]
		];
		const withinRing = corners.every(
			([x = 0, y = 0]) => Math.hypot(x - layout.centre.x, y - layout.centre.y) <= room
		);
		const clear = options.every(
			(option) =>
				!(
					boxesOverlap(box, option.avatar, OPTION_GAP) ||
					boxesOverlap(box, option.label, OPTION_GAP)
				)
		);
		if (withinRing && clear && left >= inner.left && top >= inner.top) {
			return { x: left, y: top };
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
