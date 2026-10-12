import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearMediaCache } from '$lib/server/playroom-media';
import { fakeEvent } from '$lib/testing/events';
import { GET } from './+server';

afterEach(() => clearMediaCache());

const FEED =
	'<feed><content type="html">&lt;a href=&quot;https://i.redd.it/abc.jpg&quot;&gt;[link]&lt;/a&gt;</content></feed>';

describe('GET /api/playroom/iq-test/media', () => {
	it('is public, and returns the vibe’s pictures with a cache header', async () => {
		const fetchFn = vi.fn(async () => new Response(FEED));
		const response = await GET(
			fakeEvent({ user: null, path: '/api/playroom/iq-test/media?vibe=misogyny', fetch: fetchFn })
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
		await expect(response.json()).resolves.toEqual({
			images: ['https://i.redd.it/abc.jpg'],
			clips: [],
			origins: {}
		});
	});

	it('refuses anything but a known vibe, so it cannot be pointed elsewhere', async () => {
		const fetchFn = vi.fn();
		const response = await GET(
			fakeEvent({
				user: null,
				path: '/api/playroom/iq-test/media?vibe=https://evil.example',
				fetch: fetchFn
			})
		);
		expect(response.status).toBe(400);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('never caches an empty feed, so the page can ask again', async () => {
		const fetchFn = vi.fn(async () => new Response('', { status: 429 }));
		const response = await GET(
			fakeEvent({ user: null, path: '/api/playroom/iq-test/media?vibe=denial', fetch: fetchFn })
		);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
