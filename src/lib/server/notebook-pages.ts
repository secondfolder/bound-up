import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { type AppContext, CONTEXT_DEPENDENCY, spacesInContext } from '../context';
import { entryTopic, isEntryDate, type PartnerAccess, type SpaceForAccess } from '../notebook';
import { notebookCreateSchema, partnerAccessSchema } from '../schemas/notebook';
import { calendarDayKey } from '../timezone';
import type {
	DaydreamLibraryItemView,
	KinkListView,
	NotebookEntryView,
	SealedRefView
} from '../types';
import { readDaydreamConfig } from './daydream/config';
import { listLibrary } from './daydreams';
import { userHasFeature } from './features';
import { getKinkList, getPartnerKinkList } from './kink-lists';
import { createMediaStore } from './media/backend';
import {
	createEntry,
	deleteEntry,
	type EntryContext,
	entrySpaceId,
	getEntryContext,
	liftHiddenEntry,
	listEntries,
	mayMoveEntry,
	type NotebookScope,
	type ResolvedScope,
	resolveScope,
	scopeForSpace,
	setPartnerAccess
} from './notebook';
import { publishEntryFrame, publishListChange } from './notebook-live';
import { createNotifier } from './realtime/backend';
import { type RoomKey, spaceRoom, userRoom } from './realtime/index';
import { getScenePreferences, type ScenePreferencesView } from './scene-preferences';
import { hasAcceptedSceneHelp } from './scenes/help';
import { sealedRef } from './sealed-content';
import { requireSpaceMember } from './spaces';

/**
 * The loads and actions behind the notebook's pages: `/notebook`, an entry,
 * and a scene's menu. See docs/notebook.md.
 *
 * The list follows the current context (docs/contexts.md): one space, or
 * every space the viewer is in. Nothing else does. An entry takes its space
 * from the entry, and every action names the space it writes to in its form
 * and checks membership of that space — never the context, which another
 * tab can change at any moment.
 *
 * Every one of them resolves the scope and the entry from the database for
 * itself: an action runs before any load, so a check that lived in a layout
 * would gate nothing (AGENTS.md, "Adding a route").
 */

type Event = {
	locals: App.Locals;
	params: Record<string, string>;
	platform?: App.Platform | undefined;
	request: Request;
	depends: (...deps: `${string}:${string}`[]) => void;
};

type ActionEvent = Omit<Event, 'depends'>;

function requireUser(locals: App.Locals): NonNullable<App.Locals['user']> {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	return locals.user;
}

/** The invalidation key a scope's lists and cards share. */
export function notebookDependency(scope: NotebookScope): `notebook:${string}` {
	return scope.kind === 'self' ? 'notebook:self' : `notebook:${scope.partnershipId}`;
}

/** What an Everyone list depends on, beside each of its spaces' own keys. */
export const NOTEBOOK_ALL_DEPENDENCY = 'notebook:all';

/** The notebook's list. One route for every context: the context decides what it shows. */
export const NOTEBOOK_PATH = '/notebook';

/** Where an entry lives. Its space is the entry's own, so it needs none in the path. */
export function entryPath(entryId: string): string {
	return `${NOTEBOOK_PATH}/${entryId}`;
}

export type NotebookListData = {
	journal: NotebookEntryView[];
	notes: NotebookEntryView[];
	scenes: NotebookEntryView[];
	/**
	 * The room the list watches, so it updates live: its space's, for a list
	 * of one, or the viewer's own (`user:<id>`) for an Everyone list of
	 * several (docs/notebook.md, "The list in every context").
	 */
	room: RoomKey;
	/** The spaces the list shows, in the switcher's order: one, unless the context is Everyone. */
	spaceIds: string[];
	/** The key to invalidate when the list changes elsewhere. */
	dependency: string;
	/**
	 * The context this list was read in. Returned by the page as well as the
	 * app layout, and the page's wins: a client-side navigation re-runs the
	 * page's load but not the layout's, whose context could then be one the
	 * cookie no longer names, and the switcher must say what the list shows.
	 */
	context: AppContext;
	viewerId: string;
	/** Today in the viewer's timezone, for a new journal entry's date. */
	today: string;
};

/**
 * The partner in a shared entry's space: the first member who is not the
 * viewer, which in a space of two is the other one. Null for a solo entry.
 * Pair-shaped on purpose, like the scene's surprises it is for
 * (docs/spaces.md, "Still pair-shaped").
 */
function otherMember(space: SpaceForAccess | null, userId: string): string | null {
	return space?.members.find((member) => member.userId !== userId)?.userId ?? null;
}

/**
 * The list, in the current context. The context only filters: it is checked
 * against the viewer's spaces when it is read (`locals.context()`), and each
 * space it names is resolved here as its own list would resolve it.
 */
export async function loadNotebookList(
	event: Pick<Event, 'locals' | 'depends'>
): Promise<NotebookListData> {
	const user = requireUser(event.locals);
	event.depends(CONTEXT_DEPENDENCY);
	const { db } = event.locals;
	const [context, spaces] = await Promise.all([
		event.locals.context(),
		event.locals.contextSpaces()
	]);
	const shown = spacesInContext(
		context,
		spaces.map((space) => ({ ...space, id: space.spaceId }))
	);
	const resolved = (
		await Promise.all(shown.map((space) => resolveScope(db, scopeForSpace(space), user.id)))
	).filter((scope): scope is ResolvedScope => scope !== null);
	for (const scope of resolved) {
		event.depends(notebookDependency(scope.scope));
	}
	const [single] = resolved;
	const dependency =
		resolved.length === 1 && single ? notebookDependency(single.scope) : NOTEBOOK_ALL_DEPENDENCY;
	event.depends(dependency);
	const [journal, notes, scenes] = await Promise.all([
		listEntries(db, resolved, user.id, 'journal'),
		listEntries(db, resolved, user.id, 'note'),
		listEntries(db, resolved, user.id, 'scene')
	]);
	return {
		journal,
		notes,
		scenes,
		// A list of one space watches that space's room; an Everyone list
		// watches the viewer's own room, where every space they are in fans its
		// list events out (docs/realtime.md, "Everyone"): one stream, however
		// many partnerships.
		room: resolved.length === 1 && single ? single.room : userRoom(user.id),
		spaceIds: resolved.map((scope) => scope.spaceId),
		dependency,
		context,
		viewerId: user.id,
		today: calendarDayKey(user.timezone, new Date())
	};
}

/**
 * The scope of the space a form names, if the viewer is in it. A write names
 * its space rather than reading the context (docs/contexts.md), and this is
 * the membership check behind that.
 */
async function namedScope(
	locals: App.Locals,
	userId: string,
	spaceId: string
): Promise<ResolvedScope | null> {
	const membership = await requireSpaceMember(locals.db, spaceId, userId);
	return membership ? await resolveScope(locals.db, scopeForSpace(membership), userId) : null;
}

/**
 * Creates an entry from the sealed header and first edit the page posted in
 * place of anything typed (`NewEntryForm`), in the space the form names, then
 * opens it.
 */
export async function createEntryAction(event: ActionEvent) {
	const user = requireUser(event.locals);
	const form = await event.request.formData();
	let body: unknown;
	try {
		body = JSON.parse(String(form.get('entry') ?? ''));
	} catch {
		body = null;
	}
	const parsed = notebookCreateSchema.safeParse(body);
	if (!parsed.success) {
		return fail(400, { error: 'That entry could not be created. Reload the page and try again.' });
	}
	const { entryDate, kind, ...input } = parsed.data;
	if (kind === 'journal' && !isEntryDate(entryDate)) {
		return fail(400, { error: 'Please choose a date for this journal entry.' });
	}
	const resolved = await namedScope(event.locals, user.id, String(form.get('spaceId') ?? ''));
	if (!resolved) {
		error(404, 'Not found');
	}
	const result = await createEntry(event.locals.db, resolved, user.id, {
		...input,
		kind,
		entryDate: kind === 'journal' ? entryDate : null
	});
	if (!result.ok) {
		return fail(result.reason === 'exists' ? 409 : 400, {
			error:
				result.reason === 'wrong-vault'
					? 'This device’s keys are out of date. Reload the page and try again.'
					: 'That entry could not be created. Reload the page and try again.'
		});
	}
	await publishListChange(await createNotifier(event), event.locals.db, resolved.spaceId);
	redirect(303, entryPath(input.id));
}

/**
 * Shows an entry hidden from the viewer again, once control has moved to
 * them from whoever hid it. See `canSetAccess`. The form names the entry's
 * space; `liftHiddenEntry` checks the entry is in it and the viewer is too.
 */
export async function showHiddenEntryAction(event: ActionEvent) {
	const user = requireUser(event.locals);
	const form = await event.request.formData();
	const entryId = String(form.get('entryId') ?? '');
	const spaceId = String(form.get('spaceId') ?? '');
	const result = await liftHiddenEntry(event.locals.db, entryId, user.id, spaceId);
	if (!result.ok) {
		error(404, 'Not found');
	}
	const notifier = await createNotifier(event);
	await publishListChange(notifier, event.locals.db, spaceId);
	await publishEntryFrame(notifier, spaceRoom(spaceId), entryId, { type: 'access' });
	return { shown: true };
}

/** The space an entry is in, as its page needs to show whose it is and seal into it. */
export type EntrySpaceView = {
	id: string;
	kind: 'solo' | 'shared';
	/** The partnership a shared entry is in, whose vault seals it; null for your own. */
	partnershipId: string | null;
};

function entrySpace(context: EntryContext): EntrySpaceView {
	const { partnershipId } = context.entry;
	return {
		id: entrySpaceId(context.entry),
		kind: partnershipId ? 'shared' : 'solo',
		partnershipId
	};
}

export type NotebookEntryData = {
	entry: {
		id: string;
		kind: NotebookEntryView['kind'];
		entryDate: string | null;
		vaultId: string;
		revision: number;
		header: SealedRefView | null;
		createdByUserId: string | null;
		canWrite: boolean;
		canSetAccess: boolean;
		/** Whether the viewer may move it to another of their spaces (`mayMoveEntry`). */
		canMove: boolean;
		partnerAccess: PartnerAccess;
		/** Whether the restriction, if any, is one the viewer set. */
		restrictedByViewer: boolean;
	};
	/** The entry's own space, whatever the current context is. */
	space: EntrySpaceView;
	room: RoomKey;
	viewerId: string;
	/** A scene's extras; null for a journal entry or a note. */
	scene: {
		preferences: ScenePreferencesView | null;
		/** Who a block can be hidden from; null in a solo scene. */
		partnerId: string | null;
		partnershipId: string | null;
		/**
		 * The kink lists the column's "What you're into" reads, all sealed: your
		 * own, and in a shared scene your copy for the partner and theirs for
		 * you, which only exist once each of you has shared. See docs/scenes.md.
		 */
		kinkLists: {
			own: KinkListView | null;
			mineForPartner: KinkListView | null;
			theirs: KinkListView | null;
		};
		/** The viewer's daydream characters, to play as; empty without Daydreams. */
		characters: DaydreamLibraryItemView[];
		/**
		 * Whether the server has a model to ask for help (none means no help
		 * buttons at all), and whether this person has agreed to what that
		 * sends.
		 */
		help: { available: boolean; accepted: boolean };
	} | null;
};

async function sceneExtras(
	event: Pick<Event, 'locals' | 'platform'>,
	userId: string,
	context: NonNullable<Awaited<ReturnType<typeof getEntryContext>>>
): Promise<NonNullable<NotebookEntryData['scene']>> {
	const { db } = event.locals;
	const { partnershipId } = context.entry;
	const available = readDaydreamConfig(event.locals.settings, event.platform) !== null;
	const [preferences, own, mineForPartner, theirs, characters, accepted] = await Promise.all([
		getScenePreferences(db, userId),
		getKinkList(db, userId, 'self'),
		partnershipId ? getKinkList(db, userId, { partnershipId }) : null,
		partnershipId ? getPartnerKinkList(db, userId, partnershipId) : null,
		// The library is a Daydreams thing; without the feature there is none.
		userHasFeature(db, userId, 'daydreams').then((has) =>
			has ? listLibrary(db, userId, 'characters') : []
		),
		available ? hasAcceptedSceneHelp(db, userId) : false
	]);
	return {
		preferences,
		partnerId: otherMember(context.partnership, userId),
		partnershipId,
		kinkLists: { own, mineForPartner, theirs: theirs?.ok ? theirs.list : null },
		characters,
		help: { available, accepted }
	};
}

/**
 * One entry, in its own space: opened while the context is something else,
 * it shows as the entry it is, and the context is left alone.
 */
export async function loadNotebookEntry(
	event: Pick<Event, 'locals' | 'params' | 'depends'>
): Promise<NotebookEntryData> {
	const user = requireUser(event.locals);
	const { entryId } = event.params;
	event.depends(`notebook:entry:${entryId}`);
	const context = await getEntryContext(event.locals.db, entryId, user.id);
	if (!context) {
		error(404, 'Not found');
	}
	return {
		entry: entryView(context, user.id),
		space: entrySpace(context),
		room: context.room,
		viewerId: user.id,
		scene: context.entry.kind === 'scene' ? await sceneExtras(event, user.id, context) : null
	};
}

function entryView(
	context: NonNullable<Awaited<ReturnType<typeof getEntryContext>>>,
	userId: string
): NotebookEntryData['entry'] {
	const { entry } = context;
	return {
		id: entry.id,
		kind: entry.kind,
		entryDate: entry.entryDate,
		vaultId: entry.vaultId,
		revision: entry.revision,
		header: sealedRef(entry.id, entry),
		createdByUserId: entry.createdByUserId,
		canWrite: context.access === 'edit',
		canSetAccess: context.canSetAccess,
		canMove: mayMoveEntry(context, userId),
		partnerAccess: entry.partnerAccess,
		restrictedByViewer: entry.accessSetByUserId === userId
	};
}

/**
 * A scene menu's own page (docs/scenes.md, "A menu's own page"): the scene
 * entry, on the entry's own access, without what the scene's prompt column
 * needs. Whether the menu is in it is for the browser to say: the server
 * cannot read the scene.
 */
export async function loadSceneMenu(
	event: Pick<Event, 'locals' | 'params' | 'depends'>
): Promise<Omit<NotebookEntryData, 'scene'> & { menuId: string; partnerId: string | null }> {
	const user = requireUser(event.locals);
	const { entryId, menuId } = event.params;
	event.depends(`notebook:entry:${entryId}`);
	const context = await getEntryContext(event.locals.db, entryId, user.id);
	if (!(context && context.entry.kind === 'scene' && menuId)) {
		error(404, 'Not found');
	}
	return {
		entry: entryView(context, user.id),
		space: entrySpace(context),
		room: context.room,
		viewerId: user.id,
		menuId,
		// Who a line can be made a surprise for, from the selection's toolbar.
		partnerId: otherMember(context.partnership, user.id)
	};
}

/**
 * Who else may see or edit a partnership entry. Re-checks control against
 * the stored rows (invariant 14), then makes an open page follow: a member
 * who may no longer read it is dropped from the entry's stream, and every
 * open copy is told to reload what it may do.
 */
export async function setAccessAction(event: ActionEvent) {
	const user = requireUser(event.locals);
	const form = await superValidate(event.request, zod4(partnerAccessSchema));
	if (!form.valid) {
		return fail(400, { form });
	}
	const context = await getEntryContext(event.locals.db, event.params.entryId, user.id);
	if (!context?.partnership) {
		error(404, 'Not found');
	}
	const access = form.data.access as PartnerAccess;
	const result = await setPartnerAccess(event.locals.db, context, user.id, access);
	if (!result.ok) {
		error(403, 'Only whoever holds control of this partnership can change that.');
	}
	const notifier = await createNotifier(event);
	// Told before evicted: the frame is queued ahead of the close, so the
	// partner's open page hears it and leaves at once, rather than only finding
	// out after its reconnects have been refused and it has fallen back to
	// polling. Hidden is from every member but the one who hid it.
	await publishEntryFrame(notifier, context.room, context.entry.id, { type: 'access' });
	if (access === 'hidden') {
		for (const member of context.partnership.members) {
			if (member.userId !== user.id) {
				await notifier.evict(context.room, {
					userId: member.userId,
					topic: entryTopic(context.entry.id)
				});
			}
		}
	}
	await publishListChange(notifier, event.locals.db, entrySpaceId(context.entry));
	return { form };
}

export async function deleteEntryAction(event: ActionEvent) {
	const user = requireUser(event.locals);
	const context = await getEntryContext(event.locals.db, event.params.entryId, user.id);
	if (!context) {
		error(404, 'Not found');
	}
	const result = await deleteEntry(event.locals.db, await createMediaStore(event), context);
	if (!result.ok) {
		error(403, 'You can only read this entry, so you cannot delete it.');
	}
	if (result.purgeFailed) {
		// Reported, not thrown: the entry is gone, and an unreadable leftover is
		// a much smaller problem than a delete that seems to fail. See
		// `deleteEntry`.
		console.error('[notebook] an entry’s versions could not all be removed from storage', {
			entryId: context.entry.id
		});
	}
	const notifier = await createNotifier(event);
	await publishEntryFrame(notifier, context.room, context.entry.id, { type: 'deleted' });
	await publishListChange(notifier, event.locals.db, entrySpaceId(context.entry));
	redirect(303, NOTEBOOK_PATH);
}
