import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	cachedOembed,
	clearOembedCache,
	EMBED_REQUEST_TIMEOUT_MS,
	embedErrorDetails,
	embedSpecFor,
	fetchEmbedDetails,
	fetchEmbedDetailsResult,
	fetchEmbedMetadata,
	fetchOembed,
	isSafeHttpUrl,
	MAX_CONCURRENT_EMBED_REQUESTS
} from './embeds';

describe('isSafeHttpUrl', () => {
	it.each([
		'https://example.com/a',
		'http://example.com',
		['HTTPS://EXAMPLE.COM/A', 'case-insensitive scheme']
	])('accepts %s', (href) => {
		expect(isSafeHttpUrl(href as string)).toBe(true);
	});

	it.each([
		'javascript:alert(1)',
		'data:text/html,<script>',
		'vbscript:x',
		'//example.com',
		'ftp://example.com',
		'not a url'
	])('rejects %s', (href) => {
		expect(isSafeHttpUrl(href)).toBe(false);
	});
});

describe('embedSpecFor', () => {
	it('builds the redgifs player iframe from a watch URL', () => {
		expect(embedSpecFor('https://www.redgifs.com/watch/abc123-definitely')).toEqual({
			kind: 'iframe',
			src: 'https://www.redgifs.com/ifr/abc123-definitely',
			title: 'Redgifs video'
		});
	});

	it('accepts the bare redgifs domain', () => {
		expect(embedSpecFor('https://redgifs.com/watch/someid')).toMatchObject({
			kind: 'iframe',
			src: 'https://www.redgifs.com/ifr/someid'
		});
	});

	it('leaves other redgifs paths as plain links', () => {
		expect(embedSpecFor('https://www.redgifs.com/browse')).toBeNull();
	});

	it('extracts the id from every youtube URL shape', () => {
		const expectEmbed = (href: string, id: string) =>
			expect(embedSpecFor(href)).toMatchObject({
				kind: 'iframe',
				src: `https://www.youtube-nocookie.com/embed/${id}`
			});

		expectEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ');
		expectEmbed('https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ');
		expectEmbed('https://www.youtube.com/shorts/abcDEF123-4', 'abcDEF123-4');
	});

	it('rejects malformed youtube ids', () => {
		expect(embedSpecFor('https://youtu.be/')).toBeNull();
		expect(embedSpecFor(`https://youtu.be/${'x'.repeat(40)}`)).toBeNull();
	});

	it('classifies reddit comment threads as server-proxied embeds', () => {
		expect(embedSpecFor('https://www.reddit.com/r/askreddit/comments/abc123/a_title/')).toEqual({
			kind: 'server-oembed',
			url: 'https://www.reddit.com/r/askreddit/comments/abc123/a_title/'
		});
	});

	it('also classifies reddit share links (the /s/<id> short form)', () => {
		expect(embedSpecFor('https://www.reddit.com/r/freeuse/s/eBGQNK85qk')).toEqual({
			kind: 'server-oembed',
			url: 'https://www.reddit.com/r/freeuse/s/eBGQNK85qk'
		});
	});

	it('leaves reddit non-post pages as plain links', () => {
		expect(embedSpecFor('https://www.reddit.com/r/askreddit')).toBeNull();
		expect(embedSpecFor('https://www.reddit.com/user/someone')).toBeNull();
	});

	it('embeds direct image links from any host', () => {
		expect(embedSpecFor('https://i.imgur.com/photo.jpeg')).toEqual({
			kind: 'image',
			url: 'https://i.imgur.com/photo.jpeg'
		});
		expect(embedSpecFor('https://example.com/pic.PNG?size=large')).toMatchObject({ kind: 'image' });
	});

	it('does not treat query strings as image extensions', () => {
		expect(embedSpecFor('https://example.com/download?file=x.jpg')).toBeNull();
	});

	it('routes known noembed hosts to the aggregator', () => {
		for (const href of [
			'https://vimeo.com/123456',
			'https://open.spotify.com/track/abc',
			'https://x.com/user/status/123',
			'https://soundcloud.com/artist/song'
		]) {
			expect(embedSpecFor(href)).toEqual({
				kind: 'oembed',
				endpoint: `https://noembed.com/embed?url=${encodeURIComponent(href)}`
			});
		}
	});

	it('leaves unknown hosts as plain links', () => {
		expect(embedSpecFor('https://example.com/page')).toBeNull();
	});

	it('never classifies a non-http scheme as an embed', () => {
		expect(embedSpecFor('javascript:alert(1)')).toBeNull();
		expect(embedSpecFor('javascript://www.redgifs.com/watch/ok')).toBeNull();
		expect(embedSpecFor('data:image/png;base64,abcd')).toBeNull();
	});
});

describe('fetchOembed', () => {
	afterEach(() => clearOembedCache());

	it('reads the standard oembed fields and caches the result', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				title: 'A post',
				provider_name: 'Reddit',
				thumbnail_url: 'https://example.com/t.jpg',
				html: '<iframe src="https://embed.example.com"></iframe>'
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await fetchOembed('https://noembed.test/1');
		expect(result).toEqual({
			title: 'A post',
			providerName: 'Reddit',
			description: null,
			thumbnailUrl: 'https://example.com/t.jpg',
			html: '<iframe src="https://embed.example.com"></iframe>',
			permalink: null,
			outbound: null,
			height: null
		});
		expect(cachedOembed('https://noembed.test/1')).toEqual(result);
	});

	it('drops a thumbnail that is not a safe http url', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ title: 't', thumbnail_url: 'javascript:1' }))
		);
		const result = await fetchOembed('https://noembed.test/2');
		expect(result).not.toBe('error');
		if (result === 'error') {
			throw new Error('expected oEmbed result');
		}
		expect(result.thumbnailUrl).toBeNull();
	});

	it('caches failures as error rather than throwing or retrying', async () => {
		const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);
		await fetchOembed('https://noembed.test/3');
		await fetchOembed('https://noembed.test/3');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(await fetchOembed('https://noembed.test/3')).toBe('error');
	});
});

describe('embed request queue', () => {
	afterEach(() => {
		clearOembedCache();
		vi.unstubAllGlobals();
	});

	/**
	 * A fetch that never answers until the test says so, counting how many
	 * requests are open at once — the thing the queue exists to bound.
	 */
	function heldFetch() {
		const held: { url: string; release: () => void }[] = [];
		let open = 0;
		let peak = 0;
		const fetchMock = vi.fn(
			(input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((resolve) => {
					open += 1;
					peak = Math.max(peak, open);
					const url = String(input);
					const body =
						typeof init?.body === 'string' ? (JSON.parse(init.body) as { urls: string[] }) : null;
					held.push({
						url: body ? body.urls[0] : url,
						release: () => {
							open -= 1;
							resolve(
								body
									? Response.json({
											embeds: [{ href: body.urls[0], kind: 'card', title: 't' }]
										})
									: Response.json({ title: url })
							);
						}
					});
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		return {
			fetchMock,
			held,
			get open() {
				return open;
			},
			get peak() {
				return peak;
			}
		};
	}

	const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

	it('allows at most three lookups in flight when a hundred links arrive at once', async () => {
		expect(MAX_CONCURRENT_EMBED_REQUESTS).toBe(3);
		const net = heldFetch();
		const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/${i}`);
		const all = Promise.all(urls.map((url) => fetchEmbedDetails(url)));

		await flush();
		expect(net.fetchMock).toHaveBeenCalledTimes(3);

		// Drain one at a time: every release lets exactly one more start.
		for (let released = 0; released < urls.length; released += 1) {
			net.held[released].release();
			await flush();
			expect(net.open).toBeLessThanOrEqual(3);
		}
		const results = await all;
		expect(net.peak).toBe(3);
		expect(net.fetchMock).toHaveBeenCalledTimes(100);
		expect(results.map((result) => result?.href)).toEqual(urls);
	});

	it('works through the queue in the order the links arrived', async () => {
		const net = heldFetch();
		const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`);
		const all = Promise.all(urls.map((url) => fetchEmbedDetails(url)));
		for (let i = 0; i < urls.length; i += 1) {
			await flush();
			net.held[i].release();
		}
		await all;
		expect(net.held.map((request) => request.url)).toEqual(urls);
	});

	it('shares one limit between reader oEmbed fetches and composer lookups', async () => {
		const net = heldFetch();
		const pending = [
			fetchOembed('https://noembed.test/a'),
			fetchOembed('https://noembed.test/b'),
			fetchEmbedDetails('https://example.com/c'),
			fetchEmbedDetails('https://example.com/d'),
			fetchOembed('https://noembed.test/e')
		];
		await flush();
		expect(net.open).toBe(3);
		for (let i = 0; i < pending.length; i += 1) {
			await flush();
			net.held[i].release();
		}
		await Promise.all(pending);
		expect(net.peak).toBe(3);
	});

	it('frees a slot when a lookup fails', async () => {
		const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);
		const results = await Promise.all(
			Array.from({ length: 10 }, (_, i) => fetchOembed(`https://noembed.test/fail-${i}`))
		);
		expect(results.every((result) => result === 'error')).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(10);
	});

	it('does not queue the send path behind background previews', async () => {
		const net = heldFetch();
		void Promise.all(
			Array.from({ length: 5 }, (_, i) => fetchEmbedDetails(`https://example.com/${i}`))
		);
		await flush();
		expect(net.open).toBe(3);

		const send = fetchEmbedMetadata(['https://example.com/send']);
		await flush();
		expect(net.open).toBe(4);
		net.held.find((request) => request.url === 'https://example.com/send')?.release();
		await expect(send).resolves.toHaveLength(1);

		// Drained before the next case: the queue is page-wide, so requests left
		// hanging here would hold its slots for every test after this one.
		for (let i = 0; i < 5; i += 1) {
			for (const request of net.held.filter((r) => r.url !== 'https://example.com/send')) {
				request.release();
			}
			await flush();
		}
	});

	it('gives up on a lookup that never answers, so the queue keeps moving', async () => {
		vi.useFakeTimers();
		try {
			// Honours the abort signal, as a real fetch does; otherwise hangs.
			vi.stubGlobal(
				'fetch',
				vi.fn(
					(_input: RequestInfo | URL, init?: RequestInit) =>
						new Promise<Response>((_resolve, reject) => {
							init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
						})
				)
			);
			const results = Array.from({ length: 4 }, (_, i) =>
				fetchEmbedDetailsResult(`https://example.com/hang-${i}`)
			);
			await vi.advanceTimersByTimeAsync(EMBED_REQUEST_TIMEOUT_MS);
			// The first three timed out and freed their slots; the fourth is now in
			// flight and times out one period later.
			await vi.advanceTimersByTimeAsync(EMBED_REQUEST_TIMEOUT_MS);
			await expect(Promise.all(results)).resolves.toEqual(
				Array.from({ length: 4 }, () => ({
					ok: false,
					error: 'Timed out loading this preview'
				}))
			);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('fetchEmbedDetailsResult', () => {
	afterEach(() => {
		clearOembedCache();
		vi.unstubAllGlobals();
	});

	it('hands back the details for the URL it was asked about', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ embeds: [{ href: 'https://vimeo.com/1', title: 'Clip' }] }))
		);
		await expect(fetchEmbedDetailsResult('https://vimeo.com/1')).resolves.toMatchObject({
			ok: true,
			details: { title: 'Clip' }
		});
	});

	it("uses the server's own message for a refused request", async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Not signed in' }, { status: 401 }))
		);
		await expect(fetchEmbedDetailsResult('https://vimeo.com/1')).resolves.toEqual({
			ok: false,
			error: "Couldn't load this preview (Not signed in)"
		});
	});

	it('falls back to the status when the error has no message', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('boom', { status: 500 }))
		);
		await expect(fetchEmbedDetailsResult('https://vimeo.com/1')).resolves.toEqual({
			ok: false,
			error: "Couldn't load this preview (HTTP 500)"
		});
	});

	it('names a payload it cannot read', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('<html>', { status: 200 }))
		);
		await expect(fetchEmbedDetailsResult('https://vimeo.com/1')).resolves.toEqual({
			ok: false,
			error: "Couldn't load this preview (unexpected response)"
		});
	});

	it('remembers a failure rather than asking again', async () => {
		const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);
		await fetchEmbedDetailsResult('https://vimeo.com/1');
		await fetchEmbedDetailsResult('https://vimeo.com/1');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('still reports a plain null through fetchEmbedDetails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('boom', { status: 500 }))
		);
		await expect(fetchEmbedDetails('https://vimeo.com/1')).resolves.toBeNull();
	});
});

describe('embedErrorDetails', () => {
	it('is a card titled with the error and named for the host', () => {
		expect(embedErrorDetails('https://www.vimeo.com/1', 'Nope')).toMatchObject({
			href: 'https://www.vimeo.com/1',
			kind: 'card',
			title: 'Nope',
			providerName: 'vimeo.com',
			imageUrl: null,
			iframeSrc: null
		});
	});
});
