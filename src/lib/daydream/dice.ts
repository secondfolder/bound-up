/**
 * Dice: the model proposes a roll at an uncertain moment, and the browser
 * rolls it.
 *
 * The browser rolls, not the model, because a language model asked for a
 * random number writes the one the story wants: the point of a roll is an
 * outcome nobody chose. The result becomes a turn the next reply must honour
 * (the prompt says so), so a reload, a retry or a branch all see the same
 * roll; rolling again means rewinding to the proposal, which is a branch of
 * its own, out in the open.
 *
 * Pure, and alias-free so the sealed kind can check a proposal with it.
 */

export type RollOutcome = { min: number; max: number; label: string };

export type RollProposal = {
	/** What the roll decides, as the card shows it: "Roll to see if you can hold still". */
	prompt: string;
	sides: number;
	/** Every face 1..sides in exactly one outcome. */
	outcomes: RollOutcome[];
};

export const MIN_SIDES = 2;
export const MAX_SIDES = 20;

/**
 * Whether the outcomes cover every face exactly once. A proposal that leaves
 * a face uncovered would let a roll land on nothing; one that overlaps would
 * leave the outcome ambiguous. Either is the model's mistake, and the card is
 * not shown rather than guessing.
 */
export function coversEveryFace(proposal: Pick<RollProposal, 'sides' | 'outcomes'>): boolean {
	const { sides, outcomes } = proposal;
	if (!Number.isInteger(sides) || sides < MIN_SIDES || sides > MAX_SIDES) {
		return false;
	}
	const seen = new Array<boolean>(sides + 1).fill(false);
	for (const { min, max } of outcomes) {
		if (!(Number.isInteger(min) && Number.isInteger(max)) || min < 1 || max > sides || min > max) {
			return false;
		}
		for (let face = min; face <= max; face += 1) {
			if (seen[face]) {
				return false;
			}
			seen[face] = true;
		}
	}
	return seen.slice(1).every(Boolean);
}

/** The outcome a face lands on, or null if none does (a proposal that failed `coversEveryFace`). */
export function outcomeFor(proposal: RollProposal, result: number): RollOutcome | null {
	return (
		proposal.outcomes.find((outcome) => result >= outcome.min && result <= outcome.max) ?? null
	);
}

/** Fills a buffer with random bytes; `crypto.getRandomValues`, or a fake in tests. */
export type RandomSource = (buffer: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer>;

const defaultRandom: RandomSource = (buffer) => crypto.getRandomValues(buffer);

/**
 * A fair roll of a `sides`-sided die.
 *
 * Rejection sampling rather than `% sides`: 2^32 is not a multiple of most
 * die sizes, so a plain modulo makes the low faces very slightly likelier.
 * Values in the uneven top slice are thrown away and drawn again.
 */
export function roll(sides: number, random: RandomSource = defaultRandom): number {
	if (!Number.isInteger(sides) || sides < MIN_SIDES || sides > MAX_SIDES) {
		throw new RangeError(`A die has ${MIN_SIDES} to ${MAX_SIDES} sides, not ${sides}`);
	}
	const range = 2 ** 32;
	const limit = range - (range % sides);
	const buffer = new Uint32Array(1);
	for (;;) {
		const [value = 0] = random(buffer);
		if (value < limit) {
			return (value % sides) + 1;
		}
	}
}
