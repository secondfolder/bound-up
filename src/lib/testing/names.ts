import {
	type PartnerNamesSource,
	type PartnershipRole,
	storedNamesFrom,
	type ViewerNames
} from '../partnership';

/**
 * A names source for a partnership from before names were sealed, built from
 * what the viewer sees.
 *
 * The plaintext kind on purpose: it is the only source `partnerName()` shows
 * without an open vault, and component tests have none. A test of the sealed
 * path asserts on the source the server hands over instead.
 */
export function legacyNamesSource(
	partnershipId: string,
	names: Partial<ViewerNames> & { partnerName: string },
	role: PartnershipRole = 'inviter'
): PartnerNamesSource {
	return {
		partnershipId,
		role,
		sealed: null,
		invite: null,
		legacy: storedNamesFrom({ yourName: 'You', partnerRole: null, yourRole: null, ...names }, role)
	};
}

/** A nav entry, as the app shell's layout hands it to every partner read. */
export function testPartnerView(
	id: string,
	partnerName: string,
	image: string | null = null
): { id: string; names: PartnerNamesSource; image: string | null } {
	return { id, names: legacyNamesSource(id, { partnerName }), image };
}
