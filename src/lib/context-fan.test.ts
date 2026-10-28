import { backOut } from 'svelte/easing';
import { describe, expect, it } from 'vitest';
import {
	AVATAR_SIZES,
	type Box,
	boxesOverlap,
	CLOSE_MS,
	cssEasing,
	DEAD_ZONE,
	DISK_MARGIN,
	diskScale,
	EDGE_MARGIN,
	FAN_CSS_EASING,
	type FanLayout,
	fanCentre,
	fanDuration,
	HINT_INSET,
	HINT_RIGHT_CUT,
	HOVER_SCALE,
	hintPlacement,
	hintSide,
	hoverShift,
	layoutFan,
	MIN_RADIUS,
	OPTION_GAP,
	OPTION_MS,
	OPTION_STAGGER_MS,
	optionAt,
	optionBox,
	optionShare,
	optionTiming,
	pillDuration,
	pointAt,
	RIM_SHARE,
	ROOM_GOOD,
	ROOM_TARGET,
	rightCut,
	roomBetween,
	SPECTRUM_EDGE_WEIGHT,
	SPECTRUM_SHARE,
	sectorOf,
	spectrumStops,
	spreadEvenly,
	stepAlong,
	visibleArc,
	wedgeGradient,
	wedgePolygon,
	wedgeShading,
	wedgeSpan
} from './context-fan';

const shell = (width: number, height: number): Box => ({
	left: 0,
	top: 0,
	right: width,
	bottom: height
});

/** Every option's avatar, as drawn at the layout's size. */
function boxes(layout: FanLayout) {
	return layout.points.map((at) => optionBox(at, layout.avatar));
}

/**
 * Every pair of avatars closer than `OPTION_GAP`, with the `lit` one drawn
 * grown (or none): none in a good fan. Measured as circles, which they are.
 */
function collisions(layout: FanLayout, lit: number | null = null): string[] {
	const found: string[] = [];
	const radius = (index: number) =>
		layout.avatar / 2 + (index === lit ? hoverShift(layout.avatar) : 0);
	for (const [i, a] of layout.points.entries()) {
		for (const [j, b] of layout.points.entries()) {
			if (j <= i) {
				continue;
			}
			const apart = Math.hypot(a.x - b.x, a.y - b.y) - radius(i) - radius(j);
			if (apart < OPTION_GAP - 1e-9) {
				found.push(`avatars ${i} and ${j}`);
			}
		}
	}
	return found;
}

/** Every option that, lit, is not wholly inside `bounds`, less the edge margin. */
function outside(layout: FanLayout, bounds: Box): number[] {
	const within = (box: Box) =>
		box.left >= bounds.left + EDGE_MARGIN - 0.01 &&
		box.right <= bounds.right - EDGE_MARGIN + 0.01 &&
		box.top >= bounds.top + EDGE_MARGIN - 0.01 &&
		box.bottom <= bounds.bottom - EDGE_MARGIN + 0.01;
	return layout.points.flatMap((at, index) =>
		within(optionBox(at, layout.avatar, true)) ? [] : [index]
	);
}

/** The angles between neighbours, each less the layout's step: all zero when even. */
function unevenness(layout: FanLayout): number[] {
	return layout.angles
		.slice(1)
		.map(
			(angle, index) => Math.round(((layout.angles[index] ?? 0) - angle - layout.step) * 1e6) / 1e6
		)
		.map((difference) => Math.abs(difference));
}

describe('fanCentre', () => {
	it('puts the centre on the top-right corner for a control where a phone has it', () => {
		// 16px gutter, the header's first line 44px tall from 8px down.
		expect(fanCentre({ right: 374, middle: 30 }, shell(390, 844))).toEqual({ x: 390, y: 0 });
	});

	it('snaps onto the corner from a wider gutter', () => {
		expect(fanCentre({ right: 744, middle: 30 }, shell(768, 1024))).toEqual({ x: 768, y: 0 });
	});

	it('is a fixed offset up and right of a control away from the corner', () => {
		expect(fanCentre({ right: 1256, middle: 300 }, shell(1920, 1080))).toEqual({ x: 1272, y: 276 });
	});

	it('never leaves the shell', () => {
		expect(
			fanCentre({ right: 500, middle: 10 }, { left: 0, top: 50, right: 505, bottom: 900 })
		).toEqual({ x: 505, y: 50 });
	});
});

describe('visibleArc', () => {
	const size = 56;

	it('is about a quarter of the ring round a top-right corner', () => {
		const arc = visibleArc({ x: 390, y: 0 }, 250, shell(390, 800), size);
		expect(arc).not.toBeNull();
		expect(arc?.start).toBeGreaterThan(90);
		expect(arc?.end).toBeLessThan(180);
		expect((arc?.end ?? 0) - (arc?.start ?? 0)).toBeGreaterThan(70);
	});

	it('is about half of it round the middle of the top edge', () => {
		const arc = visibleArc({ x: 960, y: 0 }, 250, shell(1920, 1000), size);
		expect(arc?.start).toBeGreaterThan(0);
		expect(arc?.start).toBeLessThan(15);
		expect(arc?.end).toBeGreaterThan(165);
		expect(arc?.end).toBeLessThan(180);
	});

	it('ends where an option touches the edge', () => {
		const centre = { x: 390, y: 0 };
		const bounds = shell(390, 800);
		const arc = visibleArc(centre, 250, bounds, size);
		// Lit, its avatar's top is on the top edge, to a hundredth of a degree.
		const end = optionBox(pointAt(centre, 250, arc?.end ?? 0), size, true);
		expect(end.top).toBeGreaterThanOrEqual(0);
		expect(end.top).toBeLessThan(0.1);
	});

	it('is the whole ring when all of it shows, and null when none does', () => {
		expect(visibleArc({ x: 500, y: 500 }, 100, shell(1000, 1000), size)).toEqual({
			start: 0,
			end: 360
		});
		expect(visibleArc({ x: 0, y: 0 }, 2000, shell(400, 400), size)).toBeNull();
	});

	it('keeps an arc that crosses 0° in one piece', () => {
		// Centred on the left edge: the visible ring runs from up, through right, to down.
		const arc = visibleArc({ x: 0, y: 500 }, 200, shell(1000, 1000), size);
		expect(arc?.start).toBeGreaterThan(270);
		expect(arc?.end).toBeGreaterThan(360);
		expect(arc?.end).toBeLessThan(450);
	});
});

describe('spreadEvenly', () => {
	it('shares the arc out evenly, each in the middle of its share, from the arc’s end', () => {
		expect(spreadEvenly({ start: 90, end: 180 }, 4)).toEqual([168.75, 146.25, 123.75, 101.25]);
		expect(stepAlong({ start: 90, end: 180 }, 4)).toBe(22.5);
	});

	it('puts one in the middle, and spaces a whole ring by its count', () => {
		expect(spreadEvenly({ start: 10, end: 170 }, 1)).toEqual([90]);
		expect(spreadEvenly({ start: 0, end: 360 }, 4)).toEqual([360, 270, 180, 90]);
		expect(spreadEvenly({ start: 0, end: 90 }, 0)).toEqual([]);
	});
});

describe('roomBetween', () => {
	it('is the clear space between two avatars side by side, one of them lit', () => {
		expect(
			roomBetween(
				[
					{ x: 0, y: 0 },
					{ x: 100, y: 0 }
				],
				56
			)
		).toBeCloseTo(100 - 56 - hoverShift(56), 9);
	});

	it('measures the avatars as circles, across a diagonal too', () => {
		expect(
			roomBetween(
				[
					{ x: 0, y: 0 },
					{ x: 60, y: 80 }
				],
				56
			)
		).toBeCloseTo(100 - 56 - hoverShift(56), 9);
	});

	it('is the nearest pair, neighbours or not', () => {
		expect(
			roomBetween(
				[
					{ x: 0, y: 0 },
					{ x: 200, y: 0 },
					{ x: 70, y: 0 }
				],
				56
			)
		).toBeCloseTo(70 - 56 - hoverShift(56), 9);
	});

	it('is unbounded for one option, and negative for two on top of each other', () => {
		expect(roomBetween([{ x: 0, y: 0 }], 56)).toBe(Number.POSITIVE_INFINITY);
		expect(
			roomBetween(
				[
					{ x: 0, y: 0 },
					{ x: 20, y: 20 }
				],
				56
			)
		).toBeLessThan(0);
	});
});

describe('layoutFan', () => {
	/** The shell's visible part, above a 70px nav. */
	const viewports = [
		{ name: 'phone', width: 390, height: 844, control: { right: 374, middle: 30 } },
		{ name: 'tablet', width: 768, height: 1024, control: { right: 680, middle: 30 } },
		{ name: 'laptop', width: 1280, height: 800, control: { right: 936, middle: 30 } },
		{ name: 'desktop', width: 1920, height: 1080, control: { right: 1256, middle: 30 } }
	];

	for (const viewport of viewports) {
		// Two is Me and "Add partner", for someone with no partner yet.
		for (const count of [2, 3, 4, 5, 6, 7, 8, 9]) {
			it(`fits ${count} options on a ${viewport.name}, evenly, with room between them`, () => {
				const bounds = shell(viewport.width, viewport.height - 70);
				const centre = fanCentre(viewport.control, shell(viewport.width, viewport.height));
				const layout = layoutFan({ centre, bounds, count });
				expect(layout.fits).toBe(true);
				expect(layout.points).toHaveLength(count);
				expect(layout.room).toBeGreaterThanOrEqual(ROOM_GOOD);
				expect(collisions(layout)).toEqual([]);
				// Lit, any one of them, grown into the room left for it.
				expect(layout.points.flatMap((_, lit) => collisions(layout, lit))).toEqual([]);
				expect(outside(layout, bounds)).toEqual([]);
				expect(Math.max(...unevenness(layout))).toBe(0);
			});
		}
	}

	it('centres a phone’s fan on the corner and shares out its quarter', () => {
		const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 774), count: 4 });
		// The disk's edge that shows is the whole quarter, each option a share of it.
		expect(layout.arc.start).toBeCloseTo(90, 1);
		expect(layout.arc.end).toBeCloseTo(180, 1);
		expect(layout.step).toBeCloseTo(90 / 4, 1);
		expect(layout.avatar).toBe(AVATAR_SIZES[0]);
	});

	it('draws each avatar in the middle of its share of the edge that shows', () => {
		// The add button's fan with two places to add to: the disk's edge runs
		// from the screen's right edge round to the nav, and each avatar sits
		// in the middle of its half of it, not at the ends, which left half of
		// each one's sector under the nav.
		const bounds = shell(390, 784);
		const centre = { x: 344, y: 738 };
		const layout = layoutFan({ centre, bounds, count: 2 });
		expect(layout.step).toBeCloseTo((layout.arc.end - layout.arc.start) / 2, 6);
		for (const [index, point] of layout.points.entries()) {
			const angle = (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI;
			const middle = layout.angles[index] ?? 0;
			expect(((angle - middle + 540) % 360) - 180).toBeCloseTo(0, 6);
		}
		// The two sectors meet in the middle of what shows.
		expect((layout.angles[0] ?? 0) - layout.step / 2).toBeCloseTo(
			(layout.angles[1] ?? 0) + layout.step / 2,
			6
		);
	});

	/** How far each avatar is from the middle of its sector, in degrees. */
	const offMiddle = (layout: FanLayout) =>
		layout.points.map((point, index) => {
			const angle =
				(Math.atan2(point.y - layout.centre.y, point.x - layout.centre.x) * 180) / Math.PI;
			return ((angle - (layout.angles[index] ?? 0) + 540) % 360) - 180;
		});

	it('centres every avatar where that costs no avatar size, on a phone and wider', () => {
		for (const [width, height, centre, count] of [
			[390, 774, 390, 5],
			[390, 774, 390, 7],
			[768, 954, 768, 9],
			[1920, 1010, 1272, 9]
		] as const) {
			const layout = layoutFan({
				centre: { x: centre, y: 0 },
				bounds: shell(width, height),
				count
			});
			for (const off of offMiddle(layout)) {
				expect(off, `${width}×${height}, ${count}`).toBeCloseTo(0, 6);
			}
		}
		// And the add button's, at the bottom right.
		const fab = layoutFan({ centre: { x: 344, y: 738 }, bounds: shell(390, 784), count: 7 });
		for (const off of offMiddle(fab)) {
			expect(off).toBeCloseTo(0, 6);
		}
	});

	it('moves only a crowded fan’s end avatars inward, a little, rather than shrink every avatar', () => {
		// Six partners round a phone's corner: centred only with the smallest
		// avatars, under a comfortable tap.
		const bounds = shell(390, 774);
		const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds, count: 9 });
		expect(layout.avatar).toBeGreaterThan(AVATAR_SIZES.at(-1) ?? 36);
		const off = offMiddle(layout);
		// The middle ones in the middle; the ends inward, towards the middle.
		for (const value of off.slice(1, -1)) {
			expect(value).toBeCloseTo(0, 6);
		}
		expect(Math.abs(off[0] ?? 0)).toBeGreaterThan(0);
		expect(Math.abs(off[0] ?? 0)).toBeLessThan(layout.step / 2);
		expect(outside(layout, bounds)).toEqual([]);
		expect(collisions(layout)).toEqual([]);
		// The sectors stay an even share of the quarter, wherever the avatars are.
		expect(Math.max(...unevenness(layout))).toBe(0);
	});

	it('round its own trigger, keeps the disk only as big as its avatars need', () => {
		// The add button: a 60px button, nothing in the fan but avatars.
		const bounds = shell(390, 784);
		const centre = { x: 344, y: 738 };
		const tight = layoutFan({ centre, bounds, count: 2, clear: 30 });
		const loose = layoutFan({ centre, bounds, count: 2 });
		expect(tight.disk).toBeLessThan(loose.disk);
		expect(tight.radius).toBeLessThan(MIN_RADIUS);
		// Still room between them, and clear of the button, lit.
		expect(tight.room).toBeGreaterThanOrEqual(ROOM_TARGET);
		// At least as far off the button as off the disk's edge, lit.
		const reach = tight.avatar / 2 + (tight.avatar * (HOVER_SCALE - 1)) / 2;
		const offEdge = tight.disk - tight.radius - reach;
		expect(offEdge).toBeCloseTo(DISK_MARGIN, 6);
		for (const point of tight.points) {
			const offButton = Math.hypot(point.x - centre.x, point.y - centre.y) - reach - 30;
			expect(offButton).toBeGreaterThanOrEqual(offEdge - 1e-6);
		}
	});

	it('round its own trigger, lays out again as the window changes: rows, sizes and the disk', () => {
		// Many places to add to, in windows from a phone to a desktop:
		// wherever it lands, a fan that fits, clear of the button, every avatar on the
		// screen and none on another; and it staggers where it must.
		const staggered = new Set<boolean>();
		for (const [width, height] of [
			[390, 520],
			[390, 784],
			[768, 954],
			[1280, 740],
			[1920, 1010]
		] as const) {
			const bounds = shell(width, height);
			const centre = { x: width - 46, y: height - 46 };
			const layout = layoutFan({ centre, bounds, count: 9, clear: 30 });
			const where = `${width}×${height}`;
			expect(layout.fits, where).toBe(true);
			expect(collisions(layout), where).toEqual([]);
			expect(outside(layout, bounds), where).toEqual([]);
			for (const point of layout.points) {
				expect(Math.hypot(point.x - centre.x, point.y - centre.y)).toBeGreaterThan(30);
			}
			staggered.add(layout.stagger > 0);
		}
		expect([...staggered].sort()).toEqual([false, true]);
	});

	it('never takes a disk so big that most of its edge is off the screen', () => {
		const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 774), count: 9 });
		expect(layout.arc.end - layout.arc.start).toBeGreaterThanOrEqual(90 * RIM_SHARE);
	});

	it('uses the whole half of the ring that shows round a control away from the corner', () => {
		const layout = layoutFan({ centre: { x: 1272, y: 0 }, bounds: shell(1920, 1010), count: 5 });
		// From near the right of the centre round to near its left.
		expect(layout.arc.start).toBeLessThan(20);
		expect(layout.arc.end).toBeGreaterThan(160);
		expect(layout.room).toBeGreaterThanOrEqual(ROOM_TARGET);
	});

	it('takes the smallest ring that leaves the avatars room, not a larger one', () => {
		const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 774), count: 4 });
		expect(layout.room).toBeGreaterThanOrEqual(ROOM_TARGET);
		// A ring a step tighter would crowd them: the room is barely past the target.
		expect(layout.room).toBeLessThan(ROOM_TARGET + 4);
	});

	it('staggers a fan too crowded for one ring, rather than shrink or crowd its avatars', () => {
		const roomy = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 784), count: 4 });
		expect(roomy.stagger).toBe(0);
		const crowded = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 784), count: 9 });
		expect(crowded.stagger).toBeGreaterThan(0);
		expect(crowded.room).toBeGreaterThanOrEqual(ROOM_GOOD);
		// Every other option a row further in, at the same even angles.
		const distances = crowded.points.map((point) => Math.hypot(point.x - 390, point.y));
		expect(distances[0]).toBeCloseTo(crowded.radius, 6);
		expect(distances[1]).toBeCloseTo(crowded.radius - crowded.stagger, 6);
		expect(collisions(crowded)).toEqual([]);
		expect(Math.max(...unevenness(crowded))).toBe(0);
	});

	it('fans out from a button at the bottom right: clear of the button, apart, and on screen', () => {
		// The add button's fan on a phone: seven spaces, which staggers.
		const bounds = shell(390, 784);
		const centre = { x: 344, y: 738 };
		const layout = layoutFan({ centre, bounds, count: 7 });
		expect(layout.fits).toBe(true);
		expect(collisions(layout)).toEqual([]);
		for (const point of layout.points) {
			// Never over the 60px button itself.
			expect(Math.hypot(point.x - centre.x, point.y - centre.y)).toBeGreaterThan(
				30 + layout.avatar / 2
			);
		}
		for (const box of boxes(layout)) {
			expect(box.left).toBeGreaterThanOrEqual(0);
			expect(box.right).toBeLessThanOrEqual(390);
			expect(box.bottom).toBeLessThanOrEqual(784);
		}
	});

	it('lays out again for a resized window: more of the ring, more of it used', () => {
		const narrow = layoutFan({ centre: { x: 700, y: 0 }, bounds: shell(768, 954), count: 6 });
		const wide = layoutFan({ centre: { x: 700, y: 0 }, bounds: shell(1400, 954), count: 6 });
		expect(wide.arc.end - wide.arc.start).toBeGreaterThan(narrow.arc.end - narrow.arc.start);
	});

	it('still draws something in a window too small for any fan', () => {
		const layout = layoutFan({ centre: { x: 120, y: 0 }, bounds: shell(120, 120), count: 8 });
		expect(layout.fits).toBe(false);
		expect(layout.points).toHaveLength(8);
	});
});

describe('where the hint goes', () => {
	// The switcher's `HINT`.
	const hint = { width: 150, height: 60 };
	/** A fan whose disk is `disk` across, centred at `x` on the top edge of a shell 1000 wide. */
	const fanAt = (x: number, disk = 300): FanLayout => ({
		...layoutFan({ centre: { x, y: 0 }, bounds: shell(1000, 800), count: 4 }),
		centre: { x, y: 0 },
		disk
	});

	it('moves to the right edge only when more than a third of the disk is cut off there', () => {
		const bounds = shell(1000, 800);
		// The disk's right edge at 1000 + 100 - 1: just under a third of 300.
		expect(rightCut(fanAt(799), bounds)).toBeCloseTo(99 / 300, 6);
		expect(hintSide(fanAt(799), bounds)).toBe('centre');
		// Exactly a third is still centred: "more than" a third moves it.
		expect(hintSide(fanAt(800), bounds)).toBe('centre');
		expect(hintSide(fanAt(801), bounds)).toBe('right');
		expect(HINT_RIGHT_CUT).toBeCloseTo(1 / 3, 9);
		// Clear of the edge, nothing is cut off.
		expect(rightCut(fanAt(400), bounds)).toBe(0);
	});

	it('sits at the top, against the right edge with a phone’s disk in the corner', () => {
		const bounds = shell(390, 774);
		const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds, count: 5 });
		const at = hintPlacement(layout, bounds, hint);
		expect(at?.side).toBe('right');
		expect(at?.x).toBe(390 - HINT_INSET - hint.width);
		expect(at?.y).toBe(HINT_INSET);
	});

	it('sits at the top, centred over the disk, where little or none of it is cut off', () => {
		const bounds = shell(1920, 1010);
		const layout = layoutFan({ centre: { x: 1272, y: 0 }, bounds, count: 5 });
		const at = hintPlacement(layout, bounds, hint);
		expect(at?.side).toBe('centre');
		expect((at?.x ?? 0) + hint.width / 2).toBe(1272);
		expect(at?.y).toBe(HINT_INSET);
	});

	it('for a fan from the bottom of the screen, sits just above its disk rather than at the top', () => {
		// The add button's: centred on a 60px button 16px in from a phone's
		// right edge, over a list whose nav starts at 784.
		const bounds = shell(390, 784);
		const layout = layoutFan({ centre: { x: 344, y: 738 }, bounds, count: 7 });
		const at = hintPlacement(layout, bounds, hint, 'disk');
		expect(at).not.toBeNull();
		const above = layout.centre.y - layout.disk - HINT_INSET - hint.height;
		expect(at?.y).toBeGreaterThanOrEqual(above);
		expect(at?.y).toBeLessThan(layout.centre.y);
		expect(at?.side).toBe('right');
		// And clear of every option, as from the top.
		const box = {
			left: at?.x ?? 0,
			top: at?.y ?? 0,
			right: (at?.x ?? 0) + hint.width,
			bottom: (at?.y ?? 0) + hint.height
		};
		expect(boxes(layout).filter((option) => boxesOverlap(box, option))).toEqual([]);
		// From the top, the same fan's hint is at the top of the page.
		expect(hintPlacement(layout, bounds, hint)?.y).toBe(HINT_INSET);
	});

	it('stays inside the shell however near its edge the disk is centred', () => {
		const bounds = shell(1000, 800);
		const at = hintPlacement(fanAt(20, 600), bounds, hint);
		expect(at?.x).toBe(HINT_INSET);
		const narrow = hintPlacement(fanAt(100, 100), shell(120, 800), hint);
		expect(narrow?.x).toBe(HINT_INSET);
	});

	it('never covers an option, moving down below them rather than over them', () => {
		for (const [width, height, centre, count] of [
			[390, 774, 390, 9],
			[768, 954, 768, 9],
			[1280, 730, 952, 9],
			[1920, 1010, 1272, 4]
		] as const) {
			const bounds = shell(width, height);
			const layout = layoutFan({ centre: { x: centre, y: 0 }, bounds, count });
			const at = hintPlacement(layout, bounds, hint);
			expect(at).not.toBeNull();
			const box = {
				left: at?.x ?? 0,
				top: at?.y ?? 0,
				right: (at?.x ?? 0) + hint.width,
				bottom: (at?.y ?? 0) + hint.height
			};
			const covered = boxes(layout).filter((option) => boxesOverlap(box, option));
			expect(covered).toEqual([]);
		}
	});

	it('slides aside, never down below the fan, as a resize brings an option into its corner', () => {
		const bounds = shell(1000, 700);
		const places: { x: number; y: number }[] = [];
		for (let fromEdge = 0; fromEdge <= 400; fromEdge += 2) {
			const layout = layoutFan({ centre: { x: 1000 - fromEdge, y: 0 }, bounds, count: 4 });
			const at = hintPlacement(layout, bounds, hint);
			expect(at?.y, `${fromEdge}px from the edge`).toBe(HINT_INSET);
			const box = {
				left: at?.x ?? 0,
				top: at?.y ?? 0,
				right: (at?.x ?? 0) + hint.width,
				bottom: (at?.y ?? 0) + hint.height
			};
			expect(boxes(layout).filter((option) => boxesOverlap(box, option))).toEqual([]);
			places.push({ x: at?.x ?? 0, y: at?.y ?? 0 });
		}
		// And it moves smoothly: no step between neighbouring widths jumps far.
		const steps = places
			.slice(1)
			.map((place, index) => Math.abs(place.x - (places[index]?.x ?? 0)));
		// Each option now sits in the middle of its share of the edge, which
		// moves a little more as the share changes than an option pinned to
		// the arc's end did.
		expect(Math.max(...steps)).toBeLessThan(48);
	});

	it('moves down when the top row is taken', () => {
		const bounds = shell(1000, 800);
		const layout = fanAt(500);
		// An option right where the hint would go.
		const crowded = { ...layout, points: [{ x: 500, y: 30 }] };
		const at = hintPlacement(crowded, bounds, hint);
		expect(at?.y).toBeGreaterThan(30 + layout.avatar / 2);
	});
});

describe('optionAt', () => {
	it('with wrapped ends, picks an option anywhere on the disk that shows, the far parts the nearer end’s', () => {
		// The add button's fan: its disk goes on above the nav past the run of
		// edge the avatars are spread along. Every point of it above the nav,
		// outside the dead zone, is some option's.
		for (const count of [2, 3, 5]) {
			const bounds = shell(390, 784);
			const centre = { x: 344, y: 738 };
			const layout = layoutFan({ centre, bounds, count, clear: 30, wrapEnds: true });
			for (let x = 0; x <= 390; x += 3) {
				for (let y = 0; y <= 784; y += 3) {
					const distance = Math.hypot(x - centre.x, y - centre.y);
					if (distance > layout.disk - 0.5 || distance < DEAD_ZONE + 0.5) {
						continue;
					}
					expect(optionAt(layout, { x, y }), `${count}: (${x}, ${y})`).not.toBeNull();
				}
			}
			// Each avatar still in the middle of its share of the edge that
			// shows, and picked there.
			for (const [index, point] of layout.points.entries()) {
				expect(optionAt(layout, point)).toBe(index);
			}
			// Just above the nav, left of the button, past the edge's run: the
			// end option nearest the nav. Straight right of it, past the other
			// end: the first.
			expect(optionAt(layout, { x: centre.x - DEAD_ZONE - 10, y: 782 })).toBe(count - 1);
			expect(optionAt(layout, { x: centre.x + DEAD_ZONE + 1, y: centre.y - 5 })).toBe(0);
			// The sectors cover the whole circle, and the middle ones stay shares.
			const sectors = layout.angles.map((_, index) => sectorOf(layout, index));
			const total = sectors.reduce((sum, sector) => sum + sector.end - sector.start, 0);
			expect(total).toBeCloseTo(360, 6);
			for (const sector of sectors.slice(1, -1)) {
				expect(sector.end - sector.start).toBeCloseTo(layout.step, 6);
			}
		}
	});

	it('picks nothing under the bottom nav: every sector is on the part of the disk that shows', () => {
		// The add button's fan, whose disk runs on under the nav (left undimmed,
		// taking its own taps), without wrapped ends: every point under the nav
		// and inside the disk. With them, `slotAt` in the fan itself keeps a
		// pointer off the nav from picking anything.
		for (const count of [2, 3, 5, 9]) {
			const bounds = shell(390, 784);
			const layout = layoutFan({ centre: { x: 344, y: 738 }, bounds, count, clear: 30 });
			for (let x = 0; x <= 390; x += 4) {
				for (let y = 785; y <= 844; y += 4) {
					expect(optionAt(layout, { x, y }), `${count}: (${x}, ${y})`).toBeNull();
				}
			}
			// While the visible part of each sector, beside its avatar, picks it.
			for (const [index, point] of layout.points.entries()) {
				expect(optionAt(layout, point)).toBe(index);
			}
		}
	});

	/** A hand-made fan: options every 30° from 180 (left) to 90 (down), on a 300 ring. */
	const quarter: FanLayout = {
		centre: { x: 400, y: 0 },
		radius: 250,
		stagger: 0,
		avatar: 56,
		room: 24,
		arc: { start: 90, end: 180 },
		step: 30,
		angles: [180, 150, 120, 90],
		points: [],
		disk: 300,
		fits: true
	};
	const at = (layout: FanLayout, angle: number, distance: number) =>
		pointAt(layout.centre, distance, angle);

	it('is the option whose sector the point is in, anywhere from near the centre to the edge', () => {
		expect(optionAt(quarter, at(quarter, 150, 250))).toBe(1);
		// Well away from the avatar, still in its sector.
		expect(optionAt(quarter, at(quarter, 160, 80))).toBe(1);
		expect(optionAt(quarter, at(quarter, 140, 290))).toBe(1);
		expect(optionAt(quarter, at(quarter, 96, 120))).toBe(3);
	});

	it('changes option halfway between neighbours', () => {
		expect(optionAt(quarter, at(quarter, 135.5, 200))).toBe(1);
		expect(optionAt(quarter, at(quarter, 134.5, 200))).toBe(2);
	});

	it('gives the end options half a step beyond the arc, and nothing past that', () => {
		expect(optionAt(quarter, at(quarter, 194, 200))).toBe(0);
		expect(optionAt(quarter, at(quarter, 196, 200))).toBeNull();
		expect(optionAt(quarter, at(quarter, 76, 200))).toBe(3);
		expect(optionAt(quarter, at(quarter, 74, 200))).toBeNull();
	});

	it('is nothing off the disk, in the dead zone at its centre, or where the press began', () => {
		expect(optionAt(quarter, at(quarter, 150, 301))).toBeNull();
		expect(optionAt(quarter, at(quarter, 150, DEAD_ZONE - 1))).toBeNull();
		const still = at(quarter, 150, 120);
		expect(optionAt(quarter, { x: still.x + 5, y: still.y }, { still, quiet: 24 })).toBeNull();
		expect(optionAt(quarter, { x: still.x, y: still.y + 40 }, { still, quiet: 24 })).not.toBeNull();
	});

	it('follows an arc that crosses 0°', () => {
		// Centred on the left edge: options at 420 (60), 360 (0) and 300.
		const crossing: FanLayout = {
			...quarter,
			centre: { x: 0, y: 500 },
			arc: { start: 300, end: 420 },
			step: 60,
			angles: [420, 360, 300]
		};
		expect(optionAt(crossing, at(crossing, 55, 200))).toBe(0);
		expect(optionAt(crossing, at(crossing, 10, 200))).toBe(1);
		expect(optionAt(crossing, at(crossing, 350, 200))).toBe(1);
		expect(optionAt(crossing, at(crossing, 280, 200))).toBe(2);
		expect(optionAt(crossing, at(crossing, 180, 200))).toBeNull();
	});

	it('wraps round a whole ring', () => {
		const ring: FanLayout = {
			...quarter,
			centre: { x: 500, y: 500 },
			arc: { start: 0, end: 360 },
			step: 90,
			angles: [360, 270, 180, 90]
		};
		expect(optionAt(ring, at(ring, 10, 200))).toBe(0);
		expect(optionAt(ring, at(ring, 350, 200))).toBe(0);
		expect(optionAt(ring, at(ring, 100, 200))).toBe(3);
	});

	it('matches the layouts it is used with: each option’s own point is its own', () => {
		for (const count of [4, 6, 9]) {
			const layout = layoutFan({ centre: { x: 1272, y: 0 }, bounds: shell(1920, 1010), count });
			for (const [index, point] of layout.points.entries()) {
				expect(optionAt(layout, point)).toBe(index);
			}
		}
	});
});

describe('the disk and the options, opening and closing', () => {
	const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 774), count: 9 });
	/** How far from the centre an option reaches at a share of the way out: its avatar, grown by the same share. */
	const reach = (index: number, share: number) => {
		const at = layout.points[index] ?? layout.centre;
		const distance = Math.hypot(at.x - layout.centre.x, at.y - layout.centre.y);
		return Math.max(share, 0) * (distance + layout.avatar / 2);
	};

	for (const opening of [true, false]) {
		it(`never leaves an option outside the disk while ${opening ? 'opening' : 'closing'}`, () => {
			const count = layout.points.length;
			const outsideAt: number[] = [];
			for (let elapsed = 0; elapsed <= fanDuration(count, opening); elapsed += 5) {
				// Drawn at no less than nothing: past the centre, both are out of sight.
				const disk = Math.max(diskScale(elapsed, count, opening), 0) * layout.disk;
				for (let index = 0; index < count; index += 1) {
					if (reach(index, optionShare(index, elapsed, opening)) > disk + 0.01) {
						outsideAt.push(elapsed);
					}
				}
			}
			expect(outsideAt).toEqual([]);
		});
	}

	it('opens on the first option’s clock, curve and bounce, staggered after it', () => {
		const first = optionTiming(0, true);
		const last = optionTiming(8, true);
		expect(first).toEqual({ delay: 0, duration: OPTION_MS });
		expect(last.delay).toBe(8 * OPTION_STAGGER_MS);
		expect(fanDuration(9, true)).toBe(last.delay + last.duration);
		// The disk is the first option's share while that is furthest out,
		// overshoot included, and never less than any option's.
		for (const elapsed of [20, 100, 180]) {
			expect(diskScale(elapsed, 9, true)).toBeCloseTo(optionShare(0, elapsed, true), 9);
		}
		expect(Math.max(...[0, 100, 200, 300, 400].map((t) => diskScale(t, 9, true)))).toBeGreaterThan(
			1
		);
	});

	it('closes exactly with the options: same start, same length, same curve', () => {
		for (let index = 0; index < 9; index += 1) {
			expect(optionTiming(index, false)).toEqual({ delay: 0, duration: CLOSE_MS });
		}
		expect(fanDuration(9, false)).toBe(CLOSE_MS);
		for (let elapsed = 0; elapsed <= CLOSE_MS; elapsed += 10) {
			const disk = diskScale(elapsed, 9, false);
			for (let index = 0; index < 9; index += 1) {
				expect(optionShare(index, elapsed, false)).toBeCloseTo(disk, 9);
			}
		}
		expect(diskScale(0, 9, false)).toBeCloseTo(1, 6);
		expect(diskScale(CLOSE_MS, 9, false)).toBeCloseTo(0, 6);
	});

	it('closes the disk, every option and the pill in one brisk time', () => {
		for (const count of [4, 9]) {
			const closing = [
				fanDuration(count, false),
				...Array.from({ length: count }, (_, index) => {
					const { delay, duration } = optionTiming(index, false);
					return delay + duration;
				}),
				pillDuration(false)
			];
			expect(Math.max(...closing) - Math.min(...closing)).toBeLessThanOrEqual(5);
		}
		expect(CLOSE_MS).toBeLessThan(OPTION_MS);
		// Opening, the pill takes an option's time.
		expect(pillDuration(true)).toBe(optionTiming(0, true).duration);
	});
	it('bounces opening, disk and options alike, and closes without any bounce', () => {
		const samples = (opening: boolean, share: (elapsed: number) => number) =>
			Array.from({ length: 101 }, (_, step) => share((step / 100) * fanDuration(9, opening)));
		// Opening: past 1 somewhere, for the disk and for every option.
		expect(Math.max(...samples(true, (t) => diskScale(t, 9, true)))).toBeGreaterThan(1.05);
		for (let index = 0; index < 9; index += 1) {
			expect(Math.max(...samples(true, (t) => optionShare(index, t, true)))).toBeGreaterThan(1.05);
		}
		// Closing: from 1 down to 0, never above 1, never below 0, never back up.
		const closing = samples(false, (t) => diskScale(t, 9, false));
		expect(Math.max(...closing)).toBeLessThanOrEqual(1);
		expect(Math.min(...closing)).toBeGreaterThanOrEqual(0);
		const rises = closing.slice(1).filter((value, index) => value > (closing[index] ?? 0) + 1e-9);
		expect(rises).toEqual([]);
	});

	it('gives the pill the same curve as the options, sampled into CSS', () => {
		const points = (css: string) => (css.match(/-?\d*\.?\d+/g) ?? []).map(Number);
		const opening = points(FAN_CSS_EASING.opening);
		expect(opening).toHaveLength(41);
		const misfit = opening.map((value, step) => Math.abs(value - backOut(step / 40)));
		expect(Math.max(...misfit)).toBeLessThan(1e-4);
		// The same overshoot, and none going home.
		expect(Math.max(...opening)).toBeGreaterThan(1.05);
		expect(Math.max(...points(FAN_CSS_EASING.home))).toBeLessThanOrEqual(1);
		expect(cssEasing((t) => t, 2)).toBe('linear(0.0000, 0.5000, 1.0000)');
	});
});

describe('wedgeShading', () => {
	it('is full strength from just inside the avatars out, and clear well short of the centre', () => {
		for (const count of [4, 9]) {
			const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 774), count });
			const shading = wedgeShading(layout);
			const nearest = Math.min(
				...layout.points.map((at) => Math.hypot(at.x - 390, at.y) - layout.avatar / 2)
			);
			expect(shading.full * layout.disk).toBeLessThanOrEqual(nearest);
			expect(shading.clear).toBeLessThan(shading.full * 0.5);
		}
	});
});

describe('spectrumStops', () => {
	for (let count = 2; count <= 7; count += 1) {
		it(`places ${count} colours in order, the edge ones in wider bands, filling the wedge`, () => {
			const width = 40;
			const stops = spectrumStops(count, width, 1.6);
			expect(stops).toHaveLength(count);
			const ordered = stops.every((stop, index) => index === 0 || stop > (stops[index - 1] ?? 0));
			expect(ordered).toBe(true);
			// Each stop is the middle of its band, so the bands are twice the
			// distance from each band's start; the first starts at 0.
			const bands: number[] = [];
			let start = 0;
			for (const stop of stops) {
				const band = 2 * (stop - start);
				bands.push(band);
				start += band;
			}
			expect(start).toBeCloseTo(width, 9);
			const first = bands[0] ?? 0;
			const last = bands.at(-1) ?? 0;
			expect(first).toBeCloseTo(last, 9);
			// With middle colours, an edge band is 1.6 of a middle one; with two,
			// both are edges.
			expect(first / (bands[1] ?? 1)).toBeCloseTo(count > 2 ? 1.6 : 1, 9);
		});
	}

	it('centres one colour, places none for nobody, and is even with no edge weight', () => {
		expect(spectrumStops(1, 30)).toEqual([15]);
		expect(spectrumStops(0, 30)).toEqual([]);
		expect(spectrumStops(3, 30, 1)).toEqual([5, 15, 25]);
		expect(SPECTRUM_EDGE_WEIGHT).toBeGreaterThan(0.5);
		expect(SPECTRUM_EDGE_WEIGHT).toBeLessThan(1.5);
	});
});

describe('wedgeGradient', () => {
	const wash = 'var(--cream)';

	it('is one colour, plain: the clip path gives it its sides', () => {
		expect(wedgeGradient(['red'], 40, { wash })).toBe('red');
	});

	it('blends several, washed towards the cream, in order, the ends pinned to the sides', () => {
		// Three even bands across 0° to 40°: their middles, with the first and
		// last colours also pinned to 0° and 40°.
		const gradient = wedgeGradient(['red', 'green', 'blue'], 40, { wash, edgeWeight: 1 });
		expect(gradient).toBe(
			'conic-gradient(from -20.00deg, ' +
				`color-mix(in oklab, red ${SPECTRUM_SHARE}%, var(--cream)) 0.00deg, ` +
				`color-mix(in oklab, red ${SPECTRUM_SHARE}%, var(--cream)) 6.67deg, ` +
				`color-mix(in oklab, green ${SPECTRUM_SHARE}%, var(--cream)) 20.00deg, ` +
				`color-mix(in oklab, blue ${SPECTRUM_SHARE}%, var(--cream)) 33.33deg, ` +
				`color-mix(in oklab, blue ${SPECTRUM_SHARE}%, var(--cream)) 40.00deg)`
		);
	});

	it('spreads the colours over only the part of the wedge that can be seen', () => {
		const gradient = wedgeGradient(['red', 'blue'], 40, {
			wash,
			edgeWeight: 1,
			span: { from: 8, to: 24 }
		});
		// Two bands across 8° to 24°.
		expect(gradient).toContain('red 38%, var(--cream)) 8.00deg');
		expect(gradient).toContain('red 38%, var(--cream)) 12.00deg');
		expect(gradient).toContain('blue 38%, var(--cream)) 20.00deg');
		expect(gradient).toContain('blue 38%, var(--cream)) 24.00deg');
	});
});

describe('wedgePolygon', () => {
	/** The polygon's points, in the element's box, as fractions round its centre. */
	const points = (polygon: string) =>
		[...polygon.matchAll(/(?<x>-?[\d.]+)% (?<y>-?[\d.]+)%/g)].map((match) => ({
			x: (Number(match.groups?.x) - 50) / 100,
			y: (Number(match.groups?.y) - 50) / 100
		}));

	it('runs from the centre out along the sector, pointing up, its sides at half the width either way', () => {
		const [centre, first, ...rest] = points(wedgePolygon(40));
		const last = rest.at(-1);
		expect(centre).toEqual({ x: 0, y: 0 });
		// Screen angles from up, clockwise: -20° and 20°.
		expect((Math.atan2(first?.x ?? 0, -(first?.y ?? 0)) * 180) / Math.PI).toBeCloseTo(-20, 2);
		expect((Math.atan2(last?.x ?? 0, -(last?.y ?? 0)) * 180) / Math.PI).toBeCloseTo(20, 2);
	});

	it('keeps every edge between outer points outside the rim, however wide the wedge', () => {
		for (const width of [10, 45, 90, 179, 300]) {
			const [, ...outer] = points(wedgePolygon(width));
			// The nearest any outer edge comes to the centre, as a share of the
			// box: more than the rim's half.
			const nearest = Math.min(
				...outer.slice(1).map((point, index) => {
					const from = outer[index] ?? point;
					const middle = { x: (from.x + point.x) / 2, y: (from.y + point.y) / 2 };
					return Math.hypot(middle.x, middle.y);
				})
			);
			expect(nearest).toBeGreaterThan(0.5);
		}
	});
});

describe('wedgeSpan', () => {
	const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 774), count: 5 });

	it('is the whole wedge for an option in the middle of the arc', () => {
		expect(wedgeSpan(layout, 2)).toEqual({ from: 0, to: layout.step });
	});

	it('is the whole wedge for one at an end too: every sector is a share of what shows', () => {
		const first = wedgeSpan(layout, 0);
		expect(first.from).toBeCloseTo(0, 6);
		expect(first.to).toBeCloseTo(layout.step, 6);
		const last = wedgeSpan(layout, 4);
		expect(last.from).toBeCloseTo(0, 6);
		expect(last.to).toBeCloseTo(layout.step, 6);
	});

	it('is the part on what shows for a sector that runs past it', () => {
		const past = { ...layout, angles: [layout.arc.end], sectors: undefined };
		expect(wedgeSpan(past, 0)).toEqual({ from: 0, to: layout.step / 2 });
	});
});
