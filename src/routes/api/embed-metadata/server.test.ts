import { describe, expect, it, vi } from 'vitest';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import type { TestUser } from '$lib/testing/fixtures';
import { POST } from './+server';

/**
 * Resolving previews for the links in a message.
 *
 * Named `server.test.ts` and not `+server.test.ts`: SvelteKit reserves the `+`
 * prefix and refuses to build a route file it does not recognise.
 */

// The route reads nothing from the user row beyond its presence.
const ada = { id: 'user-ada', name: 'Ada', email: 'ada@example.test' } as TestUser;

function postWith(urls: string[], fetchFn: typeof fetch) {
	const event = fakeEvent({ db: undefined as never, user: ada, json: { urls } });
	event.fetch = fetchFn;
	return POST(event);
}

describe('POST /api/embed-metadata', () => {
	it('never has more than three provider lookups in flight', async () => {
		let open = 0;
		let peak = 0;
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			open += 1;
			peak = Math.max(peak, open);
			await new Promise((resolve) => setTimeout(resolve, 2));
			open -= 1;
			return Response.json({ title: String(input), provider_name: 'Vimeo' });
		});
		const urls = Array.from({ length: 20 }, (_, i) => `https://vimeo.com/${i + 1}`);

		const response = await postWith(urls, fetchMock as typeof fetch);
		const body = (await response.json()) as { embeds: { href: string }[] };

		expect(fetchMock).toHaveBeenCalledTimes(20);
		expect(peak).toBe(3);
		// Order is the order the links were sent in, as it was under Promise.all.
		expect(body.embeds.map((embed) => embed.href)).toEqual(urls);
	});

	it('keeps going past a provider that fails', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes(encodeURIComponent('vimeo.com/2'))
				? new Response('nope', { status: 500 })
				: Response.json({ title: 'ok' })
		);
		const urls = ['https://vimeo.com/1', 'https://vimeo.com/2', 'https://vimeo.com/3'];

		const response = await postWith(urls, fetchMock as typeof fetch);
		const body = (await response.json()) as { embeds: { href: string }[] };

		expect(body.embeds.map((embed) => embed.href)).toEqual([
			'https://vimeo.com/1',
			'https://vimeo.com/3'
		]);
	});

	it('refuses a caller with no session', async () => {
		const event = fakeEvent({ db: undefined as never, user: null, json: { urls: [] } });
		const result = await runAndCatch(() => POST(event));
		expect(result).toMatchObject({ status: 401 });
	});
});
