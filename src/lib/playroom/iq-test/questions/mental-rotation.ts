import type { Rng } from '../random';
import { multiChoices } from './choices';
import type { Generator, Polyomino } from './types';

/**
 * A flat shape, then several: tick every one that is the same shape turned
 * round, not flipped over. After openpsychometrics' Full Scale IQ Test mental
 * rotations section, in two dimensions rather than its drawn blocks.
 *
 * The shapes are polyominoes — squares joined edge to edge — chosen so that
 * all four turns differ and every mirror image differs from every turn, so
 * a flipped one can only be told apart by turning it in the head. The wrong
 * answers are mostly those mirror images; the rest are a different shape of
 * the same size. Partly credited, so a guess costs what a find gains.
 */

type Cells = [number, number][];

/** Moved so its top-left is at 0,0, in a fixed order, so equal shapes compare equal. */
function normalise(cells: readonly (readonly [number, number])[]): Cells {
	const minX = Math.min(...cells.map(([x]) => x));
	const minY = Math.min(...cells.map(([, y]) => y));
	return cells
		.map(([x, y]) => [x - minX, y - minY] as [number, number])
		.sort(([ax, ay], [bx, by]) => ay - by || ax - bx);
}

const keyOf = (cells: Polyomino) => JSON.stringify(cells);

/** A quarter turn clockwise. */
export function turn(cells: Polyomino): Cells {
	return normalise(cells.map(([x, y]) => [-y, x]));
}

/** Flipped left to right. */
export function mirror(cells: Polyomino): Cells {
	return normalise(cells.map(([x, y]) => [-x, y]));
}

/** The four turns of a shape, the first as given. */
export function turns(cells: Polyomino): Cells[] {
	const all = [normalise(cells)];
	for (let i = 1; i < 4; i += 1) {
		all.push(turn(all[i - 1] as Cells));
	}
	return all;
}

/** Grow a shape of `size` squares from one, each new square beside one already there. */
function grow(rng: Rng, size: number): Cells {
	const cells: Cells = [[0, 0]];
	const taken = new Set(['0,0']);
	while (cells.length < size) {
		const [x, y] = rng.pick(cells);
		const [dx, dy] = rng.pick([
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1]
		] as const);
		const key = `${x + dx},${y + dy}`;
		if (!taken.has(key)) {
			taken.add(key);
			cells.push([x + dx, y + dy]);
		}
	}
	return normalise(cells);
}

/** Every turn different, and no mirror image the same as any turn. */
function isAsymmetric(cells: Polyomino): boolean {
	const keys = new Set([...turns(cells), ...turns(mirror(cells))].map(keyOf));
	return keys.size === 8;
}

/** An asymmetric shape of `size` squares. Retries are rare from five squares up. */
function asymmetricShape(rng: Rng, size: number, unlike?: Polyomino): Cells {
	const avoid = new Set(unlike ? [...turns(unlike), ...turns(mirror(unlike))].map(keyOf) : []);
	for (;;) {
		const cells = grow(rng, size);
		if (isAsymmetric(cells) && !avoid.has(keyOf(cells))) {
			return cells;
		}
	}
}

export const mentalRotation: Generator = (rng, difficulty, _context, id) => {
	const size = 4 + Math.ceil(difficulty / 2);
	const shape = asymmetricShape(rng, size);
	const [shown, ...others] = rng.shuffle(turns(shape)) as [Cells, ...Cells[]];
	// From difficulty 3 the shape as shown is never among the answers: every
	// right one has to be turned to be seen.
	const pool = difficulty >= 3 ? others : [shown, ...others];
	const rights = rng.sample(pool, rng.int(2, 3));
	const options = difficulty >= 3 ? 8 : 6;
	const mirrors = rng.sample(turns(mirror(shape)), Math.min(4, options - rights.length - 1));
	const stranger = asymmetricShape(rng, size, shape);
	const fillers = rng.sample(turns(stranger), options - rights.length - mirrors.length);
	const { choices, answers } = multiChoices(
		rng,
		rights.map((polyomino) => ({ label: '', polyomino })),
		[...mirrors, ...fillers].map((polyomino) => ({ label: '', polyomino }))
	);
	return {
		id,
		kind: 'mental-rotation',
		difficulty,
		prompt: 'Tick every shape that is this one turned round. Flipped over does not count.',
		display: { type: 'polyomino', cells: shown },
		format: 'multi',
		// Named by letter: anything more would give the answer away.
		choices: choices.map((choice) => ({ ...choice, label: `Shape ${choice.id.toUpperCase()}` })),
		answers
	};
};
