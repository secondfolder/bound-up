/**
 * The safety number two partners read to each other.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * The digest half only. The interesting half — what goes into it, and how it is
 * formatted so it can be read aloud without losing your place — is pure and
 * lives in `src/lib/encryption.ts`, where it is unit-testable without WebCrypto.
 * Same split as `partnership.ts` / `server/partnerships.ts`.
 */

import { formatSafetyNumber, recoveryCodeSource, safetyNumberSource } from '../encryption';

/**
 * The number both partners should see, given the two public recipients.
 *
 * Symmetric by construction: `safetyNumberSource` sorts its inputs, so it does
 * not matter which of the two is passed first. That is what lets one person
 * read theirs out and the other simply compare.
 */
export async function safetyNumber(mine: string, theirs: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(safetyNumberSource(mine, theirs))
	);
	return formatSafetyNumber(new Uint8Array(digest));
}

/**
 * The code a partner-assisted sign-in is confirmed with.
 *
 * The requester's screen and the helping partner's both compute it from the
 * same new recipient — the requester from the key their browser just made, the
 * partner from the snapshot on the restore request — and they compare it
 * somewhere other than this app. Same format as the safety number, so it reads
 * aloud the same way. See `recoveryCodeSource` for why it covers one key.
 */
export async function recoveryCode(recipient: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(recoveryCodeSource(recipient))
	);
	return formatSafetyNumber(new Uint8Array(digest));
}
