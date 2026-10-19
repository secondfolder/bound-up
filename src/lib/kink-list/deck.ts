import {
	type Filters,
	filtersOf,
	type ItemKey,
	isAnswered,
	isPositive,
	isShown,
	type Level,
	type ListPayload
} from './answers';
import { catalog, categories, childrenOf, type KinkItem, kinkById } from './catalog';

/**
 * Quick fill's deck: which kinks to show, in what order, and what to review
 * at the end. Pure, and worked out from the list itself every time, so there
 * is no deck position to store or to lose: answering a card is what moves the
 * deck on, and undoing it brings the card back. See docs/kink-list.md,
 * "Quick fill".
 */

/** Whether a category is in the deck: not skipped, and not answered wholesale as a hard limit. */
export function isInDeck(list: ListPayload, categoryId: string): boolean {
	const triage = list.triage[categoryId]?.value;
	return triage !== 'skip' && triage !== 'limit';
}

function skipped(list: ListPayload, key: ItemKey): boolean {
	return list.skipped[key]?.skipped === true;
}

/** Whether any side of a kink's own answer is a yes of some kind. */
function saidYes(list: ListPayload, key: ItemKey): boolean {
	const answer = list.answers[key];
	return (
		isPositive(answer?.level) ||
		isPositive(answer?.sides?.a?.level) ||
		isPositive(answer?.sides?.b?.level)
	);
}

/**
 * The cards still to go, in order: each included category's kinks in
 * catalogue order, then the person's own kinks in it.
 *
 * **Drill down only after yes.** A kink's specifics are dealt in straight
 * after it, but only once it has been answered with a yes of some kind. After
 * a no, or Don't mind, they are not asked: whoever does not want spanking
 * has no use for a card about paddles. They stay unanswered on the list.
 *
 * `filters` are the list's own unless a partner's view has its own side.
 */
export function deckCards(list: ListPayload, filters: Filters = filtersOf(list)): ItemKey[] {
	const cards: ItemKey[] = [];
	for (const category of categories()) {
		if (!isInDeck(list, category.id)) {
			continue;
		}
		for (const kink of childrenOf(category.id)) {
			if (!isShown(kink, filters)) {
				continue;
			}
			if (!(isAnswered(list.answers[kink.id]) || skipped(list, kink.id))) {
				cards.push(kink.id);
				continue;
			}
			if (!saidYes(list, kink.id)) {
				continue;
			}
			for (const specific of childrenOf(kink.id)) {
				if (
					isShown(specific, filters) &&
					!isAnswered(list.answers[specific.id]) &&
					!skipped(list, specific.id)
				) {
					cards.push(specific.id);
				}
			}
		}
		for (const [key, kink] of Object.entries(list.custom)) {
			if (
				!kink.removed &&
				kink.categoryId === category.id &&
				!isAnswered(list.answers[key]) &&
				!skipped(list, key)
			) {
				cards.push(key);
			}
		}
	}
	return cards;
}

/** What the review at the end of the deck lists. */
export type DeckReview = {
	/** Kinks answered as a hard limit, on either side. */
	limits: ItemKey[];
	/**
	 * Categories answered wholesale with "Hard limit everything here": one
	 * line each, rather than every kink in them.
	 */
	limitCategories: string[];
	/** Conditional answers, with their notes, since the conditions are the point. */
	conditional: ItemKey[];
	/** Cards skipped and still unanswered, to go back to. */
	skipped: ItemKey[];
};

function isLiveCustom(list: ListPayload, key: ItemKey): boolean {
	const kink = list.custom[key];
	return kink !== undefined && !kink.removed;
}

const ORDER = new Map(catalog.items.map((item, index) => [item.id, index]));

function catalogOrder(key: ItemKey): number {
	return ORDER.get(key) ?? Number.MAX_SAFE_INTEGER;
}

function hasLevel(list: ListPayload, key: ItemKey, level: Level): boolean {
	const answer = list.answers[key];
	return (
		answer?.level === level ||
		answer?.sides?.a?.level === level ||
		answer?.sides?.b?.level === level
	);
}

export function deckReview(list: ListPayload): DeckReview {
	// Catalogue order, then the person's own kinks, so the review reads like the list.
	const answered = Object.keys(list.answers)
		.filter((key) => kinkById(key) !== undefined || isLiveCustom(list, key))
		.toSorted((x, y) => catalogOrder(x) - catalogOrder(y));
	return {
		limits: answered.filter((key) => hasLevel(list, key, 'limit')),
		limitCategories: categories()
			.filter((category) => list.triage[category.id]?.value === 'limit')
			.map((category) => category.id),
		conditional: answered.filter((key) => hasLevel(list, key, 'conditional')),
		skipped: Object.entries(list.skipped)
			.filter(([key, entry]) => entry.skipped && !isAnswered(list.answers[key]))
			.map(([key]) => key)
	};
}

/** "Specifically" for a third-level card, with the kink it narrows down. */
export function narrows(key: ItemKey): KinkItem | undefined {
	const item = kinkById(key);
	const parent = item?.parent ? kinkById(item.parent) : undefined;
	return parent?.parent ? parent : undefined;
}
