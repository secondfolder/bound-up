import { describe, expect, it } from 'vitest';
import { MEDIA_TTL_DEFAULT_MS, MEDIA_TTL_MAX_MS, MEDIA_TTL_MIN_MS } from '$lib/messaging';
import { runAndCatch } from '$lib/testing/events';
import { parseSend, sendFailureStatus } from './send';

function sendRequest(fields: Record<string, string | string[]>, files = 1): Request {
	const body = new FormData();
	body.set('ciphertext', 'eA');
	for (let index = 0; index < files; index += 1) {
		body.append('files', new Blob([new Uint8Array([index])]), `file-${index}`);
		body.append('fileIds', crypto.randomUUID());
	}
	for (const [key, value] of Object.entries(fields)) {
		for (const each of Array.isArray(value) ? value : [value]) {
			body.append(key, each);
		}
	}
	return new Request('https://app.test/api/partnerships/p/threads', { method: 'POST', body });
}

/** Each parsed attachment's lifetime, in order. */
async function lifetimes(request: Request) {
	return (await parseSend(request)).attachments.map((attachment) => attachment.mediaTtl);
}

describe('parseSend: the lifetime of each file', () => {
	it('defaults every file to two weeks when none is posted', async () => {
		await expect(lifetimes(sendRequest({}, 2))).resolves.toEqual([
			MEDIA_TTL_DEFAULT_MS,
			MEDIA_TTL_DEFAULT_MS
		]);
	});

	it('pairs one lifetime per file, in order', async () => {
		await expect(
			lifetimes(sendRequest({ mediaTtlMs: [String(MEDIA_TTL_MIN_MS), 'never'] }, 2))
		).resolves.toEqual([MEDIA_TTL_MIN_MS, 'never']);
	});

	it('passes through any whole number of milliseconds from an hour to thirty days', async () => {
		for (const ttl of [MEDIA_TTL_MIN_MS, 5_400_000, MEDIA_TTL_MAX_MS]) {
			await expect(lifetimes(sendRequest({ mediaTtlMs: String(ttl) }))).resolves.toEqual([ttl]);
		}
	});

	// Accepted here; whether the sender may is the data layer's call, because
	// it depends on the account's features.
	it('passes `never` through', async () => {
		await expect(lifetimes(sendRequest({ mediaTtlMs: 'never' }))).resolves.toEqual(['never']);
	});

	it('refuses lifetimes that cannot be paired with the files', async () => {
		const result = await runAndCatch(() =>
			parseSend(sendRequest({ mediaTtlMs: [String(MEDIA_TTL_MIN_MS)] }, 2))
		);
		expect(result).toMatchObject({ type: 'error', status: 400 });
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

	// A size the account may not send, named in the body so the client can say
	// what the limit is.
	it('is a 413 for more bytes than the account may send without the feature', () => {
		expect(sendFailureStatus('needs-high-quality-media')).toBe(413);
	});

	it('is a 400 for a lifetime out of range', () => {
		expect(sendFailureStatus('bad-media-ttl')).toBe(400);
	});
});
