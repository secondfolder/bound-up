import { afterEach, describe, expect, it } from 'vitest';
import { forgetInviteKey, recallInviteKey, rememberInviteKey } from './crypto/invite';
import { openedNames } from './partner-names.svelte';
import type { PartnerNamesSource } from './partnership';

/** In the browser project: the invitee's key from the link lives in localStorage. */

const PARTNERSHIP_ID = '00000000-0000-4000-8000-000000000003';
const KEY = new Uint8Array(32).fill(7);

function source(where: Pick<PartnerNamesSource, 'sealed' | 'invite'>): PartnerNamesSource {
	return { partnershipId: PARTNERSHIP_ID, role: 'invitee', legacy: null, ...where };
}

afterEach(() => {
	forgetInviteKey(PARTNERSHIP_ID);
});

/**
 * When the invitee's device lets go of the key from the link. It once did as
 * soon as its sealing pass had moved the names into the vault, which left a
 * page whose load read the invite a moment earlier unable to open it: the
 * names showed as unreadable until the next load.
 */
describe('the key from the link', () => {
	it('is kept while a load still serves the names from the invite', () => {
		rememberInviteKey(PARTNERSHIP_ID, KEY);
		openedNames(
			source({ sealed: null, invite: { ciphertext: 'sb1.x', payloadVersion: 1, keyWrap: null } })
		);
		expect(recallInviteKey(PARTNERSHIP_ID)).toEqual(KEY);
	});

	it('is forgotten once a load serves them from the vault', () => {
		rememberInviteKey(PARTNERSHIP_ID, KEY);
		openedNames(
			source({
				sealed: { vaultId: 'v', ciphertext: 'sb1.x', payloadVersion: 1, revision: 1 },
				invite: null
			})
		);
		expect(recallInviteKey(PARTNERSHIP_ID)).toBeNull();
	});
});
