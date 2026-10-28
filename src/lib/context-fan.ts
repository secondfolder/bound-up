/**
 * The context switcher's fan as geometry: where its disk is centred, which
 * part of the ring round that centre can be seen, and where each option goes
 * on that part so that every one is the same angle from its neighbours and no
 * avatar runs into another or off the screen. Pure and alias-free, so it
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
/**
 * The least clear space kept between any two avatars, the one a finger is
 * over drawn larger. An option is only its avatar: the name of the one lit
 * is shown where the hint is, not under it.
 */
export const OPTION_GAP = 4;
/**
 * How much larger the lit option's avatar is drawn. Every layout leaves room
 * for that around every option, since any of them may be lit.
 */
export const HOVER_SCALE = 1.14;

/** How far a lit avatar grows past its edge, all round. */
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
/** The avatars' sizes, largest first: a crowded fan trades size for room between them. */
export const AVATAR_SIZES = [56, 52, 48, 44, 40, 36] as const;
/**
 * This much clear space between neighbouring avatars (one of them lit) reads
 * as a fan of separate options rather than a string of beads; a ring that
 * allows it stops growing. About the spacing the names under the avatars
 * used to force, so the fan is no tighter than it was.
 */
export const ROOM_TARGET = 24;
/** Short of the target, a size of avatar that still leaves this much is kept rather than shrunk. */
export const ROOM_GOOD = 12;
/**
 * One ring that only leaves its avatars room with avatars smaller than this
 * gives way to a staggered one, if that keeps them bigger.
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

/** What an option centred on `at` covers: its avatar, grown when `lit`. */
export function optionBox(at: Point, avatar: number, lit = false): Box {
	const half = avatar / 2 + (lit ? hoverShift(avatar) : 0);
	return { left: at.x - half, top: at.y - half, right: at.x + half, bottom: at.y + half };
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
 * Whether an option at `angle` on the ring is wholly inside `bounds`, lit.
 * Inlined arithmetic rather than `optionBox`, since the layout asks this a
 * great many times.
 */
function optionInside(
	centre: Point,
	radius: number,
	angle: number,
	avatar: number,
	bounds: Box
): boolean {
	const x = centre.x + radius * Math.cos(angle * RADIANS);
	const y = centre.y + radius * Math.sin(angle * RADIANS);
	const half = avatar / 2 + hoverShift(avatar);
	return (
		x - half >= bounds.left &&
		x + half <= bounds.right &&
		y - half >= bounds.top &&
		y + half <= bounds.bottom
	);
}

const SAMPLE_STEP = 2;

/**
 * The longest unbroken run of the ring on which an option with an avatar of
 * `avatar` is wholly inside `bounds`, or null when there is none. The whole
 * ring when all of it is. Found by sampling every 2° and then narrowing each
 * end down to a hundredth of a degree, so an end is where the option touches
 * the edge.
 */
export function visibleArc(centre: Point, radius: number, bounds: Box, avatar: number): Arc | null {
	const count = 360 / SAMPLE_STEP;
	const inside = (angle: number) => optionInside(centre, radius, angle, avatar, bounds);
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
 * The clear space between the two nearest avatars of options centred on
 * `points`, either of them lit: their centres' distance less both radii and
 * the growth. Every pair, not only neighbours, since a staggered fan's
 * inner row comes near the outer one. Infinity for a single option.
 */
export function roomBetween(points: readonly Point[], avatar: number): number {
	const reach = avatar + hoverShift(avatar);
	let room = Number.POSITIVE_INFINITY;
	for (const [i, a] of points.entries()) {
		for (const b of points.slice(i + 1)) {
			room = Math.min(room, Math.hypot(a.x - b.x, a.y - b.y) - reach);
		}
	}
	return room;
}

type Fit = { room: number; arc: Arc };

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
 * The arc a fan of `count` avatars of `avatar` on the ring of `radius`
 * (every other one `stagger` further in, when crowded) goes on, and the room
 * it leaves between them; null when some part of it would not show, or two
 * avatars would come closer than `OPTION_GAP`.
 */
function fitRing(
	centre: Point,
	radius: number,
	bounds: Box,
	count: number,
	avatar: number,
	stagger: number
): Fit | null {
	const outer = visibleArc(centre, radius, bounds, avatar);
	const inner =
		stagger > 0 && count > 1 ? visibleArc(centre, radius - stagger, bounds, avatar) : outer;
	const arc = outer && inner ? sharedArc(outer, inner) : null;
	if (!arc) {
		return null;
	}
	const points = spreadEvenly(arc, count).map((angle, index) =>
		pointAt(centre, radiusOf(index, radius, stagger), angle)
	);
	const room = roomBetween(points, avatar);
	return room >= OPTION_GAP ? { room, arc } : null;
}

export type FanLayout = {
	centre: Point;
	/** The ring's radius: the options', or the outer ones' when staggered. */
	radius: number;
	/**
	 * How much further in every other option sits: 0 on one ring. Only a fan
	 * too crowded for one ring to leave its avatars room staggers.
	 */
	stagger: number;
	avatar: number;
	/** The clear space between the two nearest avatars, either lit. */
	room: number;
	/** The part of the ring the options are spread along. */
	arc: Arc;
	/** The angle between neighbours, and so the selection wedge's width. */
	step: number;
	/** Each option's angle, in the switcher's order. */
	angles: number[];
	/** Each option's avatar's centre, in the switcher's order. */
	points: Point[];
	/** The disk's radius: past the avatars of the options on the ring. */
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
		room: fit.room,
		arc: fit.arc,
		step: stepAlong(fit.arc, count),
		angles,
		points: angles.map((angle, index) => pointAt(centre, radiusOf(index, radius, stagger), angle)),
		disk: radius + avatar / 2 + hoverShift(avatar) + 12,
		fits
	};
}

/**
 * The best fan with every other option `stagger` in (0 for one ring): the
 * first, from the largest avatars down, whose smallest ring leaves them
 * `ROOM_TARGET`; failing that the largest avatars that still leave them
 * `ROOM_GOOD`; failing that whatever leaves them the most.
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
			const fit = fitRing(centre, radius, bounds, count, avatar, inward);
			if (!fit) {
				continue;
			}
			const candidate = { radius, avatar, stagger: inward, fit };
			if (fit.room >= ROOM_TARGET) {
				return candidate;
			}
			if (!best || fit.room > best.fit.room) {
				best = candidate;
			}
		}
		if (best) {
			roomiest.push(best);
		}
	}
	return (
		roomiest.find((candidate) => candidate.fit.room >= ROOM_GOOD) ??
		roomiest.reduce<Candidate | null>(
			(most, candidate) => (!most || candidate.fit.room > most.fit.room ? candidate : most),
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
 * top edge. Of the layouts where no avatar collides, it takes the largest
 * avatars, and for those the smallest ring that leaves them `ROOM_TARGET`
 * apart (see `search`). A fan that one ring cannot leave even `ROOM_GOOD`
 * with avatars of `ONE_RING_AVATAR` (many partners on a phone's quarter
 * circle) staggers instead: every other option a row further in, at the same
 * even angles, so each avatar has the room of two steps rather than one.
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
	if (single && single.fit.room >= ROOM_GOOD && single.avatar >= ONE_RING_AVATAR) {
		return build(centre, single, count, true);
	}
	// A row in by an avatar, grown, so an inner option sits between its outer
	// neighbours rather than on them.
	const staggered = search(
		centre,
		bounds,
		count,
		farthest,
		(diameter) => diameter + 2 * hoverShift(diameter) + OPTION_GAP
	);
	// Room first, then the larger avatars, then the roomier fan.
	const better = (a: Candidate, b: Candidate) => {
		const roomy = a.fit.room >= ROOM_GOOD;
		if (roomy !== b.fit.room >= ROOM_GOOD) {
			return roomy;
		}
		if (a.avatar !== b.avatar) {
			return a.avatar > b.avatar;
		}
		return a.fit.room > b.fit.room;
	};
	const chosen = staggered && (!single || better(staggered, single)) ? staggered : single;
	if (chosen) {
		return build(centre, chosen, count, true);
	}
	// A window too small for any fan: the smallest avatars on the tightest
	// ring, along whatever of it shows, overlapping as they must.
	const avatar = AVATAR_SIZES.at(-1) ?? 36;
	const arc = visibleArc(centre, MIN_RADIUS, bounds, avatar) ?? { start: 90, end: 180 };
	return build(
		centre,
		{ radius: MIN_RADIUS, avatar, stagger: 0, fit: { room: 0, arc } },
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
 * centre plus its radius (`disk`, out past the avatars), lies more than a
 * third of that radius beyond the shell's right edge. On a phone the centre
 * is the edge itself, so the whole right half is cut off; on a wide screen
 * the disk sits clear of the edge and nothing is.
 */
export const HINT_RIGHT_CUT = 1 / 3;

/**
 * How far, as a share of its width, the hint may move aside from its place
 * to clear an option before it moves down instead.
 */
export const HINT_SLIDE = 0.5;

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
 * and which side. Where that would cover an option (the pill standing in
 * for the current one included) it moves aside, by up to `HINT_SLIDE` of
 * its width, nearest first; failing that down, a few pixels at a time,
 * until clear: below the top row rather than over it.
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
	// Lit, any of them may be.
	const options = layout.points.map((at) => optionBox(at, layout.avatar, true));
	const clear = (left: number, top: number) => {
		const box = { left, top, right: left + width, bottom: top + size.height };
		return options.every((option) => !boxesOverlap(box, option, OPTION_GAP));
	};
	const lowest = bounds.left + HINT_INSET;
	const highest = bounds.right - HINT_INSET - width;
	const slide = width * HINT_SLIDE;
	for (let y = bounds.top + HINT_INSET; y + size.height <= bounds.bottom - HINT_INSET; y += 4) {
		// Aside a little, nearest first, before ever down: an option clipping
		// a corner (Add partner, as a resize brings the disk's edge in) used
		// to drop the hint below the whole fan and back again.
		for (let by = 0; by <= slide; by += 2) {
			for (const to of by === 0 ? [x] : [x - by, x + by]) {
				if (to >= lowest && to <= highest && clear(to, y)) {
					return { x: to, y, side };
				}
			}
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
 * How the selection wedge fades inwards, as shares of the disk's radius:
 * transparent at `clear`, well short of the centre, and solid from `full`,
 * just inside the innermost avatar on the ring, out to the rim, so the slice
 * reads as lighting the option rather than pointing out of the corner. One
 * radius for every option, the inner row's when the fan is staggered, so the
 * shading does not jump as the wedge glides. Its sides are cut sharp
 * (`wedgePolygon`), and the rim is the disk's own edge.
 */
export function wedgeShading(layout: FanLayout): { clear: number; full: number } {
	const inner = layout.radius - layout.stagger - layout.avatar / 2 - OPTION_GAP;
	const full = Math.max(inner / layout.disk, 0.2);
	return { clear: full * 0.45, full };
}

/**
 * The selection wedge's outline, as a CSS `polygon()` in the wedge
 * element's own box (a square round the disk's centre), pointing up and
 * `width` degrees wide: the centre, then points far out past the rim along
 * the sector, so the disk's own round edge is the rim. Sharp sides drawn as
 * geometry rather than as a gradient's hard stops: Chrome anti-aliases a
 * clip path's edges but not a conic gradient's stops, which drew every side
 * not quite vertical or horizontal as a staircase. In the element's own
 * coordinates, so it turns with the element as the wedge glides. Points
 * every 20° or less, at twice the disk's radius, so the straight edges
 * between them stay outside the rim however wide the wedge.
 */
export function wedgePolygon(width: number): string {
	const span = Math.min(Math.max(width, 0), 359);
	const count = Math.max(2, Math.ceil(span / 20));
	const points = ['50% 50%'];
	for (let index = 0; index <= count; index += 1) {
		const angle = ((-span / 2 + (span * index) / count) * Math.PI) / 180;
		points.push(
			`${(50 + 100 * Math.sin(angle)).toFixed(3)}% ${(50 - 100 * Math.cos(angle)).toFixed(3)}%`
		);
	}
	return `polygon(${points.join(', ')})`;
}

/**
 * How wide the first and last colours' bands are against a middle one's in
 * Everyone's spectrum wedge. With sharp sides and the end colours pinned to
 * them, an end colour runs solid from the side to the middle of its band
 * and blends on one side only, while a middle one blends on both, so at
 * equal shares the ends looked wider than the rest. Chosen by eye from
 * sharp-sided wedges of 3, 4 and 7 colours at 0.7 to 1.15: at 1 the middle
 * colour of three looked thinnest, at 0.7 the ends of seven did. (It was 1.9
 * while the sides were feathered, which faded the end colours out.)
 */
export const SPECTRUM_EDGE_WEIGHT = 0.9;

/**
 * How much of each member's own colour Everyone's spectrum keeps, mixed
 * into the cream: a pale light with a hint of each, rather than a stripe of
 * strong colours that would read as a pie of its own.
 */
export const SPECTRUM_SHARE = 38;

/**
 * Where each of `count` colours sits across a wedge `width` degrees wide,
 * in order from its start: the middle of each colour's band, the first and
 * last bands `edgeWeight` times as wide as the others (narrower below 1).
 * A gradient through these blends smoothly from one colour to the next,
 * with no hard bands.
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
 * The selection wedge's fill, for a wedge pointing up `width` degrees wide
 * (cut to shape by `wedgePolygon`): one colour solid, or several (Everyone's
 * members, in the pie's order) each washed well towards `wash` and blended
 * smoothly into the next, at the middles of their bands (`spectrumStops`)
 * across `span` (the part that can be seen, `wedgeSpan`; all of it by
 * default), with the first and last pinned to the span's ends.
 */
export function wedgeGradient(
	colours: readonly string[],
	width: number,
	{
		wash,
		edgeWeight = SPECTRUM_EDGE_WEIGHT,
		span = { from: 0, to: width }
	}: { wash: string; edgeWeight?: number; span?: { from: number; to: number } }
): string {
	const [only] = colours;
	if (colours.length <= 1) {
		return only ?? 'transparent';
	}
	const degrees = (value: number) => `${value.toFixed(2)}deg`;
	const low = Math.max(span.from, 0);
	const high = Math.max(Math.min(span.to, width), low);
	const stops = spectrumStops(colours.length, high - low, edgeWeight);
	const washed = colours.map(
		(colour) => `color-mix(in oklab, ${colour} ${SPECTRUM_SHARE}%, ${wash})`
	);
	// Pinned to the span's ends as well as their bands' middles, so the
	// first and last colours run solid to the sides rather than blending in
	// from whatever the gradient would otherwise put there.
	const fill = [
		`${washed[0]} ${degrees(low)}`,
		...washed.map((colour, index) => `${colour} ${degrees(low + (stops[index] ?? 0))}`),
		`${washed.at(-1)} ${degrees(high)}`
	].join(', ');
	return `conic-gradient(from ${degrees(-width / 2)}, ${fill})`;
}
