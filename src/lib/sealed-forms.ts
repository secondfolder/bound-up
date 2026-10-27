/**
 * Sealing a form's text before it is posted.
 *
 * BROWSER ONLY — it seals with `crypto/sealed.ts`.
 *
 * Task and reward forms are ordinary form actions, but their text never
 * reaches the server: the page validates it, seals it into the scope's vault,
 * and swaps the text fields in the outgoing `FormData` for the sealed record.
 * The same move the sign-in form makes with `authSecret`. The server checks
 * what it still can — sizes, the vault, the settings beside the text — and
 * the content's own rules live in the kind (`sealed-kinds/tasks.ts`), checked
 * here on the way in and by every reader on the way out.
 */

import { sealRecord } from './crypto/sealed';
import { trustFor, writeGrantFor } from './crypto/trust.svelte';
import { blindIndex, type OpenVault } from './crypto/vault';
import { partnershipVault, selfVault, vaultsSettled } from './crypto/vaults.svelte';
import { selfWriteGrant, type WriteGrant } from './crypto/write-grant';
import type { SealedKind } from './sealed';
import { normaliseTagName, TAG_NAME_INDEX_PURPOSE, tagKind } from './sealed-kinds/tags';

/** Whose vault a form seals into. */
export type SealScope = { kind: 'self' } | { kind: 'partnership'; partnershipId: string };

/**
 * The vault a space's content is sealed into: the viewer's own for their solo
 * space, the partnership's for a shared one, whose id is the space's.
 */
export function sealScopeForSpace(space: { spaceId: string; kind: 'solo' | 'shared' }): SealScope {
	return space.kind === 'solo'
		? { kind: 'self' }
		: { kind: 'partnership', partnershipId: space.spaceId };
}

export type SealedFields = {
	recordId: string;
	vaultId: string;
	ciphertext: string;
	payloadVersion: string;
};

export type SealOutcome =
	| { ok: true; fields: SealedFields }
	/** `field` names the input at fault when there is one, for its inline error. */
	| { ok: false; error: string; field?: string };

const NOT_READY = 'This page is still getting ready. Try again in a moment.';
const UNAVAILABLE = 'This could not be saved from this device. Reload the page and try again.';
const KEYS_CHANGED =
	"Your partner's keys have changed. Check them on your messages page before saving here.";

/**
 * The vault a scope writes to, with the grant that permits it, or a message
 * saying why not, worded for the person waiting. Exported for the notebook,
 * which seals as it types rather than on a submit.
 */
export async function writableVault(
	scope: SealScope
): Promise<{ vault: OpenVault; grant: WriteGrant } | string> {
	// A submit made while the page is still opening its vaults waits for them
	// rather than refusing: the wait is a fetch and a few unwraps.
	await vaultsSettled();
	if (scope.kind === 'self') {
		const vault = selfVault();
		if (!vault) {
			return vault === undefined ? NOT_READY : UNAVAILABLE;
		}
		return { vault, grant: selfWriteGrant(vault) };
	}
	const vault = partnershipVault(scope.partnershipId);
	if (!vault) {
		return vault === undefined ? NOT_READY : UNAVAILABLE;
	}
	const grant = writeGrantFor(scope.partnershipId, vault.id);
	if (!grant) {
		return trustFor(scope.partnershipId).status === 'unknown' ? NOT_READY : KEYS_CHANGED;
	}
	return { vault, grant };
}

/**
 * Checks a payload against its kind and seals it. A payload the kind refuses
 * comes back as the first problem with it, worded by `describe` for the field
 * it is in, rather than as a throw from `sealRecord`.
 */
export async function sealForSubmit<Latest>(
	kind: SealedKind<Latest>,
	input: {
		scope: SealScope;
		recordId: string;
		payload: unknown;
		describe: (field: string, message: string) => string;
	}
): Promise<SealOutcome> {
	const parsed = kind.latest.safeParse(input.payload);
	if (!parsed.success) {
		const [issue] = parsed.error.issues;
		const field = typeof issue?.path[0] === 'string' ? issue.path[0] : undefined;
		return {
			ok: false,
			field,
			error: input.describe(field ?? '', issue?.message ?? 'Please check the form')
		};
	}
	const writable = await writableVault(input.scope);
	if (typeof writable === 'string') {
		return { ok: false, error: writable };
	}
	const sealed = await sealRecord(kind, {
		recordId: input.recordId,
		payload: parsed.data,
		...writable
	});
	return {
		ok: true,
		fields: {
			recordId: input.recordId,
			vaultId: writable.vault.id,
			ciphertext: sealed.ciphertext,
			payloadVersion: String(sealed.payloadVersion)
		}
	};
}

/**
 * Takes the text out of an outgoing form and puts the sealed record in. The
 * text fields are deleted rather than blanked, so a server that logged the
 * post would find nothing of them at all.
 */
export function replaceWithSealed(
	formData: FormData,
	textFields: readonly string[],
	fields: Record<string, string>
): void {
	for (const name of textFields) {
		formData.delete(name);
	}
	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}
}

/**
 * A tag name, sealed into the partnership's vault, with the blind index the
 * server checks uniqueness against (`normaliseTagName`, then the vault's
 * tag-name index key). Both come from the same vault, so a name moved to
 * another partnership has neither the right ciphertext nor the right index.
 */
export async function sealTagName(
	partnershipId: string,
	tagId: string,
	name: string
): Promise<
	| {
			ok: true;
			name: { vaultId: string; ciphertext: string; payloadVersion: number; nameIndex: string };
	  }
	| { ok: false; error: string }
> {
	const parsed = tagKind.latest.safeParse({ name });
	if (!parsed.success) {
		return { ok: false, error: 'Tag names are 1 to 80 characters' };
	}
	const writable = await writableVault({ kind: 'partnership', partnershipId });
	if (typeof writable === 'string') {
		return { ok: false, error: writable };
	}
	const sealed = await sealRecord(tagKind, { recordId: tagId, payload: parsed.data, ...writable });
	const nameIndex = await blindIndex(
		writable.vault,
		TAG_NAME_INDEX_PURPOSE,
		normaliseTagName(parsed.data.name)
	);
	return { ok: true, name: { vaultId: writable.vault.id, ...sealed, nameIndex } };
}
