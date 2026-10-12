import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearHypnoIndex,
	HYPNO_FAILURE_BACKOFF_MS,
	HYPNO_TTL_MS,
	hypnoIndex
} from './playroom-hypno';

beforeEach(() => clearHypnoIndex());
afterEach(() => clearHypnoIndex());

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function entry(n: number) {
	return {
		uuid: UUID(n),
		name: `File ${n}`,
		duration: 60_000,
		fileType: 'loop',
		audioURL: `https://cdn.bambicloud.com/${UUID(n)}.mp3`,
		author: { username: 'a' },
		triggers: []
	};
}

/** bambicloud with `total` playable files, answering pages of 50 by offset. */
function bambicloud(total: number) {
	return vi.fn((input: string | URL | Request) => {
		const url = new URL(String(input));
		const offset = Number(url.searchParams.get('pageOffset'));
		const size = Number(url.searchParams.get('pageSize'));
		const files = Array.from({ length: Math.max(0, Math.min(size, total - offset)) }, (_, i) =>
			entry(offset + i)
		);
		return Promise.resolve(
			Response.json({ files, totalItems: total, pageSize: size, pageOffset: offset })
		);
	});
}

const asFetch = (fn: ReturnType<typeof vi.fn>) => fn as unknown as typeof fetch;

describe('hypnoIndex', () => {
	it('pages through every playable file, unlocked only', async () => {
		const fetchFn = bambicloud(120);
		const files = await hypnoIndex(asFetch(fetchFn), 0);
		expect(files).toHaveLength(120);
		expect(fetchFn).toHaveBeenCalledTimes(3);
		for (const [input] of fetchFn.mock.calls) {
			expect(new URL(String(input)).searchParams.get('showLocked')).toBe('false');
		}
	});

	it('serves a fresh index from the cache', async () => {
		const fetchFn = bambicloud(10);
		await hypnoIndex(asFetch(fetchFn), 0);
		await hypnoIndex(asFetch(fetchFn), HYPNO_TTL_MS - 1);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('builds once for concurrent requests', async () => {
		const fetchFn = bambicloud(10);
		await Promise.all([hypnoIndex(asFetch(fetchFn), 0), hypnoIndex(asFetch(fetchFn), 0)]);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('keeps the last good index when a rebuild fails, and backs off', async () => {
		const good = await hypnoIndex(asFetch(bambicloud(10)), 0);
		const failing = vi.fn(() => Promise.reject(new TypeError('down')));
		expect(await hypnoIndex(asFetch(failing), HYPNO_TTL_MS + 1)).toEqual(good);
		const calls = failing.mock.calls.length;
		await hypnoIndex(asFetch(failing), HYPNO_TTL_MS + HYPNO_FAILURE_BACKOFF_MS - 1);
		expect(failing.mock.calls.length).toBe(calls);
	});

	it('answers an empty index, never an error, when bambicloud never answered', async () => {
		const failing = vi.fn(() => Promise.resolve(new Response('', { status: 503 })));
		await expect(hypnoIndex(asFetch(failing), 0)).resolves.toEqual([]);
	});

	it('keeps the pages that came back when one fails', async () => {
		const flaky = vi.fn((input: string | URL | Request) => {
			const offset = Number(new URL(String(input)).searchParams.get('pageOffset'));
			return offset === 50
				? Promise.resolve(new Response('', { status: 500 }))
				: bambicloud(120)(input);
		});
		const files = await hypnoIndex(asFetch(flaky), 0);
		expect(files).toHaveLength(70);
	});
});
