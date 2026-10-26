import { and, eq } from 'drizzle-orm';
import { scenePreferencesKind } from '../sealed-kinds/scenes';
import type { SealedRefView } from '../types';
import type { Db } from './db';
import { scenePreferences } from './db/schema';
import { type SealedWrite, sealedIsAcceptable, selfVaultIdFor } from './sealed-content';

/**
 * Every database access for a person's scene designer settings: one sealed
 * record in their own vault. The server checks only the envelope and the
 * vault, and never reads a setting. See docs/scenes.md.
 */

export type ScenePreferencesView = { revision: number; sealed: SealedRefView };

export type ScenePreferencesRefusal = 'bad-content' | 'wrong-vault' | 'conflict';

export type ScenePreferencesResult =
	| { ok: true; revision: number }
	| { ok: false; reason: ScenePreferencesRefusal };

/** The person's settings, or null before they have changed any. */
export async function getScenePreferences(
	db: Db,
	userId: string
): Promise<ScenePreferencesView | null> {
	const [row] = await db
		.select({
			id: scenePreferences.id,
			ciphertext: scenePreferences.ciphertext,
			vaultId: scenePreferences.vaultId,
			payloadVersion: scenePreferences.payloadVersion,
			revision: scenePreferences.revision
		})
		.from(scenePreferences)
		.where(eq(scenePreferences.userId, userId))
		.limit(1);
	return row
		? {
				revision: row.revision,
				sealed: {
					recordId: row.id,
					vaultId: row.vaultId,
					ciphertext: row.ciphertext,
					payloadVersion: row.payloadVersion
				}
			}
		: null;
}

/**
 * Saves the settings: new when `expectedRevision` is null, otherwise
 * compare-and-swap on the revision. A lost race is `conflict`; the browser
 * fetches what won, merges (`mergePreferences`) and tries again.
 */
export async function saveScenePreferences(
	db: Db,
	userId: string,
	input: { id: string; content: SealedWrite; expectedRevision: number | null }
): Promise<ScenePreferencesResult> {
	const { content } = input;
	if (!sealedIsAcceptable(scenePreferencesKind, content.ciphertext, content.payloadVersion)) {
		return { ok: false, reason: 'bad-content' };
	}
	const vaultId = await selfVaultIdFor(db, userId);
	if (vaultId === null || content.vaultId !== vaultId) {
		return { ok: false, reason: 'wrong-vault' };
	}
	if (input.expectedRevision === null) {
		const [row] = await db
			.insert(scenePreferences)
			.values({
				id: input.id,
				userId,
				ciphertext: content.ciphertext,
				vaultId: content.vaultId,
				payloadVersion: content.payloadVersion
			})
			// Another device saved first: the browser merges into that one.
			.onConflictDoNothing()
			.returning({ revision: scenePreferences.revision });
		return row ? { ok: true, revision: row.revision } : { ok: false, reason: 'conflict' };
	}
	const [row] = await db
		.update(scenePreferences)
		.set({
			ciphertext: content.ciphertext,
			vaultId: content.vaultId,
			payloadVersion: content.payloadVersion,
			revision: input.expectedRevision + 1,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(scenePreferences.id, input.id),
				eq(scenePreferences.userId, userId),
				eq(scenePreferences.revision, input.expectedRevision)
			)
		)
		.returning({ revision: scenePreferences.revision });
	return row ? { ok: true, revision: row.revision } : { ok: false, reason: 'conflict' };
}
