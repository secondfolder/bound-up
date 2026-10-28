import { describe, expect, it } from 'vitest';
import {
	AVATAR_SIZES,
	type Box,
	boxesOverlap,
	DEAD_ZONE,
	EDGE_MARGIN,
	type FanLayout,
	fanCentre,
	hintPlacement,
	LABEL_GOOD,
	LABEL_MAX,
	LABEL_MIN,
	labelBudget,
	layoutFan,
	OPTION_GAP,
	optionAt,
	optionBoxes,
	pointAt,
	spreadEvenly,
	stepAlong,
	visibleArc
} from './context-fan';

const shell = (width: number, height: number): Box => ({
	left: 0,
	top: 0,
	right: width,
	bottom: height
});

/** Every option's avatar and name, as drawn at the layout's sizes. */
function boxes(layout: FanLayout) {
	return layout.points.map((at) => optionBoxes(at, layout));
}

/** Every pair of options that collide, by what collides: none in a good fan. */
function collisions(layout: FanLayout): string[] {
	const all = boxes(layout);
	const found: string[] = [];
	for (const [i, a] of all.entries()) {
		for (const [j, b] of all.entries()) {
			if (i === j) {
				continue;
			}
			if (boxesOverlap(a.label, b.label)) {
				found.push(`names ${i} and ${j}`);
			}
			if (boxesOverlap(a.label, b.avatar)) {
				found.push(`name ${i} and avatar ${j}`);
			}
			if (boxesOverlap(a.avatar, b.avatar)) {
				found.push(`avatars ${i} and ${j}`);
			}
		}
	}
	return found;
}

/** Every option that is not wholly inside `bounds`, less the edge margin. */
function outside(layout: FanLayout, bounds: Box): number[] {
	const within = (box: Box) =>
		box.left >= bounds.left + EDGE_MARGIN - 0.01 &&
		box.right <= bounds.right - EDGE_MARGIN + 0.01 &&
		box.top >= bounds.top + EDGE_MARGIN - 0.01 &&
		box.bottom <= bounds.bottom - EDGE_MARGIN + 0.01;
	return boxes(layout).flatMap((option, index) =>
		within(option.avatar) && within(option.label) ? [] : [index]
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
	const size = { avatar: 56, label: 80 };

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
		const end = optionBoxes(pointAt(centre, 250, arc?.end ?? 0), size);
		// Its avatar's top is on the top edge, to a hundredth of a degree.
		expect(end.avatar.top).toBeGreaterThanOrEqual(0);
		expect(end.avatar.top).toBeLessThan(0.1);
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
	it('puts the first at the arc’s end and the last at its start, evenly between', () => {
		expect(spreadEvenly({ start: 90, end: 180 }, 4)).toEqual([180, 150, 120, 90]);
		expect(stepAlong({ start: 90, end: 180 }, 4)).toBe(30);
	});

	it('puts one in the middle, and spaces a whole ring by its count', () => {
		expect(spreadEvenly({ start: 10, end: 170 }, 1)).toEqual([90]);
		expect(spreadEvenly({ start: 0, end: 360 }, 4)).toEqual([360, 270, 180, 90]);
		expect(spreadEvenly({ start: 0, end: 90 }, 0)).toEqual([]);
	});
});

describe('labelBudget', () => {
	it('is the gap between two options side by side, less the clear space', () => {
		expect(
			labelBudget(
				[
					{ x: 0, y: 0 },
					{ x: 100, y: 0 }
				],
				56
			)
		).toBe(100 - OPTION_GAP);
	});

	it('keeps a name off the avatar beside it, one row down', () => {
		// b sits level with a's name: a's name may reach to the clear space short of b's avatar.
		const budget = labelBudget(
			[
				{ x: 0, y: 0 },
				{ x: 80, y: 60 }
			],
			56
		);
		expect(budget).toBe(2 * (80 - 28 - OPTION_GAP));
	});

	it('is the most a name is ever given when nothing is near', () => {
		expect(labelBudget([{ x: 0, y: 0 }], 56)).toBe(LABEL_MAX);
	});

	it('cannot mend two avatars on top of each other', () => {
		expect(
			labelBudget(
				[
					{ x: 0, y: 0 },
					{ x: 20, y: 20 }
				],
				56
			)
		).toBe(Number.NEGATIVE_INFINITY);
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
		for (const count of [4, 5, 6, 7, 8, 9]) {
			it(`fits ${count} options on a ${viewport.name}, evenly, with no name in the way`, () => {
				const bounds = shell(viewport.width, viewport.height - 70);
				const centre = fanCentre(viewport.control, shell(viewport.width, viewport.height));
				const layout = layoutFan({ centre, bounds, count });
				expect(layout.fits).toBe(true);
				expect(layout.points).toHaveLength(count);
				expect(layout.label).toBeGreaterThanOrEqual(LABEL_MIN);
				expect(collisions(layout)).toEqual([]);
				expect(outside(layout, bounds)).toEqual([]);
				expect(Math.max(...unevenness(layout))).toBe(0);
			});
		}
	}

	it('centres a phone’s fan on the corner and uses its quarter', () => {
		const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 774), count: 4 });
		expect(layout.arc.start).toBeGreaterThan(90);
		expect(layout.arc.end).toBeLessThan(180);
		expect(layout.avatar).toBe(AVATAR_SIZES[0]);
	});

	it('uses the whole half of the ring that shows round a control away from the corner', () => {
		const layout = layoutFan({ centre: { x: 1272, y: 0 }, bounds: shell(1920, 1010), count: 5 });
		// From near the right of the centre round to near its left.
		expect(layout.arc.start).toBeLessThan(20);
		expect(layout.arc.end).toBeGreaterThan(160);
		expect(layout.label).toBeGreaterThanOrEqual(80);
	});

	it('staggers a fan too crowded for one ring, rather than let names collide', () => {
		const roomy = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 784), count: 4 });
		expect(roomy.stagger).toBe(0);
		const crowded = layoutFan({ centre: { x: 390, y: 0 }, bounds: shell(390, 784), count: 9 });
		expect(crowded.stagger).toBeGreaterThan(0);
		expect(crowded.label).toBeGreaterThanOrEqual(LABEL_GOOD);
		// Every other option a row further in, at the same even angles.
		const distances = crowded.points.map((point) => Math.hypot(point.x - 390, point.y));
		expect(distances[0]).toBeCloseTo(crowded.radius, 6);
		expect(distances[1]).toBeCloseTo(crowded.radius - crowded.stagger, 6);
		expect(collisions(crowded)).toEqual([]);
		expect(Math.max(...unevenness(crowded))).toBe(0);
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

describe('hintPlacement', () => {
	it('puts the hint inside the ring, clear of every option', () => {
		const bounds = shell(390, 774);
		const layout = layoutFan({ centre: { x: 390, y: 0 }, bounds, count: 5 });
		const at = hintPlacement(layout, bounds, { width: 120, height: 46 });
		expect(at).not.toBeNull();
		const box = {
			left: at?.x ?? 0,
			top: at?.y ?? 0,
			right: (at?.x ?? 0) + 120,
			bottom: (at?.y ?? 0) + 46
		};
		for (const option of boxes(layout)) {
			expect(boxesOverlap(box, option.avatar)).toBe(false);
			expect(boxesOverlap(box, option.label)).toBe(false);
		}
		expect(box.right).toBeLessThanOrEqual(390);
	});
});

describe('optionAt', () => {
	/** A hand-made fan: options every 30° from 180 (left) to 90 (down), on a 300 ring. */
	const quarter: FanLayout = {
		centre: { x: 400, y: 0 },
		radius: 250,
		stagger: 0,
		avatar: 56,
		label: 80,
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
