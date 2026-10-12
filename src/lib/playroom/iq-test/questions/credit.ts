import type { Grid } from './types';

/**
 * The central point question's measure, apart from the generators so they
 * can use it without importing the module that registers them.
 */

/** The mean straight-line distance from a cell to the points, in cells. */
export function meanDistance(grid: Grid, points: readonly number[], cell: number): number {
	const x = cell % grid.columns;
	const y = Math.floor(cell / grid.columns);
	const total = points.reduce((sum, point) => {
		const dx = (point % grid.columns) - x;
		const dy = Math.floor(point / grid.columns) - y;
		return sum + Math.hypot(dx, dy);
	}, 0);
	return total / points.length;
}

/** The cells with the lowest mean distance to the points: the best answers. */
export function centralCells(grid: Grid, points: readonly number[]): number[] {
	const cells = Array.from({ length: grid.columns * grid.rows }, (_, cell) => cell);
	const distances = cells.map((cell) => meanDistance(grid, points, cell));
	const best = Math.min(...distances);
	return cells.filter((cell) => distances[cell] !== undefined && distances[cell] - best < 1e-9);
}

/**
 * A point's worth: 1 at a best cell, and down by a whole point for every
 * half a cell further from the points on average it is, so a near miss
 * scores most of the way and a guess at a corner nothing.
 */
export function pointCredit(grid: Grid, points: readonly number[], cell: number): number {
	if (!Number.isInteger(cell) || cell < 0 || cell >= grid.columns * grid.rows) {
		return 0;
	}
	const best = meanDistance(grid, points, centralCells(grid, points)[0] ?? 0);
	const extra = meanDistance(grid, points, cell) - best;
	return Math.max(0, Math.min(1, 1 - extra * 2));
}
