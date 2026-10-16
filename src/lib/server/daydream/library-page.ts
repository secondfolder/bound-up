import { error } from '@sveltejs/kit';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { hasAcceptedDisclosure, type LibraryKind, listLibrary } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';

/**
 * The load behind `/daydreams/characters` and `/daydreams/scenes`, which differ
 * only in which library they list. Edits and deletions go through the JSON
 * endpoints (`library-routes.ts`), from the same dialogs the setup form uses.
 */
export async function loadLibraryPage(
	event: { locals: App.Locals; platform?: App.Platform },
	kind: LibraryKind
) {
	const { db, user } = event.locals;
	if (!user) {
		error(401, 'Not signed in');
	}
	await requireFeature(db, user.id, 'daydreams');
	const [items, accepted] = await Promise.all([
		listLibrary(db, user.id, kind),
		hasAcceptedDisclosure(db, user.id)
	]);
	return { items, accepted, available: readDaydreamConfig(event.platform) !== null };
}
