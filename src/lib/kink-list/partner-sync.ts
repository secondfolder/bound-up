/**
 * Keeping the copies you share with partners in step with your own list.
 *
 * BROWSER ONLY at run time: it seals with `crypto/sealed.ts`.
 *
 * Your partner reads `resolved`, the copy worked out from your own list, so a
 * change to your own list has to be sealed into each copy too. The kink list's
 * layout runs this after your own list saves, and once when it opens in case
 * your list changed on another device since. A copy already up to date
 * (`soloRevision` matches) is left alone, and one that changed elsewhere in
 * the meantime is left for next time rather than overwritten.
 */

import { tryFetch } from '../request-failure.svelte';
import { sealForSubmit } from '../sealed-forms';
import { kinkListPartnerKind } from '../sealed-kinds/kink-list';
import type { KinkListView } from '../types';
import type { ListPayload } from './answers';
import { kinkListPath } from './api';
import { resolvedFor } from './partner';
import { openPartnerCopy } from './partner-store.svelte';

export async function syncSharedCopies(
	solo: ListPayload,
	soloRevision: number | null,
	views: readonly KinkListView[]
): Promise<KinkListView[]> {
	const updated: KinkListView[] = [];
	for (const view of views) {
		updated.push((await syncOne(solo, soloRevision, view)) ?? view);
	}
	return updated;
}

async function syncOne(
	solo: ListPayload,
	soloRevision: number | null,
	view: KinkListView
): Promise<KinkListView | null> {
	const partner = await openPartnerCopy(view);
	if (!partner || (soloRevision !== null && partner.soloRevision === soloRevision)) {
		return null;
	}
	const sealed = await sealForSubmit(kinkListPartnerKind, {
		scope: { kind: 'partnership', partnershipId: view.scope },
		recordId: view.id,
		payload: { ...partner, resolved: resolvedFor(solo, partner), soloRevision },
		describe: () => ''
	});
	if (!sealed.ok) {
		return null;
	}
	// A shared copy's scope is its partnership's id, which is its space's.
	const response = await tryFetch(kinkListPath(view.scope), {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			id: view.id,
			vaultId: sealed.fields.vaultId,
			ciphertext: sealed.fields.ciphertext,
			payloadVersion: Number(sealed.fields.payloadVersion),
			expectedRevision: view.revision
		})
	});
	if (!response?.ok) {
		// Background work nobody is waiting on: a lost race or a dropped
		// connection is tried again after the next save.
		return null;
	}
	const { revision } = (await response.json()) as { revision: number };
	return {
		...view,
		revision,
		sealed: { ...view.sealed, vaultId: sealed.fields.vaultId, ciphertext: sealed.fields.ciphertext }
	};
}
