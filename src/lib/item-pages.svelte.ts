/**
 * What the tasks and rewards pages share in the browser: which spaces they
 * show, as the switcher knows them, and the balances they pay into.
 *
 * Names come from `shownSpace` (`partnerName()`, AGENTS.md invariant 12), so
 * a partner's reads "…" until the vaults open.
 */

import { type AvatarPerson, SOLO_NAME, shownContexts, shownSpace } from './context-client.svelte';
import type { ItemTarget } from './item-target';
import type { BalanceView, ContextSpaceView, ItemSpaceView } from './types';

/** The spaces a page shows, as the switcher knows them, in the page's order. */
export function shownSpaces(
	spaces: readonly ItemSpaceView[],
	contextSpaces: readonly ContextSpaceView[]
): ContextSpaceView[] {
	return spaces.flatMap((space) => {
		const known = contextSpaces.find((candidate) => candidate.id === space.id);
		return known ? [known] : [];
	});
}

/** What the viewer calls whoever else is in a space; null for their own. */
export function partnerIn(
	spaceId: string,
	contextSpaces: readonly ContextSpaceView[]
): string | null {
	const space = contextSpaces.find((candidate) => candidate.id === spaceId);
	return space?.kind === 'shared' ? shownSpace(space).name : null;
}

/**
 * Where a new task or reward could go from a page: each shown space the
 * viewer may set things in, with whoever else is there.
 */
export function itemTargets(
	spaces: readonly ItemSpaceView[],
	contextSpaces: readonly ContextSpaceView[]
): ItemTarget[] {
	return spaces.flatMap((space): ItemTarget[] => {
		if (!space.canManage) {
			return [];
		}
		if (space.kind === 'solo') {
			return [{ spaceId: space.id, kind: 'solo', partner: null }];
		}
		const known = contextSpaces.find((candidate) => candidate.id === space.id);
		const [other] = space.others;
		return known?.names && other
			? [{ spaceId: space.id, kind: 'shared', partner: { ...other, names: known.names } }]
			: [];
	});
}

type EditableCredits = {
	action: string;
	inputLabel: string;
	editLabel: string;
	saveLabel: string;
	cancelLabel: string;
	targetUserId: string;
	spaceId: string;
};

/** One balance in a space: the viewer's own ("You") or a partner's. */
export type CreditEntry = {
	key: string;
	/** "You", or the partner's name. */
	who: string;
	mine: boolean;
	credits: number;
	/** How it is set from the page, where the viewer may; null otherwise. */
	editable: EditableCredits | null;
};

/** A space's balances, as the credits control and its sheet show them. */
export type CreditGroup = {
	spaceId: string;
	kind: 'solo' | 'shared';
	/** "Me", or the partner's name. */
	name: string;
	colour: string;
	people: AvatarPerson[];
	/** The viewer's own first, then the partner's: one or two, by who has control. */
	entries: CreditEntry[];
};

/**
 * The balances a page's items pay into, grouped by space in the switcher's
 * order: a group per space that has any, the viewer's own balance first and
 * the partner's after it. A partnership has one or both, by its control:
 * the viewer's where they act, their partner's where they manage them. Never
 * added together, because each is spent on its own space's rewards
 * (docs/rewards.md, "Credits"). `editable` makes the ones the viewer may set
 * editable through the page's `?/setCredits`.
 */
export function creditGroups(
	balances: readonly BalanceView[],
	contextSpaces: readonly ContextSpaceView[],
	you: string,
	options: { editable: boolean }
): CreditGroup[] {
	const shown = shownContexts(contextSpaces, you);
	return contextSpaces.flatMap((space): CreditGroup[] => {
		const own = balances.filter((balance) => balance.spaceId === space.id);
		if (own.length === 0) {
			return [];
		}
		const context = shown.find((candidate) => candidate.key === space.id);
		const partner = space.kind === 'shared' ? shownSpace(space).name : null;
		const entries = [...own]
			.sort((a, b) => Number(b.mine) - Number(a.mine))
			.map((balance): CreditEntry => {
				const whose = balance.mine ? 'your' : `${partner ?? 'their'}'s`;
				return {
					key: `${balance.spaceId}|${balance.userId}`,
					who: balance.mine ? 'You' : (partner ?? 'Theirs'),
					mine: balance.mine,
					credits: balance.credits,
					editable:
						options.editable && balance.canSet
							? {
									action: '?/setCredits',
									inputLabel: `Set ${whose} reward credits`,
									editLabel: `Edit ${whose} reward credits`,
									saveLabel: `Save ${whose} reward credits`,
									cancelLabel: 'Cancel editing reward credits',
									targetUserId: balance.userId,
									spaceId: balance.spaceId
								}
							: null
				};
			});
		return [
			{
				spaceId: space.id,
				kind: space.kind,
				name: context?.name ?? partner ?? SOLO_NAME,
				colour: context?.colour ?? 'var(--accent-tint)',
				people: context?.people ?? [],
				entries
			}
		];
	});
}
