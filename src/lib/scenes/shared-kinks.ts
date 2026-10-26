import { effectiveAnswer, type Level, type ListPayload } from '../kink-list/answers';
import { kinkById, liveItems, sidesOf } from '../kink-list/catalog';
import { type Comparison, type Pairing, sidesLabel } from '../kink-list/compare';

/**
 * The kinks the prompt column offers as chips: in a shared scene, what both
 * partners said yes to on the lists they share with each other; in a solo
 * scene, what the person likes or loves on their own. Never a limit, never
 * a mismatch, and never anything one partner held back or said no to: a chip
 * must not tell anyone something about the other they were not shown on the
 * comparison page already. See docs/scenes.md, "What you're into".
 */

export type KinkChip = {
	kinkId: string;
	name: string;
	/** "You giving, them receiving", for a kink answered per side; empty otherwise. */
	sides: string;
	/** Strongest first; for ordering only, never shown. */
	score: number;
};

const LEVEL_SCORE: Partial<Record<Level, number>> = {
	love: 3,
	like: 2,
	curious: 1,
	conditional: 1
};

/** How many chips each step of Fewer and More shows. Level 0 hides them. */
const CHIPS_AT_LEVEL = [0, 8, 16, 32, 64, Number.POSITIVE_INFINITY] as const;

function chipFor(pairing: Pairing): KinkChip | null {
	const item = kinkById(pairing.key);
	if (!item) {
		return null;
	}
	return {
		kinkId: item.id,
		name: item.name,
		sides: sidesLabel(pairing.key, pairing.mySide),
		score: (LEVEL_SCORE[pairing.mine] ?? 0) + (LEVEL_SCORE[pairing.theirs] ?? 0)
	};
}

/**
 * One chip per kink. A kink that matches both ways round (you both like it
 * giving and receiving) is one chip saying so, rather than two that differ
 * only in their small print.
 */
function onePerKink(chips: KinkChip[]): KinkChip[] {
	const byKink = new Map<string, KinkChip>();
	for (const chip of chips) {
		const seen = byKink.get(chip.kinkId);
		if (!seen) {
			byKink.set(chip.kinkId, chip);
		} else if (seen.sides !== chip.sides) {
			byKink.set(chip.kinkId, {
				...seen,
				sides: EITHER_WAY,
				score: Math.max(seen.score, chip.score)
			});
		}
	}
	return [...byKink.values()];
}

export const EITHER_WAY = 'Either way';

function limited(chips: KinkChip[], level: number): KinkChip[] {
	const count = CHIPS_AT_LEVEL[Math.max(0, Math.min(level, CHIPS_AT_LEVEL.length - 1))] ?? 0;
	return chips
		.toSorted((a, b) => b.score - a.score || a.name.localeCompare(b.name))
		.slice(0, count);
}

/**
 * The chips for a shared scene. What you both want comes first; from the
 * third step of More, what one of you wants and the other is curious about
 * too. Blind comparing (either partner's) keeps it to what you both want, as
 * the comparison page does.
 */
export function sharedKinkChips(
	comparison: Comparison,
	options: { level: number; blind: boolean }
): KinkChip[] {
	const groups =
		options.blind || options.level < 3 ? ['both' as const] : (['both', 'explore'] as const);
	const chips = groups
		.flatMap((group) => comparison.groups[group])
		.map(chipFor)
		.filter((chip): chip is KinkChip => chip !== null);
	return limited(onePerKink(chips), options.level);
}

/** The chips for a solo scene: what this person likes or loves, on either side. */
export function ownKinkChips(list: ListPayload, level: number): KinkChip[] {
	const chips: KinkChip[] = [];
	for (const item of liveItems) {
		if (item.parent === undefined) {
			continue;
		}
		const sides = sidesOf(item);
		const levels = sides
			? (['a', 'b'] as const).map((side) => ({
					side,
					level: effectiveAnswer(list, item.id, side).level
				}))
			: [{ side: null, level: effectiveAnswer(list, item.id).level }];
		for (const { side, level: answer } of levels) {
			if (answer === 'love' || answer === 'like') {
				chips.push({
					kinkId: item.id,
					name: item.name,
					sides: side && sides ? sides[side === 'a' ? 0 : 1] : '',
					score: LEVEL_SCORE[answer] ?? 0
				});
			}
		}
	}
	return limited(onePerKink(chips), level);
}
