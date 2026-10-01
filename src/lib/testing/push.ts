import type { VapidConfig } from '../server/push';

/**
 * A stand-in push service and browser, for the push tests.
 *
 * The keys are real P-256 keys and `decryptPush` is a real RFC 8291 decoder, so
 * a test can assert on what a browser would actually read out of the bytes the
 * server sent, rather than on what it meant to send.
 */

function base64url(bytes: ArrayBuffer | Uint8Array): string {
	const binary = String.fromCharCode(...new Uint8Array(bytes));
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/[=]+$/, '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
	const base64 = text.replaceAll('-', '+').replaceAll('_', '/');
	const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** A server key pair, in the shape `readVapidConfig` returns. */
export async function createTestVapid(): Promise<VapidConfig> {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const publicKey = await crypto.subtle.exportKey('raw', pair.publicKey);
	const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
	if (!d) {
		throw new Error('exported VAPID key has no private scalar');
	}
	return { publicKey: base64url(publicKey), privateKey: d, subject: 'mailto:test@example.test' };
}

/** What a browser holds for one subscription: what it shares, and what it keeps. */
export type TestBrowserSubscription = {
	endpoint: string;
	p256dh: string;
	auth: string;
	privateKey: CryptoKey;
};

export async function createTestBrowserSubscription(
	endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`
): Promise<TestBrowserSubscription> {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	return {
		endpoint,
		p256dh: base64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
		auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
		privateKey: pair.privateKey
	};
}

async function hkdf(
	salt: Uint8Array<ArrayBuffer>,
	ikm: ArrayBuffer | Uint8Array<ArrayBuffer>,
	info: Uint8Array<ArrayBuffer>,
	bytes: number
): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	return await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt, info },
		key,
		bytes * 8
	);
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

const encoder = new TextEncoder();

/**
 * Opens an `aes128gcm` push body as the receiving browser would (RFC 8291 §3,
 * RFC 8188 §2), and parses the JSON inside.
 */
export async function decryptPush(
	subscription: TestBrowserSubscription,
	body: Uint8Array
): Promise<unknown> {
	const salt = body.slice(0, 16);
	const keyIdLength = body[20] ?? 0;
	const serverPublic = body.slice(21, 21 + keyIdLength);
	const ciphertext = body.slice(21 + keyIdLength);

	const serverKey = await crypto.subtle.importKey(
		'raw',
		serverPublic,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const shared = await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: serverKey },
		subscription.privateKey,
		256
	);
	const ikm = await hkdf(
		fromBase64url(subscription.auth),
		shared,
		concat(encoder.encode('WebPush: info\0'), fromBase64url(subscription.p256dh), serverPublic),
		32
	);
	const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
	const padded = new Uint8Array(
		await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext)
	);
	// The last record ends with a 0x02 delimiter, then zero padding.
	const end = padded.lastIndexOf(2);
	return JSON.parse(new TextDecoder().decode(padded.slice(0, end)));
}

/** One request the fake push service received. */
export type TestPushRequest = {
	endpoint: string;
	headers: Record<string, string>;
	body: Uint8Array;
};

/**
 * A `fetch` that plays the push service: records every request and answers
 * with `status(endpoint)`, 201 unless told otherwise.
 */
export function createTestPushService(status: (endpoint: string) => number = () => 201) {
	const received: TestPushRequest[] = [];
	const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
		const endpoint = String(input);
		received.push({
			endpoint,
			headers: { ...(init?.headers as Record<string, string>) },
			body: init?.body as Uint8Array
		});
		return Promise.resolve(new Response(null, { status: status(endpoint) }));
	}) as typeof fetch;
	return { fetch: fetchImpl, received };
}
