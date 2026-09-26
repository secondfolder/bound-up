import { describe, expect, it } from 'vitest';
import { MEDIA_TTL_DEFAULT_MS, MEDIA_TTL_MAX_MS, MEDIA_TTL_MIN_MS } from '$lib/messaging';
import { runAndCatch } from '$lib/testing/events';
import { parseSend, sendFailureStatus } from './send';

function sendRequest(fields: Record<string, string>, files = 1): Request {
	const body = new FormData();
	body.set('ciphertext', 'eA');
	for (let index = 0; index < files; index += 1) {
		body.append('files', new Blob([new Uint8Array([index])]), `file-${index}`);
		body.append('fileIds', crypto.randomUUID());
	}
	for (const [key, value] of Object.entries(fields)) {
		body.set(key, value);
	}
	return new Request('https://app.test/api/partnerships/p/threads', { method: 'POST', body });
}

describe('parseSend: the media lifetime', () => {
	it('defaults to two weeks when none is posted', async () => {
		await expect(parseSend(sendRequest({}))).resolves.toMatchObject({
			mediaTtl: MEDIA_TTL_DEFAULT_MS
		});
	});

	it('passes through any whole number of milliseconds from an hour to thirty days', async () => {
		for (const ttl of [MEDIA_TTL_MIN_MS, 5_400_000, MEDIA_TTL_MAX_MS]) {
			await expect(parseSend(sendRequest({ mediaTtlMs: String(ttl) }))).resolves.toMatchObject({
				mediaTtl: ttl
			});
		}
	});

	// Accepted here; whether the sender may is the data layer's call, because
	// it depends on the account's features.
	it('passes `never` through', async () => {
		await expect(parseSend(sendRequest({ mediaTtlMs: 'never' }))).resolves.toMatchObject({
			mediaTtl: 'never'
		});
	});

	it('refuses anything else with a 400 that says what the range is', async () => {
		for (const value of [
			String(MEDIA_TTL_MIN_MS - 1),
			String(MEDIA_TTL_MAX_MS + 1),
			'1e7',
			'soon'
		]) {
			const result = await runAndCatch(() => parseSend(sendRequest({ mediaTtlMs: value })));
			expect(result).toMatchObject({
				type: 'error',
				status: 400,
				message: expect.stringMatching(/1 hour and 30 days/)
			});
		}
	});
});

describe('sendFailureStatus', () => {
	it('is a 403 for never-expiring media without the feature', () => {
		expect(sendFailureStatus('needs-permanent-media')).toBe(403);
	});

	it('is a 400 for a lifetime out of range', () => {
		expect(sendFailureStatus('bad-media-ttl')).toBe(400);
	});
});
