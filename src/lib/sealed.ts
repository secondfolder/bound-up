/**
 * Sealed records: the pure half. The ciphertext format, what each sealed kind
 * looks like at every version it has ever had, and the string the ciphertext is
 * bound to. No cryptography — that is `crypto/sealed.ts`, browser-only.
 *
 * A sealed record is a row whose content the server cannot read. The row keeps
 * a plaintext envelope that Drizzle and SQL migrations still manage — its id,
 * its scope, the fields the server acts on, `payload_version` and `revision` —
 * and one `ciphertext` column holding everything else, as JSON sealed under
 * the scope's vault key. See docs/encryption.md, "Sealed records".
 *
 * Because the server cannot read the payload it cannot migrate it either, so
 * the payload's shape is versioned here, in code:
 *
 * - **Writers always write the latest version.**
 * - **Readers accept every version ever shipped** and upcast it, one step at a
 *   time, to the latest, validating against each version's schema on the way.
 * - **A new version's reader ships before its writer**, so a tab still open on
 *   the previous build never meets data it cannot read.
 * - **A version is never edited once shipped.** Its frozen fixture in
 *   `sealed-fixtures/` would fail.
 *
 * Alias-free, so server code can import the kinds for their size caps and
 * known versions.
 */

import type { z } from 'zod';

/** The prefix every sealed ciphertext starts with. A new algorithm gets a new one. */
export const SEALED_FORMAT_V1 = 'sb1.';

/** Domain separation for the associated data. */
export const SEALED_AAD_INFO = 'bound-up-sealed-v1';

/** What a sealed ciphertext looks like: the prefix, then unpadded base64url. */
export const SEALED_PATTERN = /^sb1\.[A-Za-z0-9_-]+$/;

/**
 * One version of a kind's payload.
 *
 * `upcast` turns a value of this version into the input for the next one, and
 * is required on every version but the latest. Its output is validated by the
 * next version's schema, so an upcaster cannot produce something the next
 * version would not have accepted from a writer.
 */
export type SealedKindVersion = {
	version: number;
	schema: z.ZodType;
	upcast?: (value: never) => unknown;
};

/**
 * Everything there is to know about one kind of sealed record.
 *
 * `name` is part of the associated data, so it must never change once a
 * record of the kind has been written: renaming a kind would make every
 * existing record of it fail its tag check.
 */
export type SealedKind<Latest> = {
	readonly name: string;
	/** The longest ciphertext the server will store for this kind, in characters. */
	readonly maxCiphertextLength: number;
	/** Every version ever shipped, oldest first. */
	readonly versions: readonly SealedKindVersion[];
	readonly latestVersion: number;
	/** The latest version's schema, typed. */
	readonly latest: z.ZodType<Latest>;
};

const KIND_NAME = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * Declares a kind. Checks the version list is well formed once, at import, so
 * a mistake in it fails every test that touches the kind rather than one
 * user's record at read time.
 */
export function defineSealedKind<Latest>(definition: {
	name: string;
	maxCiphertextLength: number;
	versions: readonly [...SealedKindVersion[], { version: number; schema: z.ZodType<Latest> }];
}): SealedKind<Latest> {
	const { name, versions } = definition;
	if (!KIND_NAME.test(name)) {
		throw new Error(`Sealed kind name "${name}" must be lowercase letters, digits and dashes`);
	}
	versions.forEach((entry, index) => {
		if (entry.version !== index + 1) {
			throw new Error(`Sealed kind "${name}": versions must be 1, 2, 3… in order`);
		}
		const isLatest = index === versions.length - 1;
		if (!(isLatest || ('upcast' in entry && entry.upcast))) {
			throw new Error(`Sealed kind "${name}": version ${entry.version} needs an upcast`);
		}
	});
	const last = versions.at(-1);
	if (!last) {
		throw new Error(`Sealed kind "${name}" has no versions`);
	}
	return {
		name,
		maxCiphertextLength: definition.maxCiphertextLength,
		versions,
		latestVersion: last.version,
		// The definition's own type says the last entry's schema is
		// `ZodType<Latest>`; `.at(-1)` only loses that through the spread.
		latest: last.schema as z.ZodType<Latest>
	};
}

/**
 * Reads a decrypted payload of any shipped version as the latest.
 *
 * Null for anything that does not fit: an unknown version, a value its
 * version's schema rejects, or an upcaster whose output the next version
 * rejects. Whatever comes out of a vault was written by a partner's device
 * or forged by a server, so it is untrusted input and is parsed, never cast.
 * The returned value is each schema's *output*, so a schema that strips
 * unknown keys is also what keeps a record from carrying extra data.
 */
export function readSealedPayload<Latest>(
	kind: SealedKind<Latest>,
	version: number,
	value: unknown
): Latest | null {
	const read = readSealedPayloadDiagnosed(kind, version, value);
	return read.ok ? read.value : null;
}

/**
 * Why a sealed record could not be read, for logs and debug mode. It names
 * where in the payload a schema refused it and why, as paths and Zod issue
 * codes, and never the values: those are the content the seal is there to
 * keep private.
 */
export type SealedReadFailure =
	| { reason: 'format' | 'decrypt' | 'json' | 'no-vault' }
	| { reason: 'unknown-version'; version: number }
	| { reason: 'schema'; version: number; issues: { path: string; code: string }[] };

/** The most issues a failure keeps: enough to see the pattern, not a log flood. */
const MAX_REPORTED_ISSUES = 10;

/** `readSealedPayload`, saying why when it cannot. */
export function readSealedPayloadDiagnosed<Latest>(
	kind: SealedKind<Latest>,
	version: number,
	value: unknown
): { ok: true; value: Latest } | ({ ok: false } & SealedReadFailure) {
	const start = kind.versions.findIndex((entry) => entry.version === version);
	if (start === -1) {
		return { ok: false, reason: 'unknown-version', version };
	}
	let current: unknown = value;
	for (let index = start; index < kind.versions.length; index += 1) {
		const entry = kind.versions[index];
		if (!entry) {
			return { ok: false, reason: 'unknown-version', version };
		}
		const parsed = entry.schema.safeParse(current);
		if (!parsed.success) {
			return {
				ok: false,
				reason: 'schema',
				version: entry.version,
				issues: parsed.error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({
					path: issue.path.map(String).join('.'),
					code: issue.code
				}))
			};
		}
		current = parsed.data;
		if (index < kind.versions.length - 1) {
			// Checked in `defineSealedKind`: every version but the latest has one.
			const upcast = entry.upcast as (value: unknown) => unknown;
			current = upcast(current);
		}
	}
	return { ok: true, value: current as Latest };
}

/** Whether `version` is one this build can read for `kind`. The server checks this on write. */
export function isKnownVersion(kind: SealedKind<unknown>, version: number): boolean {
	return kind.versions.some((entry) => entry.version === version);
}

/**
 * The associated data a sealed ciphertext is bound to.
 *
 * Every part is something the server could otherwise change without touching
 * the ciphertext: move it to another row, another kind or another vault, or
 * relabel its version so it is read as an older shape. Each of those now fails
 * the tag check instead. Joined with `|`, which none of the parts can contain:
 * kind names are checked above, ids are UUIDs and the version is an integer.
 */
export function sealedAad(input: {
	kind: string;
	recordId: string;
	vaultId: string;
	version: number;
}): string {
	return [SEALED_AAD_INFO, input.kind, input.recordId, input.vaultId, input.version].join('|');
}
