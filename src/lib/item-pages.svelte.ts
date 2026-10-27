/**
 * What the tasks and rewards pages share in the browser: which spaces they
 * show, as the switcher knows them, and the row of balances over each.
 *
 * Names come from `shownSpace` (`partnerName()`, AGENTS.md invariant 12), so
 * a partner's reads "…" until the vaults open.
 */

import { shownSpace } from './context-client.svelte';
import type { ItemTarget } from './item-target';
import type { BalanceView, ContextSpaceView, ItemSpaceView, PartnerView } from './types';

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

export type BalancePill = {
	key: string;
	label: string;
	credits: number;
	partner: { name: string; image: string | null } | null;
	editable: EditableCredits | null;
};

/**
 * The balances as a row of pills (`CreditBalances`), kept apart rather than
 * added up because each is spent on its own space's rewards. The viewer's own
 * is "Yours", or "With Jun" beside others; a partner's is their name, with
 * their picture. `editable` makes the ones the viewer may set editable through
 * the page's `?/setCredits`.
 */
export function balancePills(
	balances: readonly BalanceView[],
	contextSpaces: readonly ContextSpaceView[],
	partners: readonly PartnerView[],
	options: { editable: boolean }
): BalancePill[] {
	const several = new Set(balances.map((balance) => balance.spaceId)).size > 1;
	return balances.map((balance) => {
		const name = partnerIn(balance.spaceId, contextSpaces);
		const image = partners.find((partner) => partner.id === balance.spaceId)?.image ?? null;
		const pictured = name === null ? null : { name, image };
		let label = name ?? 'Theirs';
		if (balance.mine) {
			label = name && several ? `With ${name}` : 'Yours';
		}
		const whose = balance.mine ? 'your' : `${name ?? 'their'}'s`;
		return {
			key: `${balance.spaceId}|${balance.userId}`,
			label,
			credits: balance.credits,
			partner: balance.mine && !several ? null : pictured,
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
}
