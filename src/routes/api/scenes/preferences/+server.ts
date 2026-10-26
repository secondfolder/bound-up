import { error, json, type RequestHandler } from '@sveltejs/kit';
import { scenePreferencesSaveSchema } from '$lib/schemas/scenePreferencesForm';
import { getScenePreferences, saveScenePreferences } from '$lib/server/scene-preferences';

/**
 * A person's own scene designer settings, sealed. `GET` is what a device
 * fetches after losing a save race, to merge into; a scene's page gets them
 * from its own load. The `api/` routes sit outside the route groups, so each
 * checks the session itself.
 */

function signedIn(locals: App.Locals): string {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	return locals.user.id;
}

export const GET: RequestHandler = async ({ locals }) => {
	const userId = signedIn(locals);
	return json({ preferences: await getScenePreferences(locals.db, userId) });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const userId = signedIn(locals);
	const parsed = scenePreferencesSaveSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Those settings could not be saved. Reload and try again.');
	}
	const { id, vaultId, ciphertext, payloadVersion, expectedRevision } = parsed.data;
	const result = await saveScenePreferences(locals.db, userId, {
		id,
		content: { vaultId, ciphertext, payloadVersion },
		expectedRevision
	});
	if (!result.ok) {
		if (result.reason === 'conflict') {
			error(409, 'Changed on another device.');
		}
		if (result.reason === 'wrong-vault') {
			error(409, 'This device’s keys are out of date. Reload the page and try again.');
		}
		error(400, 'Those settings could not be saved. Reload and try again.');
	}
	return json({ revision: result.revision });
};
