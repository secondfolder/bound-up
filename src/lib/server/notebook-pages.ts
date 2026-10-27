import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { entryTopic, isEntryDate, type PartnerAccess } from '../notebook';
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
	getEntryContext,
	liftHiddenEntry,
	listEntries,
	type NotebookScope,
	resolveScope,
	setPartnerAccess
} from './notebook';
import { publishEntryFrame, publishListChange } from './notebook-live';
import { createNotifier } from './realtime/backend';
import type { RoomKey } from './realtime/index';
import { getScenePreferences, type ScenePreferencesView } from './scene-preferences';
import { hasAcceptedSceneHelp } from './scenes/help';
import { sealedRef } from './sealed-content';

/**
 * The loads and actions behind the notebook's pages, shared by the solo
 * notebook (`/home/notebook`) and each partnership's (`/partner/[id]/notebook`),
 * which differ only in their scope. See docs/notebook.md.
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

/** Where a scope's notebook lives. */
export function notebookPath(scope: NotebookScope): string {
	return scope.kind === 'self' ? '/home/notebook' : `/partner/${scope.partnershipId}/notebook`;
}

export type NotebookListData = {
	journal: NotebookEntryView[];
	notes: NotebookEntryView[];
	scenes: NotebookEntryView[];
	room: RoomKey;
	viewerId: string;
	/** Today in the viewer's timezone, for a new journal entry's date. */
	today: string;
};

/** The other member of a partnership entry's partnership; null for a solo entry. */
function otherMember(
	partnership: { inviterId: string; inviteeId: string | null } | null,
	userId: string
): string | null {
	if (!partnership) {
		return null;
	}
	return partnership.inviterId === userId ? partnership.inviteeId : partnership.inviterId;
}

export async function loadNotebookList(
	event: Pick<Event, 'locals' | 'depends'>,
	scope: NotebookScope
): Promise<NotebookListData> {
	const user = requireUser(event.locals);
	const resolved = await resolveScope(event.locals.db, scope, user.id);
	if (!resolved) {
		error(404, 'Partner not found');
	}
	event.depends(notebookDependency(scope));
	const [journal, notes, scenes] = await Promise.all([
		listEntries(event.locals.db, resolved, user.id, 'journal'),
		listEntries(event.locals.db, resolved, user.id, 'note'),
		listEntries(event.locals.db, resolved, user.id, 'scene')
	]);
	return {
		journal,
		notes,
		scenes,
		room: resolved.room,
		viewerId: user.id,
		today: calendarDayKey(user.timezone, new Date())
	};
}

/**
 * Creates an entry from the sealed header and first edit the page posted in
 * place of anything typed (`NewEntryForm`), then opens it.
 */
export async function createEntryAction(event: ActionEvent, scope: NotebookScope) {
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
	const resolved = await resolveScope(event.locals.db, scope, user.id);
	if (!resolved) {
		error(404, 'Partner not found');
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
	await publishListChange(await createNotifier(event), resolved.room);
	redirect(303, `${notebookPath(scope)}/${input.id}`);
}

/**
 * Shows an entry hidden from the viewer again, once control has moved to
 * them from whoever hid it. See `canSetAccess`.
 */
export async function showHiddenEntryAction(event: ActionEvent, scope: NotebookScope) {
	const user = requireUser(event.locals);
	if (scope.kind !== 'partnership') {
		error(404, 'Not found');
	}
	const form = await event.request.formData();
	const entryId = String(form.get('entryId') ?? '');
	const result = await liftHiddenEntry(event.locals.db, entryId, user.id, scope.partnershipId);
	if (!result.ok) {
		error(404, 'Not found');
	}
	const notifier = await createNotifier(event);
	const resolved = await resolveScope(event.locals.db, scope, user.id);
	if (resolved) {
		await publishListChange(notifier, resolved.room);
		await publishEntryFrame(notifier, resolved.room, entryId, { type: 'access' });
	}
	return { shown: true };
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
		partnerAccess: PartnerAccess;
		/** Whether the restriction, if any, is one the viewer set. */
		restrictedByViewer: boolean;
	};
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

export async function loadNotebookEntry(
	event: Pick<Event, 'locals' | 'params' | 'depends'>,
	scope: NotebookScope
): Promise<NotebookEntryData> {
	const user = requireUser(event.locals);
	const { entryId } = event.params;
	event.depends(`notebook:entry:${entryId}`);
	const context = await getEntryContext(event.locals.db, entryId, user.id, scope);
	if (!context) {
		error(404, 'Not found');
	}
	return {
		entry: entryView(context, user.id),
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
	event: Pick<Event, 'locals' | 'params' | 'depends'>,
	scope: NotebookScope
): Promise<Omit<NotebookEntryData, 'scene'> & { menuId: string; partnerId: string | null }> {
	const user = requireUser(event.locals);
	const { entryId, menuId } = event.params;
	event.depends(`notebook:entry:${entryId}`);
	const context = await getEntryContext(event.locals.db, entryId, user.id, scope);
	if (!(context && context.entry.kind === 'scene' && menuId)) {
		error(404, 'Not found');
	}
	return {
		entry: entryView(context, user.id),
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
export async function setAccessAction(event: ActionEvent, scope: NotebookScope) {
	const user = requireUser(event.locals);
	const form = await superValidate(event.request, zod4(partnerAccessSchema));
	if (!form.valid) {
		return fail(400, { form });
	}
	const context = await getEntryContext(event.locals.db, event.params.entryId, user.id, scope);
	if (!context?.partnership) {
		error(404, 'Not found');
	}
	const access = form.data.access as PartnerAccess;
	const result = await setPartnerAccess(event.locals.db, context, user.id, access);
	if (!result.ok) {
		error(403, 'Only whoever holds control of this partnership can change that.');
	}
	const notifier = await createNotifier(event);
	const { partnership } = context;
	const other = partnership.inviterId === user.id ? partnership.inviteeId : partnership.inviterId;
	// Told before evicted: the frame is queued ahead of the close, so the
	// partner's open page hears it and leaves at once, rather than only finding
	// out after its reconnects have been refused and it has fallen back to
	// polling.
	await publishEntryFrame(notifier, context.room, context.entry.id, { type: 'access' });
	if (access === 'hidden' && other) {
		await notifier.evict(context.room, { userId: other, topic: entryTopic(context.entry.id) });
	}
	await publishListChange(notifier, context.room);
	return { form };
}

export async function deleteEntryAction(event: ActionEvent, scope: NotebookScope) {
	const user = requireUser(event.locals);
	const context = await getEntryContext(event.locals.db, event.params.entryId, user.id, scope);
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
	await publishListChange(notifier, context.room);
	redirect(303, notebookPath(scope));
}
