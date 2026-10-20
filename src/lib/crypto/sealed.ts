/**
 * Sealing a record into a vault, and opening it again.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 *     ciphertext = "sb1." + base64url( 12-byte IV || AES-256-GCM(JSON) || 16-byte tag )
 *
 * or, for a kind that is `compressed`, "sz1." and the JSON deflated before it
 * is encrypted (`SEALED_FORMAT_COMPRESSED_V1` says when that is safe).
 *
 * under the vault's encryption key, with the associated data from `sealedAad`:
 * the kind, the record's id, the vault's id and the payload version. So a
 * ciphertext copied to another row, another kind or another vault does not
 * open, and neither does one whose plaintext `payload_version` was edited to
 * have it read as an older shape.
 *
 * What comes out is validated and upcast by the kind's registry
 * (`readSealedPayload` in `../sealed.ts`) before anything sees it.
 */

import { fromBase64Url, toBase64Url } from '../encryption';
import {
	readSealedPayload,
	readSealedPayloadDiagnosed,
	type SealedKind,
	type SealedReadFailure,
	sealedAad,
	sealedFormatFor
} from '../sealed';
import type { OpenVault } from './vault';
import type { WriteGrant } from './write-grant';

const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type Sealed = { ciphertext: string; payloadVersion: number };

/**
 * Seals a payload at the kind's latest version.
 *
 * Takes a `WriteGrant` for the vault, which only the trust check can issue for
 * a partnership vault: a write that forgot to ask whether the partner's keys
 * are still the ones this device pinned does not compile. See
 * `write-grant.ts`.
 *
 * Validates the payload against the latest schema first and seals the
 * schema's output, so a writer cannot store a shape its own readers would
 * refuse. Throws rather than returning null, because every failure here is a
 * bug in the caller, not a state to render.
 */
export async function sealRecord<Latest>(
	kind: SealedKind<Latest>,
	input: { recordId: string; payload: Latest; vault: OpenVault; grant: WriteGrant }
): Promise<Sealed> {
	const { recordId, vault, grant } = input;
	// A fresh random IV every time, never derived and never passed in: AES-GCM
	// loses all confidentiality if an IV repeats under one key, and one vault
	// key seals every record in its scope. 96 random bits keeps a repeat out of
	// reach for far more records than any scope will hold.
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	if (grant.vaultId !== vault.id) {
		throw new Error('This write grant is for a different vault');
	}
	const parsed = kind.latest.safeParse(input.payload);
	if (!parsed.success) {
		throw new Error(`A ${kind.name} payload does not match its own schema`);
	}

	const payloadVersion = kind.latestVersion;
	const sealed = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv,
			additionalData: encoder.encode(
				sealedAad({ kind: kind.name, recordId, vaultId: vault.id, version: payloadVersion })
			)
		},
		vault.encryptionKey,
		await plaintextBytes(kind, JSON.stringify(parsed.data))
	);
	const blob = new Uint8Array(IV_BYTES + sealed.byteLength);
	blob.set(iv, 0);
	blob.set(new Uint8Array(sealed), IV_BYTES);

	const ciphertext = `${sealedFormatFor(kind)}${toBase64Url(blob)}`;
	if (ciphertext.length > kind.maxCiphertextLength) {
		// The server would refuse it. Saying so here names the cause; a 400 from
		// the endpoint would not.
		throw new Error(`A sealed ${kind.name} is over its ${kind.maxCiphertextLength}-character cap`);
	}
	return { ciphertext, payloadVersion };
}

type SealedInput = {
	recordId: string;
	ciphertext: string;
	payloadVersion: number;
	vault: OpenVault;
};
type Diagnosed<Latest> = { ok: true; value: Latest } | ({ ok: false } & SealedReadFailure);

/**
 * Opens a record and reads it as the kind's latest version, or returns null.
 *
 * Null for everything — a wrong vault, a moved or tampered ciphertext, an
 * unknown version, a payload that fails its schema — because a screen renders
 * all of them the same way, as something it cannot show. Never a throw for
 * those, so one bad record cannot take a whole list down with it.
 *
 * Kept apart from `openRecordDiagnosed`, not written as a wrapper round it:
 * any extra await moves when a record opens relative to the rendering around
 * it, and that was enough to make a message thread miss its scroll to the
 * newest message.
 */
export async function openRecord<Latest>(
	kind: SealedKind<Latest>,
	input: { recordId: string; ciphertext: string; payloadVersion: number; vault: OpenVault }
): Promise<Latest | null> {
	const { recordId, ciphertext, payloadVersion, vault } = input;
	const format = sealedFormatFor(kind);
	if (!ciphertext.startsWith(format)) {
		return null;
	}

	let bytes: Uint8Array<ArrayBuffer>;
	try {
		bytes = fromBase64Url(ciphertext.slice(format.length));
	} catch {
		return null;
	}
	if (bytes.length <= IV_BYTES) {
		return null;
	}

	let plaintext: string;
	try {
		const opened = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: bytes.subarray(0, IV_BYTES),
				additionalData: encoder.encode(
					sealedAad({ kind: kind.name, recordId, vaultId: vault.id, version: payloadVersion })
				)
			},
			vault.encryptionKey,
			bytes.subarray(IV_BYTES)
		);
		// Only a compressed kind awaits again here, so every other kind opens
		// exactly as it did (see the note above about extra awaits).
		const read = kind.compressed ? await inflated(opened) : decoder.decode(opened);
		if (read === null) {
			return null;
		}
		plaintext = read;
	} catch (error) {
		// Every authentication failure is an OperationError with no detail, which
		// is right: telling a wrong key from a moved row would be an oracle.
		if (error instanceof DOMException && error.name === 'OperationError') {
			return null;
		}
		throw error;
	}

	let value: unknown;
	try {
		value = JSON.parse(plaintext);
	} catch {
		return null;
	}
	return readSealedPayload(kind, payloadVersion, value);
}

/**
 * `openRecord`, saying why when it cannot: for a record whose failure is
 * worth a log line and a debug-mode note, like a whole kink list. The reason
 * is safe to log (`SealedReadFailure`).
 */
export async function openRecordDiagnosed<Latest>(
	kind: SealedKind<Latest>,
	input: SealedInput
): Promise<Diagnosed<Latest>> {
	const bytes = sealedBytes(kind, input.ciphertext);
	if (!bytes) {
		return { ok: false, reason: 'format' };
	}
	return readPlaintext(kind, input.payloadVersion, await decrypt(kind, input, bytes));
}

/** The IV and ciphertext out of a sealed string, or null for one that is not sealed. */
function sealedBytes(
	kind: SealedKind<unknown>,
	ciphertext: string
): Uint8Array<ArrayBuffer> | null {
	const format = sealedFormatFor(kind);
	if (!ciphertext.startsWith(format)) {
		return null;
	}
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		bytes = fromBase64Url(ciphertext.slice(format.length));
	} catch {
		return null;
	}
	return bytes.length <= IV_BYTES ? null : bytes;
}

/** The plaintext, or null when it does not authenticate. */
async function decrypt(
	kind: SealedKind<unknown>,
	{ recordId, payloadVersion, vault }: SealedInput,
	bytes: Uint8Array<ArrayBuffer>
): Promise<string | null> {
	try {
		const opened = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: bytes.subarray(0, IV_BYTES),
				additionalData: encoder.encode(
					sealedAad({ kind: kind.name, recordId, vaultId: vault.id, version: payloadVersion })
				)
			},
			vault.encryptionKey,
			bytes.subarray(IV_BYTES)
		);
		return kind.compressed ? await inflated(opened) : decoder.decode(opened);
	} catch (error) {
		// Every authentication failure is an OperationError with no detail, which
		// is right: telling a wrong key from a moved row would be an oracle.
		if (error instanceof DOMException && error.name === 'OperationError') {
			return null;
		}
		throw error;
	}
}

function readPlaintext<Latest>(
	kind: SealedKind<Latest>,
	payloadVersion: number,
	plaintext: string | null
): Diagnosed<Latest> {
	if (plaintext === null) {
		return { ok: false, reason: 'decrypt' };
	}
	let value: unknown;
	try {
		value = JSON.parse(plaintext);
	} catch {
		return { ok: false, reason: 'json' };
	}
	return readSealedPayloadDiagnosed(kind, payloadVersion, value);
}

/** What is encrypted: the payload's JSON, deflated first for a compressed kind. */
async function plaintextBytes(
	kind: SealedKind<unknown>,
	json: string
): Promise<Uint8Array<ArrayBuffer>> {
	const bytes = encoder.encode(json);
	return kind.compressed ? await through(bytes, new CompressionStream('deflate-raw')) : bytes;
}

/**
 * A compressed kind's plaintext, or null for a stream that will not inflate,
 * which the callers treat as the record not opening. Only ever given bytes
 * that authenticated, so what it inflates was written by a device holding
 * the vault key, not by the server.
 */
async function inflated(opened: ArrayBuffer): Promise<string | null> {
	try {
		return decoder.decode(
			await through(new Uint8Array(opened), new DecompressionStream('deflate-raw'))
		);
	} catch {
		return null;
	}
}

async function through(
	bytes: Uint8Array<ArrayBuffer>,
	stream: CompressionStream | DecompressionStream
): Promise<Uint8Array<ArrayBuffer>> {
	const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
	return new Uint8Array(await out.arrayBuffer());
}

/**
 * Whether a record read at an older version should be written back at the
 * latest. The write itself is the caller's, through its own endpoint, and is
 * compare-and-swap on `revision` so it can never overwrite a newer edit.
 */
export function needsUpgrade(kind: SealedKind<unknown>, payloadVersion: number): boolean {
	return payloadVersion < kind.latestVersion;
}
