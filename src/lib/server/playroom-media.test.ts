import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REDGIFS_TOKEN_URL, SOURCES } from '$lib/playroom/iq-test/media';
import {
	clearMediaCache,
	MEDIA_FAILURE_BACKOFF_MS,
	MEDIA_TTL_MS,
	mediaFor
} from './playroom-media';

beforeEach(() => clearMediaCache());
afterEach(() => clearMediaCache());

const atom = (image: string) =>
	`<feed><content type="html">&lt;a href=&quot;https://i.redd.it/${image}.jpg&quot;&gt;[link]&lt;/a&gt;</content></feed>`;

const redgifsAnswer = (id: string) => ({
	gifs: [
		{
			id,
			hasAudio: true,
			urls: {
				poster: `https://media.redgifs.com/${id}-poster.jpg`,
				sd: `https://media.redgifs.com/${id}-mobile.mp4`
			}
		}
	]
});

type Answer = Response | (() => Response);

/**
 * A fetch that answers by URL: the token, each tag search, each subreddit.
 * Anything not given an answer is a 500, so an unexpected request shows up.
 */
function fakeFetch(answers: {
	token?: Answer;
	reddit?: Answer;
	redgifs?: (tag: string) => Answer;
}) {
	const call = (answer: Answer | undefined) => {
		if (answer === undefined) {
			return new Response('', { status: 500 });
		}
		return typeof answer === 'function' ? answer() : answer.clone();
	};
	return vi.fn((input: string | URL | Request) => {
		const url = new URL(String(input));
		if (url.href === REDGIFS_TOKEN_URL) {
			return Promise.resolve(call(answers.token ?? Response.json({ token: 'tok' })));
		}
		if (url.hostname === 'api.redgifs.com') {
			const tag = url.searchParams.get('tags') ?? '';
			const id = tag.toLowerCase().replaceAll(' ', '');
			return Promise.resolve(call(answers.redgifs?.(tag) ?? Response.json(redgifsAnswer(id))));
		}
		return Promise.resolve(call(answers.reddit));
	});
}

const asFetch = (fn: ReturnType<typeof fakeFetch>) => fn as unknown as typeof fetch;
const urls = (fn: ReturnType<typeof fakeFetch>) => fn.mock.calls.map(([input]) => String(input));

describe('mediaFor', () => {
	it('asks every source for the vibe, and only those, and merges what they give', async () => {
		const fetchFn = fakeFetch({ reddit: new Response(atom('locked')) });
		const feed = await mediaFor('denial', asFetch(fetchFn), 0);

		expect(feed.clips.map((clip) => clip.id)).toEqual(['chastity', 'edging', 'orgasmdenial']);
		expect(feed.clips[0]).toEqual({
			id: 'chastity',
			video: 'https://media.redgifs.com/chastity-mobile.mp4',
			sound: true
		});
		expect(feed.images).toContain('https://i.redd.it/locked.jpg');
		expect(feed.images).toContain('https://media.redgifs.com/chastity-poster.jpg');

		const asked = urls(fetchFn);
		expect(asked.filter((url) => url.includes('/gifs/search'))).toHaveLength(
			SOURCES.denial.filter((source) => source.kind === 'redgifs').length
		);
		expect(asked).toContain('https://www.reddit.com/r/chastity/top/.rss?t=week');
	});

	it("gets one Redgifs token for a vibe's parallel searches, and searches by tag", async () => {
		const fetchFn = fakeFetch({ reddit: new Response(atom('x')) });
		await mediaFor('feminisation', asFetch(fetchFn), 0);
		expect(urls(fetchFn).filter((url) => url === REDGIFS_TOKEN_URL)).toHaveLength(1);
		expect(urls(fetchFn)).toContain(
			'https://api.redgifs.com/v2/gifs/search?tags=Feminization&order=trending&count=40'
		);
		const searches = fetchFn.mock.calls.filter(([input]) => String(input).includes('/gifs/search'));
		expect(searches.length).toBeGreaterThan(0);
	});

	it('still has pictures for a vibe whose reddit top-up is rate-limited', async () => {
		const fetchFn = fakeFetch({
			reddit: new Response('', { status: 429, headers: { 'x-ratelimit-reset': '30' } })
		});
		const feed = await mediaFor('denial', asFetch(fetchFn), 0);
		expect(feed.clips.length).toBeGreaterThan(0);
	});

	it("honours reddit's reset time across vibes, then asks again once it has passed", async () => {
		const limited = fakeFetch({
			reddit: new Response('', { status: 429, headers: { 'x-ratelimit-reset': '30' } })
		});
		await mediaFor('denial', asFetch(limited), 0);

		// Another vibe inside the window does not ask reddit at all.
		const during = fakeFetch({ reddit: new Response(atom('sissy')) });
		await mediaFor('feminisation', asFetch(during), 10_000);
		expect(urls(during).some((url) => url.includes('reddit.com'))).toBe(false);

		// After it, it does, and the picture is in.
		const after = fakeFetch({ reddit: new Response(atom('sissy')) });
		const feed = await mediaFor('feminisation', asFetch(after), 31_000);
		expect(feed.images).toContain('https://i.redd.it/sissy.jpg');
	});

	it('serves fresh answers from the cache without asking again', async () => {
		const fetchFn = fakeFetch({ reddit: new Response(atom('one')) });
		await mediaFor('bambi', asFetch(fetchFn), 0);
		const calls = fetchFn.mock.calls.length;
		await mediaFor('bambi', asFetch(fetchFn), MEDIA_TTL_MS - 1);
		expect(fetchFn.mock.calls.length).toBe(calls);
	});

	it('shares one fetch per source between concurrent requests', async () => {
		const fetchFn = fakeFetch({ reddit: new Response(atom('one')) });
		const [a, b] = await Promise.all([
			mediaFor('bambi', asFetch(fetchFn), 0),
			mediaFor('bambi', asFetch(fetchFn), 0)
		]);
		expect(a).toEqual(b);
		// One token, then one request per source.
		expect(fetchFn.mock.calls.length).toBe(SOURCES.bambi.length + 1);
	});

	it('keeps serving the last good answer when a source fails, and backs off before retrying', async () => {
		const good = fakeFetch({ reddit: new Response(atom('one')) });
		const first = await mediaFor('bambi', asFetch(good), 0);

		const failing = vi.fn(() => Promise.reject(new TypeError('network down')));
		const stale = await mediaFor('bambi', failing as unknown as typeof fetch, MEDIA_TTL_MS + 1);
		expect(stale).toEqual(first);

		const callsAfterFailure = failing.mock.calls.length;
		await mediaFor(
			'bambi',
			failing as unknown as typeof fetch,
			MEDIA_TTL_MS + MEDIA_FAILURE_BACKOFF_MS - 1
		);
		expect(failing.mock.calls.length).toBe(callsAfterFailure);
	});

	it('asks for a new token when Redgifs refuses the old one', async () => {
		const refusing = fakeFetch({ redgifs: () => new Response('', { status: 401 }) });
		await mediaFor('degradation', asFetch(refusing), 0);

		const fetchFn = fakeFetch({});
		await mediaFor('degradation', asFetch(fetchFn), MEDIA_FAILURE_BACKOFF_MS + 1);
		expect(urls(fetchFn)).toContain(REDGIFS_TOKEN_URL);
	});

	it('asks for a new token at once when a search refuses the one it had', async () => {
		// As when the tunnel takes over mid-isolate: a token is bound to the
		// address that fetched it, so the first search after the switch is a 401.
		let refusals = 1;
		const fetchFn = fakeFetch({
			redgifs: () => {
				if (refusals > 0) {
					refusals -= 1;
					return new Response('', { status: 401 });
				}
				return Response.json({ gifs: [] });
			}
		});
		await mediaFor('gooner', asFetch(fetchFn), 0);
		expect(urls(fetchFn).filter((url) => url === REDGIFS_TOKEN_URL)).toHaveLength(2);
	});

	it('answers an empty feed, never an error, when nothing can answer', async () => {
		const failing = vi.fn(() => Promise.resolve(new Response('', { status: 503 })));
		await expect(mediaFor('degradation', failing as unknown as typeof fetch, 0)).resolves.toEqual({
			images: [],
			clips: [],
			origins: {}
		});
	});
});
