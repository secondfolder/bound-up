import type { Intensity, Role, Vibe } from '$lib/playroom/iq-test/settings';
import { iqTestResultSchema } from '$lib/schemas/iqTestResult';
import type { IqTestResultView } from '$lib/types';
import { keyedHash } from './keyed-hash';

/**
 * A signed-out visitor's result, carried in its own URL.
 *
 * Signed-out results are never stored on the server, so the link has to hold
 * the result itself: thirteen packed bytes, then a truncated HMAC of them under
 * the auth secret, the whole base64url-encoded into about 32 opaque characters.
 *
 * What the signature buys is that the score in a shared link cannot be edited
 * by hand: change a character and the link no longer opens. It is not proof
 * the test was taken honestly — the browser reports the score, as it does for
 * an account's results, and anyone can ask the share endpoint to sign any
 * score. Nothing depends on a score being honest.
 */

const PURPOSE = 'iq-test-share';
/** 2 added the flags byte. Links of version 1 were never shared beyond development. */
const VERSION = 2;
const PAYLOAD_BYTES = 13;
const MAC_BYTES = 12;

/**
 * Codes for the enums, fixed here rather than taken from the lists' order: a
 * new vibe added at the front of `VIBES` would otherwise change what every
 * link already shared decodes to. Typed as records, so a new value cannot be
 * added without a code. The intensity needs none: it is already a number.
 */
const ROLE_CODES: Record<Role, number> = { dom: 0, sub: 1 };
/** 0 is "no vibe", for a clinical run. */
const VIBE_CODES: Record<Vibe, number> = {
	bambi: 1,
	misogyny: 2,
	denial: 3,
	feminisation: 4,
	degradation: 5,
	gooner: 6
};

function decode<T extends string>(codes: Record<T, number>, code: number): T | undefined {
	return (Object.keys(codes) as T[]).find((key) => codes[key] === code);
}

/** What a shared link carries: a result without its id, which the link is. */
export type SharedResult = Omit<IqTestResultView, 'id' | 'shareToken'>;

function pack(result: SharedResult): Uint8Array {
	const bytes = new Uint8Array(PAYLOAD_BYTES);
	const view = new DataView(bytes.buffer);
	bytes[0] = VERSION;
	bytes[1] =
		ROLE_CODES[result.role] |
		(result.intensity << 1) |
		((result.vibe === null ? 0 : VIBE_CODES[result.vibe]) << 4);
	bytes[2] = result.iq;
	bytes[3] = result.correct;
	bytes[4] = result.attempted;
	bytes[5] = result.skipped;
	bytes[6] = result.soberIq ?? 0;
	bytes[7] = result.targetIq ?? 0;
	view.setUint32(8, Math.floor(result.createdAt.getTime() / 1000));
	bytes[12] = (result.humiliating ? 0b01 : 0) | (result.themedLook ? 0b10 : 0);
	return bytes;
}

function unpack(bytes: Uint8Array): SharedResult | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes[0] !== VERSION) {
		return null;
	}
	const flags = bytes[1] ?? 0;
	const role = decode(ROLE_CODES, flags & 0b1);
	// The intensity is its own code; the schema below refuses 5–7.
	const intensity = ((flags >> 1) & 0b111) as Intensity;
	const vibeCode = flags >> 4;
	const vibe = vibeCode === 0 ? null : decode(VIBE_CODES, vibeCode);
	if (role === undefined || vibe === undefined) {
		return null;
	}
	const nullable = (value: number | undefined) =>
		value === 0 || value === undefined ? null : value;
	// Re-checked as if it had been posted: a valid signature only says this
	// server packed it, and the bounds may have moved since.
	const parsed = iqTestResultSchema.safeParse({
		role,
		intensity,
		vibe,
		iq: bytes[2],
		correct: bytes[3],
		attempted: bytes[4],
		skipped: bytes[5],
		humiliating: ((bytes[12] ?? 0) & 0b01) !== 0,
		themedLook: ((bytes[12] ?? 0) & 0b10) !== 0,
		soberIq: nullable(bytes[6]),
		targetIq: nullable(bytes[7]),
		seed: 0
	});
	if (!parsed.success) {
		return null;
	}
	const { seed: _seed, ...result } = parsed.data;
	return { ...result, createdAt: new Date(view.getUint32(8) * 1000) };
}

async function macFor(secret: string, payload: Uint8Array): Promise<Uint8Array> {
	const hex = await keyedHash(secret, PURPOSE, toBase64Url(payload));
	return Uint8Array.from({ length: MAC_BYTES }, (_, i) =>
		Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
	);
}

/** The token a signed-out result is shared by, and its URL's last segment. */
export async function signSharedResult(secret: string, result: SharedResult): Promise<string> {
	const payload = pack(result);
	const mac = await macFor(secret, payload);
	const token = new Uint8Array(PAYLOAD_BYTES + MAC_BYTES);
	token.set(payload);
	token.set(mac, PAYLOAD_BYTES);
	return toBase64Url(token);
}

/** The result a token carries, or null for anything not signed by this server. */
export async function verifySharedResult(
	secret: string,
	token: string
): Promise<SharedResult | null> {
	const bytes = fromBase64Url(token);
	if (bytes?.length !== PAYLOAD_BYTES + MAC_BYTES) {
		return null;
	}
	const payload = bytes.slice(0, PAYLOAD_BYTES);
	const expected = await macFor(secret, payload);
	let difference = 0;
	for (let i = 0; i < MAC_BYTES; i += 1) {
		difference |= (expected[i] ?? 0) ^ (bytes[PAYLOAD_BYTES + i] ?? 0);
	}
	return difference === 0 ? unpack(payload) : null;
}

/**
 * Base64url by hand: `btoa` exists on Workers, in Node and in the browser
 * alike, where `Buffer` would need `nodejs_compat`.
 */
function toBase64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function fromBase64Url(text: string): Uint8Array | null {
	if (!BASE64URL.test(text)) {
		return null;
	}
	try {
		const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
}
