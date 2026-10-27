import { and, eq, or, sql } from 'drizzle-orm';
import {
	type AppContext,
	CONTEXT_COOKIE,
	CONTEXT_COOKIE_MAX_AGE,
	parseContext,
	serialiseContext,
	validContext
} from '../context';
import type { PartnerNamesSource } from '../partnership';
import { resolveSpaceColours, type SpaceColour } from '../space-colours';
import type { SpaceKind } from '../spaces';
import type { ContextSpaceView } from '../types';
import type { Db } from './db';
import { partnerships, spaceMembers, spaces } from './db/schema';

/**
 * The current context on the server: which spaces a viewer can switch
 * between, and which one the cookie names. See docs/contexts.md.
 *
 * Display only, like `features`. Every write names its space and is checked
 * against that, never against this: another tab can change the cookie at any
 * moment (docs/contexts.md, "Writes name their space").
 */

/** A space the viewer can switch to, with their own colour choice for it. */
export type ContextSpace = {
	spaceId: string;
	kind: SpaceKind;
	/** The viewer's own choice, or null for the default (`resolveSpaceColours`). */
	colour: SpaceColour | null;
};

/**
 * The spaces a viewer can switch between: their solo space first, then every
 * partnership they are in that has been accepted, oldest first — the bottom
 * nav's order. A pending invite's space has its inviter as a member, but
 * nothing in it to show, so it is left out.
 */
export async function listContextSpaces(db: Db, userId: string): Promise<ContextSpace[]> {
	return await db
		.select({ spaceId: spaces.id, kind: spaces.kind, colour: spaceMembers.colour })
		.from(spaceMembers)
		.innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
		.leftJoin(partnerships, eq(partnerships.id, spaces.id))
		.where(
			and(
				eq(spaceMembers.userId, userId),
				or(eq(spaces.kind, 'solo'), eq(partnerships.status, 'accepted'))
			)
		)
		.orderBy(sql`${spaces.kind} = 'shared'`, partnerships.createdAt, spaces.id);
}

type ContextCookies = {
	get: (name: string) => string | undefined;
	set: (name: string, value: string, options: { path: string } & Record<string, unknown>) => void;
	delete: (name: string, options: { path: string }) => void;
};

/**
 * `locals.context()` and `locals.contextSpaces()`: lazy, so a request that
 * never shows a context-dependent page never queries for one, and memoised,
 * so the layout and the page share one read.
 *
 * A cookie naming a space the viewer is not in — a partnership since ended,
 * someone else's id — is `all`, never a 404, because nobody asked for it:
 * it is ambient. Such a cookie is deleted on the way, so the browser's copy
 * agrees with what was rendered and the shell's visibility check does not
 * refresh the page for it every time the tab comes back.
 */
export function contextResolver(
	db: Db,
	userId: string | null,
	cookies: ContextCookies
): { context: () => Promise<AppContext>; contextSpaces: () => Promise<ContextSpace[]> } {
	let spacesRead: Promise<ContextSpace[]> | undefined;
	let contextRead: Promise<AppContext> | undefined;
	const contextSpaces = () => {
		spacesRead ??= userId ? listContextSpaces(db, userId) : Promise.resolve([]);
		return spacesRead;
	};
	const context = () => {
		contextRead ??= contextSpaces().then((list) => {
			const stored = cookies.get(CONTEXT_COOKIE);
			const named = parseContext(stored);
			const valid = validContext(
				named,
				list.map((space) => space.spaceId)
			);
			if (stored !== undefined && serialiseContext(valid) !== stored) {
				cookies.delete(CONTEXT_COOKIE, { path: '/' });
			}
			return valid;
		});
		return contextRead;
	};
	return { context, contextSpaces };
}

/**
 * Remembers a context on this device. Not httpOnly, deliberately: the shell
 * reads it when a tab comes back, to see whether another tab switched (see
 * `CONTEXT_COOKIE`).
 */
export function setContextCookie(cookies: ContextCookies, context: AppContext): void {
	cookies.set(CONTEXT_COOKIE, serialiseContext(context), {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		maxAge: CONTEXT_COOKIE_MAX_AGE
	});
}

/**
 * Sets how a space looks to `userId`, or back to the default with null.
 * Only their own membership row: the colour is theirs, not the space's. False
 * when they are not in the space.
 */
export async function setSpaceColour(
	db: Db,
	spaceId: string,
	userId: string,
	colour: SpaceColour | null
): Promise<boolean> {
	const updated = await db
		.update(spaceMembers)
		.set({ colour, updatedAt: new Date() })
		.where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
		.returning({ id: spaceMembers.id });
	return updated.length > 0;
}

/** The viewer's own colour choice for a space, or null for none (or not a member). */
export async function getSpaceColour(
	db: Db,
	spaceId: string,
	userId: string
): Promise<SpaceColour | null> {
	const [row] = await db
		.select({ colour: spaceMembers.colour })
		.from(spaceMembers)
		.where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
		.limit(1);
	return row?.colour ?? null;
}

/**
 * The switcher's view of the spaces: each shared one with the names its
 * partnership already hands the nav, and every one with the colour it shows
 * in. A shared space the nav has no partner for is left out, so the two can
 * never disagree about who is there.
 */
export function contextSpaceViews(
	list: readonly ContextSpace[],
	partners: readonly { id: string; names: PartnerNamesSource }[]
): ContextSpaceView[] {
	const shared = list.filter((space) => space.kind === 'shared');
	const colours = resolveSpaceColours(
		shared.map((space) => ({ id: space.spaceId, colour: space.colour }))
	);
	return list.flatMap((space): ContextSpaceView[] => {
		if (space.kind === 'solo') {
			return [{ id: space.spaceId, kind: 'solo', colour: 'me', names: null }];
		}
		const partner = partners.find((candidate) => candidate.id === space.spaceId);
		const colour = colours.get(space.spaceId);
		return partner && colour
			? [{ id: space.spaceId, kind: 'shared', colour, names: partner.names }]
			: [];
	});
}
