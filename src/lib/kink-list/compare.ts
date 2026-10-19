import {
	effectiveAnswer,
	type ItemKey,
	isAnswered,
	isPositive,
	type Level,
	type ListPayload
} from './answers';
import {
	categories,
	childrenOf,
	type KinkItem,
	kinkById,
	primaryCategoryOf,
	sidesOf
} from './catalog';

/**
 * Two kink lists side by side: where they match, where they could, and each
 * other's limits. Used against a shared link and between partners. See
 * docs/kink-list.md, "Comparing".
 *
 * **Matching is role-aware.** For a kink with a role pair, my giving is
 * compared with their receiving, my "as dom" with their "as sub", my "on me"
 * with their "on my partner" — the halves that fit together. A kink without a
 * pair is compared directly. Answers are the effective ones, so a specific
 * that only inherits its kink's answer still counts.
 */

export type MatchGroup =
	/** Both Like or Love. */
	| 'both'
	/** Both a yes, at least one only Curious. */
	| 'explore'
	/** Both a yes, at least one Conditional: the conditions are the conversation. */
	| 'conditions'
	/** One a yes, the other Don't mind. */
	| 'talk'
	/** One a yes, the other Not for me. */
	| 'mismatch';

export const GROUP_LABELS: Record<MatchGroup, string> = {
	both: 'You both want this',
	explore: 'Worth exploring',
	conditions: 'With conditions',
	talk: 'Worth a talk',
	mismatch: 'Not a match'
};

export type Pairing = {
	key: ItemKey;
	/** The side of my answer, and of theirs, being compared: null for a kink with no pair. */
	mySide: 'a' | 'b' | null;
	mine: Level;
	theirs: Level;
};

export type Comparison = {
	groups: Record<MatchGroup, Pairing[]>;
	/** Kinks they answered as a hard limit, on either side, wholesale or not. */
	theirLimits: ItemKey[];
	myLimits: ItemKey[];
	/** For each category, how many of its kinks you both want. */
	overlap: { categoryId: string; both: number }[];
};

function classify(mine: Level, theirs: Level): MatchGroup | null {
	if (mine === 'limit' || theirs === 'limit') {
		return null;
	}
	const yesMine = isPositive(mine);
	const yesTheirs = isPositive(theirs);
	if (yesMine && yesTheirs) {
		if (mine === 'conditional' || theirs === 'conditional') {
			return 'conditions';
		}
		if (mine === 'curious' || theirs === 'curious') {
			return 'explore';
		}
		return 'both';
	}
	if (!(yesMine || yesTheirs)) {
		return null;
	}
	const other = yesMine ? theirs : mine;
	return other === 'dont-mind' ? 'talk' : 'mismatch';
}

function pairings(mine: ListPayload, theirs: ListPayload, item: KinkItem): Pairing[] {
	if (!sidesOf(item)) {
		const a = effectiveAnswer(mine, item.id).level;
		const b = effectiveAnswer(theirs, item.id).level;
		return a && b ? [{ key: item.id, mySide: null, mine: a, theirs: b }] : [];
	}
	const result: Pairing[] = [];
	for (const [mySide, theirSide] of [
		['a', 'b'],
		['b', 'a']
	] as const) {
		const a = effectiveAnswer(mine, item.id, mySide).level;
		const b = effectiveAnswer(theirs, item.id, theirSide).level;
		if (a && b) {
			result.push({ key: item.id, mySide, mine: a, theirs: b });
		}
	}
	return result;
}

function isLimit(list: ListPayload, item: KinkItem): boolean {
	if (!sidesOf(item)) {
		return effectiveAnswer(list, item.id).level === 'limit';
	}
	return (
		effectiveAnswer(list, item.id, 'a').level === 'limit' ||
		effectiveAnswer(list, item.id, 'b').level === 'limit'
	);
}

/**
 * The kinks to compare, in catalogue order: every kink, and the specifics
 * either person answered themselves. A specific that only inherits its
 * kink's answer would repeat that kink's line, once for each specific.
 */
function kinksToCompare(mine: ListPayload, theirs: ListPayload): KinkItem[] {
	const answered = (item: KinkItem) =>
		isAnswered(mine.answers[item.id]) || isAnswered(theirs.answers[item.id]);
	return categories().flatMap((category) =>
		childrenOf(category.id).flatMap((kink) => [kink, ...childrenOf(kink.id).filter(answered)])
	);
}

export function compareLists(mine: ListPayload, theirs: ListPayload): Comparison {
	const groups: Comparison['groups'] = {
		both: [],
		explore: [],
		conditions: [],
		talk: [],
		mismatch: []
	};
	const theirLimits: ItemKey[] = [];
	const myLimits: ItemKey[] = [];
	const overlap = new Map<string, Set<string>>();
	for (const item of kinksToCompare(mine, theirs)) {
		for (const pairing of pairings(mine, theirs, item)) {
			const group = classify(pairing.mine, pairing.theirs);
			if (group) {
				groups[group].push(pairing);
			}
			// Counted per kink: both halves of a role pair matching is still one kink.
			if (group === 'both') {
				const categoryId = primaryCategoryOf(item).id;
				overlap.set(categoryId, (overlap.get(categoryId) ?? new Set()).add(item.id));
			}
		}
		if (isLimit(theirs, item)) {
			theirLimits.push(item.id);
		}
		if (isLimit(mine, item)) {
			myLimits.push(item.id);
		}
	}
	return {
		groups,
		theirLimits,
		myLimits,
		overlap: [...overlap.entries()]
			.map(([categoryId, kinks]) => ({ categoryId, both: kinks.size }))
			.toSorted((a, b) => b.both - a.both)
	};
}

/**
 * Which halves a role-pair comparison put together, in words: "You giving,
 * them receiving". Empty for a kink without a pair. Worn-on-whom pairs read
 * better as where it ends up: my "on me" against their "on my partner" is
 * simply "On you".
 */
export function sidesLabel(key: ItemKey, mySide: 'a' | 'b' | null): string {
	const item = kinkById(key);
	const sides = item ? sidesOf(item) : null;
	if (!(item && sides && mySide)) {
		return '';
	}
	if (item.roles === 'self-partner') {
		return mySide === 'a' ? 'On you' : 'On them';
	}
	const [first, second] = sides;
	const mine = mySide === 'a' ? first : second;
	const theirs = mySide === 'a' ? second : first;
	return `You ${mine.toLowerCase()}, them ${theirs.toLowerCase()}`;
}
