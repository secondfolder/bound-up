/**
 * The context in the browser: what each space is called and looks like, and
 * switching. See docs/contexts.md.
 *
 * Names come from `partnerName()` (AGENTS.md invariant 12), so a partner's
 * reads "…" until the vaults open, during SSR included, as names do
 * everywhere else.
 */

import type { Attachment } from 'svelte/attachments';
import { goto, invalidate } from '$app/navigation';
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

/**
 * Follows a card's link into a list in the card's own context: remembers that
 * context, then goes to the list, which loads in it. The list then shows what
 * the card previewed — a deliberate choice of that context, not a silent
 * switch. A click that opens elsewhere (a new tab, a modifier) is left alone,
 * and shows the context as it is. See docs/contexts.md.
 *
 * `href` is resolved by the caller.
 */
export async function followInContext(
	event: MouseEvent,
	context: AppContext,
	href: string
): Promise<void> {
	const opensElsewhere =
		event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
	if (opensElsewhere) {
		return;
	}
	event.preventDefault();
	// Followed even if the switch failed (the notice says so): the list then
	// shows the context as it was, which is still the list.
	await storeContext(context);
	// The app layout's context too: a navigation re-runs it only when
	// something it depends on was invalidated, and the cookie is not that.
	// biome-ignore lint/plugin: `href` arrives resolved; see above.
	await goto(href, { invalidate: [CONTEXT_DEPENDENCY] });
}

/**
 * `followInContext` for a plain link: `{@attach inContext(context)}`, with
 * `data-sveltekit-preload-data="off"` beside it, since a preload would fetch
 * the list in the context as it was. The link's own `href`, resolved by its
 * page, is where it goes.
 *
 * A listener on the link itself rather than an `onclick=`: Svelte delegates
 * that to the root, where SvelteKit's router also listens for link clicks,
 * so which ran first was down to registration order (as `SectionWidget`'s
 * `onfollow`).
 */
export function inContext(context: AppContext): Attachment<HTMLAnchorElement> {
	return (link) => {
		const follow = (event: MouseEvent) => {
			const href = link.getAttribute('href');
			if (href) {
				void followInContext(event, context, href);
			}
		};
		link.addEventListener('click', follow);
		return () => link.removeEventListener('click', follow);
	};
}
