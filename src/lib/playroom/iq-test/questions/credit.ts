import type { Grid } from './types';

/**
 * The central point question's measure, apart from the generators so they
 * can use it without importing the module that registers them.
 *
 * The centre is the points' average position, not the square with the least
 * mean distance to them (the geometric median), which this used to be. That
 * measure is flat near its best, so neighbouring squares differed by a tenth
 * of a square or less on most boards, nobody could see which was nearer, and
 * symmetric boards tied outright. It also disagreed with "the centre" on
 * about two boards in three.
 */

/** How far inside its square the centre must be, in squares, to be dealt. */
export const CENTRE_MARGIN = 0.15;

/** The points' average position, in cells, from the top-left cell's centre. */
export function centreOf(grid: Grid, points: readonly number[]): { x: number; y: number } {
	const sum = points.reduce(
		(total, point) => ({
			x: total.x + (point % grid.columns),
			y: total.y + Math.floor(point / grid.columns)
		}),
		{ x: 0, y: 0 }
	);
	return { x: sum.x / points.length, y: sum.y / points.length };
}

/** The straight-line distance from a cell's centre to the points' centre. */
export function centreDistance(grid: Grid, points: readonly number[], cell: number): number {
	const centre = centreOf(grid, points);
	return Math.hypot((cell % grid.columns) - centre.x, Math.floor(cell / grid.columns) - centre.y);
}

/**
 * Whether the centre sits clearly inside one square: at least `CENTRE_MARGIN`
 * from every edge of it, so the answer is one square a person can see is
 * right. Four points at two opposite corners put it on an edge, between two
 * squares equally right.
 */
export function hasClearCentre(grid: Grid, points: readonly number[]): boolean {
	const fromEdge = (value: number) => Math.abs(value - Math.round(value)) <= 0.5 - CENTRE_MARGIN;
	const centre = centreOf(grid, points);
	return fromEdge(centre.x) && fromEdge(centre.y);
}

/** The cells nearest the centre: the best answers, one unless it is on an edge. */
export function centralCells(grid: Grid, points: readonly number[]): number[] {
	const cells = Array.from({ length: grid.columns * grid.rows }, (_, cell) => cell);
	const distances = cells.map((cell) => centreDistance(grid, points, cell));
	const best = Math.min(...distances);
	return cells.filter((cell) => distances[cell] !== undefined && distances[cell] - best < 1e-9);
}

/**
 * A point's worth: 1 at a best cell, and down by half a point for every
 * square further from the centre it is, so a neighbour scores about half and
 * a guess two squares off nothing.
 */
export function pointCredit(grid: Grid, points: readonly number[], cell: number): number {
	if (!Number.isInteger(cell) || cell < 0 || cell >= grid.columns * grid.rows) {
		return 0;
	}
	const best = centreDistance(grid, points, centralCells(grid, points)[0] ?? 0);
	const extra = centreDistance(grid, points, cell) - best;
	return Math.max(0, Math.min(1, 1 - extra / 2));
}
