import { shuffledChoices } from './choices';
import { FILLS, type Generator, SHAPES, type ShapeCell } from './types';

/**
 * A 3×3 grid of shape cells with the bottom-right one missing — the
 * progressive-matrices question that makes a test look like an IQ test.
 *
 * Each attribute (shape, count, fill) follows one rule across the grid:
 * - `constant`: the same in every cell.
 * - `row` / `column`: the same along a row (or column), different between them.
 * - `latin`: each value once per row and once per column, shifted each row.
 *   `latin-reverse` shifts the other way, so two latin attributes are not
 *   simply locked together.
 */
type AttributeRule = 'constant' | 'row' | 'column' | 'latin' | 'latin-reverse';

/** Rule sets per difficulty: how many attributes vary, and how. */
const RULE_SETS: Record<1 | 2 | 3 | 4 | 5, readonly AttributeRule[][]> = {
	1: [
		['row', 'constant', 'constant'],
		['column', 'constant', 'constant']
	],
	2: [
		['row', 'column', 'constant'],
		['column', 'row', 'constant']
	],
	3: [
		['latin', 'row', 'constant'],
		['row', 'latin', 'constant'],
		['latin', 'constant', 'column']
	],
	4: [
		['latin', 'latin-reverse', 'constant'],
		['latin', 'row', 'column'],
		['row', 'latin', 'latin-reverse']
	],
	5: [
		['latin', 'latin-reverse', 'row'],
		['latin-reverse', 'column', 'latin'],
		['latin', 'latin-reverse', 'latin']
	]
};

function valueIndex(rule: AttributeRule, row: number, column: number): number {
	switch (rule) {
		case 'constant':
			return 0;
		case 'row':
			return row;
		case 'column':
			return column;
		case 'latin':
			return (row + column) % 3;
		case 'latin-reverse':
			return (row + 2 * column) % 3;
		default:
			return 0;
	}
}

export const matrix: Generator = (rng, difficulty, _context, id) => {
	// Which attribute gets which rule is shuffled too, so "shape always varies
	// by row" is not something to learn.
	const rules = rng.shuffle(rng.pick(RULE_SETS[difficulty]));
	const shapes = rng.sample(SHAPES, 3);
	const counts = rng.shuffle([1, 2, 3] as const);
	const fills = rng.shuffle(FILLS);
	const cellAt = (row: number, column: number): ShapeCell => ({
		shape: shapes[valueIndex(rules[0] ?? 'constant', row, column)] ?? 'circle',
		count: counts[valueIndex(rules[1] ?? 'constant', row, column)] ?? 1,
		fill: fills[valueIndex(rules[2] ?? 'constant', row, column)] ?? 'solid'
	});
	const cells: (ShapeCell | null)[] = [];
	for (let row = 0; row < 3; row += 1) {
		for (let column = 0; column < 3; column += 1) {
			cells.push(row === 2 && column === 2 ? null : cellAt(row, column));
		}
	}
	const correct = cellAt(2, 2);
	return {
		id,
		kind: 'matrix',
		difficulty,
		prompt: 'Which piece completes the pattern?',
		display: { type: 'matrix', cells },
		format: 'choice',
		...shuffledChoices(
			rng,
			{ label: describeCell(correct), cell: correct },
			rng
				.shuffle(nearMisses(correct))
				.slice(0, 5)
				.map((cell) => ({ label: describeCell(cell), cell }))
		)
	};
};

/** Every cell one attribute away from the answer: the only fair distractors. */
function nearMisses(correct: ShapeCell): ShapeCell[] {
	return [
		...SHAPES.filter((shape) => shape !== correct.shape).map((shape) => ({ ...correct, shape })),
		...([1, 2, 3] as const)
			.filter((count) => count !== correct.count)
			.map((count) => ({ ...correct, count })),
		...FILLS.filter((fill) => fill !== correct.fill).map((fill) => ({ ...correct, fill }))
	];
}

/** The accessible name of a cell, which is also how a screen reader answers. */
export function describeCell(cell: ShapeCell): string {
	const noun = cell.count === 1 ? cell.shape : `${cell.shape}s`;
	return `${cell.count} ${cell.fill} ${noun}`;
}
