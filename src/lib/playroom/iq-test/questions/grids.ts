import { centralCells, hasClearCentre } from './credit';
import type { Generator, Grid } from './types';

/**
 * The two board questions, after openpsychometrics' Full Scale IQ Test:
 * visual memory and central point.
 */

/** "Row 2, column 3", counted from 1, for a cell's accessible name. */
export function cellName(grid: Grid, cell: number): string {
	return `Row ${Math.floor(cell / grid.columns) + 1}, column ${(cell % grid.columns) + 1}`;
}

/**
 * A board with some cells shaded, shown for a few seconds; then shade the
 * same cells from memory. Partly credited: one point per right cell, one off
 * per wrong one. Their board, 5 by 6; more cells and less time as it climbs.
 */
export const visualMemory: Generator = (rng, difficulty, _context, id) => {
	const grid: Grid = { columns: 5, rows: 6 };
	const cells = Array.from({ length: grid.columns * grid.rows }, (_, cell) => cell);
	const shaded = rng.sample(cells, difficulty + 3).sort((a, b) => a - b);
	return {
		id,
		kind: 'visual-memory',
		difficulty,
		prompt: 'Shade the squares that were shaded.',
		display: { type: 'none' },
		memorise: {
			prompt: 'Remember which squares are shaded.',
			items: [],
			grid: { ...grid, shaded },
			seconds: difficulty <= 2 ? 5 : 4
		},
		format: 'multi',
		grid,
		choices: cells.map((cell) => ({ id: String(cell), label: cellName(grid, cell) })),
		answers: shaded.map(String)
	};
};

/**
 * A board with some points marked: pick the square at their centre, their
 * average position. Credited by how close to it the pick is (see
 * `pointCredit`), so a near miss is worth some of the way. Bigger boards and
 * more points as it climbs.
 *
 * Points are drawn again until the centre is clearly inside one square
 * (`hasClearCentre`), so there is only ever one right answer. At least a
 * third of draws pass at every difficulty, so this ends in a few tries.
 */
export const centralPoint: Generator = (rng, difficulty, _context, id) => {
	const size = 4 + difficulty;
	const grid: Grid = { columns: size, rows: size };
	const cells = Array.from({ length: size * size }, (_, cell) => cell);
	let points = rng.sample(cells, difficulty + 2);
	while (!hasClearCentre(grid, points)) {
		points = rng.sample(cells, difficulty + 2);
	}
	points.sort((a, b) => a - b);
	return {
		id,
		kind: 'central-point',
		difficulty,
		prompt: 'Pick the square at the centre of the marked squares: their average position.',
		display: { type: 'none' },
		format: 'point',
		grid,
		points,
		answer: String(centralCells(grid, points)[0] ?? 0)
	};
};
