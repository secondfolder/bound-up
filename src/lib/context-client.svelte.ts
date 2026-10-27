/**
 * The context in the browser: what each space is called and looks like, and
 * switching. See docs/contexts.md.
 *
 * Names come from `partnerName()` (AGENTS.md invariant 12), so a partner's
 * reads "…" until the vaults open, during SSR included, as names do
 * everywhere else.
 */

import { invalidate } from '$app/navigation';
import { type AppContext, CONTEXT_DEPENDENCY, serialiseContext } from './context';
import { initialsFor } from './initials';
import { partnerName } from './partner-names.svelte';
import { reportRequestFailure, tryFetch } from './request-failure.svelte';
import { spaceColourValue } from './space-colours';
import type { ContextSpaceView } from './types';

/** The words for the two contexts that are not a partner. */
export const SOLO_NAME = 'Me';
export const ALL_NAME = 'Everyone';

/** One person in an avatar: whose colour, and the initials drawn in it. */
export type AvatarPerson = { colour: string; initials: string };

/** A context as the switcher draws it. */
export type ContextShown = {
	/** `all`, or the space's id: the value the cookie takes. */
	key: string;
	context: AppContext;
	kind: 'all' | 'solo' | 'shared';
	name: string;
	/** A CSS colour: the wedge behind it, and its avatar's fill. */
	colour: string;
	/** Everyone's avatar is a slice per person; the others are one person. */
	people: AvatarPerson[];
};

/** How a space is shown: "Me" in amber, or the partner's name in the viewer's colour for them. */
export function shownSpace(space: ContextSpaceView): {
	name: string;
	colour: string;
	initials: string;
} {
	if (space.kind === 'solo' || !space.names) {
		return { name: SOLO_NAME, colour: spaceColourValue('me'), initials: '' };
	}
	const name = partnerName(space.names);
	return { name, colour: spaceColourValue(space.colour), initials: initialsFor(name) };
}

/**
 * Every context the switcher offers, in its order: Everyone, Me, then each
 * partner. `you` is the viewer's own name, for their slice of Everyone.
 */
export function shownContexts(spaces: readonly ContextSpaceView[], you: string): ContextShown[] {
	const each = spaces.map((space): ContextShown => {
		const shown = shownSpace(space);
		return {
			key: space.id,
			context: { kind: 'space', spaceId: space.id },
			kind: space.kind,
			name: shown.name,
			colour: shown.colour,
			people: [
				{
					colour: shown.colour,
					initials: space.kind === 'solo' ? initialsFor(you) : shown.initials
				}
			]
		};
	});
	const everyone: ContextShown = {
		key: 'all',
		context: { kind: 'all' },
		kind: 'all',
		name: ALL_NAME,
		colour: 'var(--accent-tint)',
		// You first, then each partner: the solo space comes first already.
		people: each.map((shown) => shown.people[0] ?? { colour: shown.colour, initials: '' })
	};
	return [everyone, ...each];
}

/**
 * Remembers a context on this device, without refreshing anything: for a
 * link into a list that is about to load in it anyway. False, with the
 * app-wide notice shown, when the server did not take it.
 */
export async function storeContext(context: AppContext): Promise<boolean> {
	const response = await tryFetch('/api/context', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ context: serialiseContext(context) })
	});
	if (!response?.ok) {
		reportRequestFailure(response);
		return false;
	}
	return true;
}

/**
 * Switches this device's context and re-runs every load that depends on it,
 * in place: same page, new filter. False when the server did not take it.
 */
export async function switchContext(context: AppContext): Promise<boolean> {
	if (!(await storeContext(context))) {
		return false;
	}
	await invalidate(CONTEXT_DEPENDENCY);
	return true;
}
