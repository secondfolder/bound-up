import {
	type PartnerNamesSource,
	type PartnershipRole,
	storedNamesFrom,
	type ViewerNames
} from '../partnership';
import { testSealedRef } from './sealed-refs';

/**
 * A names source sealed in the partnership's vault, built from what the
 * viewer sees. It opens only in a test file that mocks the reader's seams
 * (`sealed-refs.ts`); a test of what the server hands over asserts on the
 * source instead.
 */
export function testNamesSource(
	partnershipId: string,
	names: Partial<ViewerNames> & { partnerName: string },
	role: PartnershipRole = 'inviter'
): PartnerNamesSource {
	const { vaultId, ciphertext, payloadVersion } = testSealedRef(
		storedNamesFrom({ yourName: 'You', partnerRole: null, yourRole: null, ...names }, role),
		partnershipId
	);
	return {
		partnershipId,
		role,
		sealed: { vaultId, ciphertext, payloadVersion, revision: 1 },
		invite: null
	};
}

/** A nav entry, as the app shell's layout hands it to every partner read. */
export function testPartnerView(
	id: string,
	partnerName: string,
	image: string | null = null
): { id: string; names: PartnerNamesSource; image: string | null } {
	return { id, names: testNamesSource(id, { partnerName }), image };
}
