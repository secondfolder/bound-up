import { createRawSnippet } from 'svelte';
import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UrlEmbed, { NARROW_EMBED_MEDIA_QUERY } from './UrlEmbed.svelte';
import { clearOembedCache, type CachedEmbedDetails, type EmbedSpec } from '$lib/embeds';
import { waProp } from '$lib/testing/web-awesome';

const observers: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
	callback: IntersectionObserverCallback;
	elements = new Set<Element>();
	root: Element | Document | null;
	rootMargin: string;
	thresholds: ReadonlyArray<number>;
	observe = vi.fn((element: Element) => {
		this.elements.add(element);
	});
	unobserve = vi.fn((element: Element) => {
		this.elements.delete(element);
	});
	disconnect = vi.fn(() => {
		this.elements.clear();
	});
	takeRecords = vi.fn(() => []);

	constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
		this.callback = callback;
		this.root = options.root ?? null;
		this.rootMargin = options.rootMargin ?? '0px';
		this.thresholds = Array.isArray(options.threshold)
			? options.threshold
			: [options.threshold ?? 0];
		observers.push(this);
	}

	emit(element: Element, isIntersecting: boolean, intersectionRatio = 1) {
		this.callback(
			[
				{
					time: 0,
					target: element,
					isIntersecting,
					intersectionRatio,
					boundingClientRect: {
						top: 0,
						bottom: 120,
						left: 0,
						right: 120,
						width: 120,
						height: 120,
						x: 0,
						y: 0,
						toJSON: () => ({})
					},
					rootBounds: null,
					intersectionRect: {
						top: 0,
						bottom: isIntersecting ? 120 : 0,
						left: 0,
						right: isIntersecting ? 120 : 0,
						width: isIntersecting ? 120 : 0,
						height: isIntersecting ? 120 : 0,
						x: 0,
						y: 0,
						toJSON: () => ({})
					}
				} as IntersectionObserverEntry
			],
			this as unknown as IntersectionObserver
		);
	}
}

/**
 * The refresh button. A `wa-button`, whose role belongs to the native button in
 * its shadow root, where testing-library's role queries do not look — so it is
 * found by element instead.
 */
/**
 * True while the embed is waiting for something to show and draws nothing.
 *
 * The wrapper is always there — the scrollport observer watches it — so
 * "nothing" means a wrapper with no elements in it.
 */
function isHolding(container: HTMLElement): boolean {
	const root = container.querySelector('.url-embed');
	if (!root) throw new Error('expected the embed wrapper');
	return root.children.length === 0;
}

function refreshButton(container: HTMLElement): HTMLElement {
	const button = container.querySelector<HTMLElement>('wa-button.refresh');
	if (!button) throw new Error('expected a refresh button');
	return button;
}

function installIntersectionObserverMock() {
	observers.length = 0;
	vi.stubGlobal(
		'IntersectionObserver',
		MockIntersectionObserver as unknown as typeof IntersectionObserver
	);
}

function emitIntersection(element: Element, isIntersecting: boolean, intersectionRatio = 1) {
	const observer = observers.find((candidate) => candidate.elements.has(element));
	if (!observer) throw new Error('expected observed element');
	observer.emit(element, isIntersecting, intersectionRatio);
}

/**
 * A `matchMedia` that can be flipped.
 *
 * The real one answers from the test frame, which the Vitest config pins at a
 * desktop width, so the narrow query never matches — which is what every other
 * test wants. The narrow-window path needs one that matches and can emit a
 * `change` when the window is resized or the phone turned. Only the narrow
 * query is faked; everything else still goes to the browser.
 */
const realMatchMedia = window.matchMedia;

function installMatchMedia(matching: boolean) {
	const listeners = new Set<(event: MediaQueryListEvent) => void>();
	let matches = matching;
	const list = {
		get matches() {
			return matches;
		},
		media: NARROW_EMBED_MEDIA_QUERY,
		onchange: null,
		addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
			listeners.add(listener);
		},
		removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
			listeners.delete(listener);
		},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => true,
		/** Test-only: crosses the breakpoint the way a resize would. */
		set(next: boolean) {
			matches = next;
			for (const listener of [...listeners]) {
				listener({ matches: next, media: NARROW_EMBED_MEDIA_QUERY } as MediaQueryListEvent);
			}
		}
	};
	window.matchMedia = ((query: string) =>
		query === NARROW_EMBED_MEDIA_QUERY
			? list
			: realMatchMedia(query)) as unknown as typeof window.matchMedia;
	return list;
}

afterEach(() => {
	clearOembedCache();
	vi.unstubAllGlobals();
	window.matchMedia = realMatchMedia;
});

describe('UrlEmbed', () => {
	it('renders the redgifs player iframe with the sandbox set', () => {
		const { container } = render(UrlEmbed, {
			props: {
				spec: {
					kind: 'iframe',
					src: 'https://www.redgifs.com/ifr/abc123',
					title: 'Redgifs video'
				},
				href: 'https://www.redgifs.com/watch/abc123',
				label: 'https://www.redgifs.com/watch/abc123'
			}
		});
		const iframe = container.querySelector('iframe');
		expect(iframe?.getAttribute('src')).toBe('https://www.redgifs.com/ifr/abc123');
		expect(iframe?.getAttribute('title')).toBe('Redgifs video');
		// allow-top-navigation must NOT be grantable by message content.
		expect(iframe?.getAttribute('sandbox')).not.toContain('allow-top-navigation');
		expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts');
		expect(container.textContent).toContain('Loading embed');
	});

	it('keeps the loading overlay over an iframe until it loads', async () => {
		const { container } = render(UrlEmbed, {
			props: {
				spec: {
					kind: 'iframe',
					src: 'https://www.redgifs.com/ifr/abc123',
					title: 'Redgifs video'
				},
				href: 'https://www.redgifs.com/watch/abc123',
				label: 'https://www.redgifs.com/watch/abc123'
			}
		});
		const frame = container.querySelector('iframe');
		expect(container.querySelector('.loading-overlay')).not.toBeNull();
		if (!frame) throw new Error('expected iframe');
		await fireEvent.load(frame);
		expect(container.querySelector('.loading-overlay')).toBeNull();
	});

	it('renders a direct image with alt text from the label', () => {
		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'image', url: 'https://i.imgur.com/cat.jpg' },
				href: 'https://i.imgur.com/cat.jpg',
				label: 'https://i.imgur.com/cat.jpg'
			}
		});
		expect(container.querySelector('img')?.getAttribute('alt')).toBe('https://i.imgur.com/cat.jpg');
	});

	it('renders a sandboxed iframe when oEmbed html exposes one directly', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					title: 'A post',
					provider_name: 'Reddit',
					html: '<iframe src="https://embed.example.com/x"></iframe><script>alert(1)</script><img src=x onerror=alert(2)>'
				})
			)
		);
		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/1' },
				href: 'https://www.reddit.com/r/x/comments/1/a/',
				label: 'reddit link'
			}
		});
		// The fetch resolves in an $effect; wait for it to land.
		await vi.waitFor(() => {
			expect(container.querySelector('.player iframe')).not.toBeNull();
		});
		const frame = container.querySelector('.player iframe');
		expect(frame?.getAttribute('src')).toBe('https://embed.example.com/x');
		expect(frame?.getAttribute('sandbox')).toContain('allow-scripts');
	});

	it('falls back to a plain link when the oEmbed fetch fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('nope', { status: 500 }))
		);
		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/2' },
				href: 'https://vimeo.com/1',
				label: 'vimeo link'
			}
		});
		await vi.waitFor(() => {
			expect(container.querySelector('a')?.getAttribute('href')).toBe('https://vimeo.com/1');
		});
		expect(container.querySelector('.player iframe')).toBeNull();
	});

	it('falls back to the metadata card when oEmbed html has no direct iframe', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					title: 'A card-only post',
					provider_name: 'Provider',
					html: '<blockquote>needs a script loader</blockquote>'
				})
			)
		);
		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/4' },
				href: 'https://provider.example/post',
				label: 'provider link'
			}
		});
		await vi.waitFor(() => {
			expect(container.querySelector('.card')).not.toBeNull();
		});
		expect(container.querySelector('.player iframe')).toBeNull();
	});

	it('draws nothing at all while the oEmbed is in flight', () => {
		// Not the plain link it used to show — a link that turns into a card a
		// moment later moves everything under it — and not a skeleton either,
		// which was swapped for the card a moment later: two flashes for one
		// embed. It appears once, when it has something real to show.
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise(() => {}))
		);
		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/3' },
				href: 'https://vimeo.com/2',
				label: 'vimeo link'
			}
		});
		expect(isHolding(container)).toBe(true);
		expect(container.querySelector('a')).toBeNull();
	});

	it('renders from cached metadata without fetching again', () => {
		const fetchMock = vi.fn(() => new Promise(() => {}));
		vi.stubGlobal('fetch', fetchMock);
		const cached = {
			href: 'https://vimeo.com/2',
			fetchedAt: Date.now(),
			kind: 'card',
			providerName: 'Vimeo',
			title: 'Cached title',
			description: null,
			thumbnailUrl: 'https://example.com/thumb.jpg',
			canonicalUrl: 'https://vimeo.com/2',
			imageUrl: null,
			iframeSrc: null,
			iframeHeight: null,
			faviconUrl: null,
			themeColor: null
		} satisfies CachedEmbedDetails;

		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/cached' },
				href: cached.href,
				label: 'vimeo link',
				cached
			}
		});

		expect(fetchMock).not.toHaveBeenCalled();
		expect(container.querySelector('.card')?.textContent).toContain('Cached title');
	});

	it('draws a cached card without waiting for the scrollport', () => {
		// Nothing to look up, so nothing to defer: the details are already here.
		installIntersectionObserverMock();
		const fetchMock = vi.fn(() => new Promise(() => {}));
		vi.stubGlobal('fetch', fetchMock);
		const cached = {
			href: 'https://vimeo.com/2',
			fetchedAt: Date.now(),
			kind: 'card',
			providerName: 'Vimeo',
			title: 'Cached title',
			description: null,
			thumbnailUrl: 'https://example.com/thumb.jpg',
			canonicalUrl: 'https://vimeo.com/2',
			imageUrl: null,
			iframeSrc: null,
			iframeHeight: null,
			faviconUrl: null,
			themeColor: null
		} satisfies CachedEmbedDetails;

		const { container, queryByRole } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/cached-manual' },
				href: cached.href,
				label: 'vimeo link',
				cached
			}
		});

		expect(queryByRole('button', { name: 'Show' })).toBeNull();
		expect(container.querySelector('.card')?.textContent).toContain('Cached title');
		expect(isHolding(container)).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('draws nothing for an embed whose cached details are still decrypting', () => {
		installIntersectionObserverMock();
		const fetchMock = vi.fn(() => new Promise(() => {}));
		vi.stubGlobal('fetch', fetchMock);
		const cached = {
			href: 'https://vimeo.com/2',
			fetchedAt: Date.now(),
			kind: 'card',
			providerName: 'Vimeo',
			title: 'Cached title',
			description: null,
			thumbnailUrl: 'https://example.com/thumb.jpg',
			canonicalUrl: 'https://vimeo.com/2',
			imageUrl: null,
			iframeSrc: null,
			iframeHeight: null,
			faviconUrl: null,
			themeColor: null
		} satisfies CachedEmbedDetails;

		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/cached-auto' },
				href: cached.href,
				label: 'vimeo link',
				// Still being decrypted, so the cached entry is not usable yet.
				cachedPending: true
			}
		});

		expect(isHolding(container)).toBe(true);
		expect(container.querySelector('img')).toBeNull();
		expect(container.querySelector('iframe')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('waits for visibility before fetching an embed it has to look up', async () => {
		installIntersectionObserverMock();
		const fetchMock = vi.fn(async () =>
			Response.json({
				title: 'Fetched title',
				provider_name: 'Provider',
				html: '<iframe src="https://embed.example.com/x"></iframe>'
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/auto' },
				href: 'https://vimeo.com/2',
				label: 'vimeo link'
			}
		});

		expect(isHolding(container)).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
		// Empty, but still observed: an embed that draws nothing until it loads
		// must still be able to tell when it has scrolled into view.
		emitIntersection(container.querySelector('.url-embed')!, true, 1);

		await vi.waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
		await vi.waitFor(() => {
			expect(container.querySelector('.player iframe')).not.toBeNull();
		});
	});

	it('shows a refresh button for cached metadata and calls it on click', async () => {
		const onRefresh = vi.fn(async () => undefined);
		const cached = {
			href: 'https://vimeo.com/2',
			fetchedAt: Date.now(),
			kind: 'card',
			providerName: 'Vimeo',
			title: 'Cached title',
			description: null,
			thumbnailUrl: 'https://example.com/thumb.jpg',
			canonicalUrl: 'https://vimeo.com/2',
			imageUrl: null,
			iframeSrc: null,
			iframeHeight: null,
			faviconUrl: null,
			themeColor: null
		} satisfies CachedEmbedDetails;

		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/cached' },
				href: cached.href,
				label: 'vimeo link',
				cached,
				onRefresh
			}
		});

		expect(waProp(refreshButton(container).querySelector('wa-icon'), 'label')).toBe(
			'Refresh preview'
		);
		await fireEvent.click(refreshButton(container));
		expect(onRefresh).toHaveBeenCalledWith('https://vimeo.com/2');
	});

	it('turns the refresh icon into a spinner while a refresh is pending', async () => {
		const resolver: { current: (() => void) | null } = { current: null };
		const onRefresh = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolver.current = resolve;
				})
		);
		const cached = {
			href: 'https://vimeo.com/2',
			fetchedAt: Date.now(),
			kind: 'card',
			providerName: 'Vimeo',
			title: 'Cached title',
			description: null,
			thumbnailUrl: 'https://example.com/thumb.jpg',
			canonicalUrl: 'https://vimeo.com/2',
			imageUrl: null,
			iframeSrc: null,
			iframeHeight: null,
			faviconUrl: null,
			themeColor: null
		} satisfies CachedEmbedDetails;

		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/cached' },
				href: cached.href,
				label: 'vimeo link',
				cached,
				onRefresh
			}
		});

		await fireEvent.click(refreshButton(container));
		expect(container.querySelector('wa-spinner')).not.toBeNull();
		expect(container.querySelector('wa-icon')).toBeNull();
		if (!resolver.current) throw new Error('expected refresh resolver');
		resolver.current();
		await vi.waitFor(() => {
			expect(container.querySelector('wa-spinner')).toBeNull();
			expect(container.querySelector('wa-icon')).not.toBeNull();
		});
	});

	it('reports the activation once, so the caller can cache the details', async () => {
		installIntersectionObserverMock();
		const fetchMock = vi.fn(async () =>
			Response.json({
				title: 'Fetched title',
				provider_name: 'Provider',
				html: '<iframe src="https://embed.example.com/x"></iframe>'
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const onActivate = vi.fn();

		const { container } = render(UrlEmbed, {
			props: {
				spec: { kind: 'oembed', endpoint: 'https://oembed.test/activate' },
				href: 'https://vimeo.com/2',
				label: 'vimeo link',
				onActivate
			}
		});

		// Off screen: nothing has been fetched and nothing has been reported, so
		// opening a long thread does not backfill every link in it at once.
		expect(fetchMock).not.toHaveBeenCalled();
		expect(onActivate).not.toHaveBeenCalled();

		emitIntersection(container.querySelector('.url-embed')!, true, 1);
		await vi.waitFor(() => {
			expect(onActivate).toHaveBeenCalledWith('https://vimeo.com/2');
			expect(container.querySelector('.player iframe')).not.toBeNull();
		});
		expect(onActivate).toHaveBeenCalledTimes(1);
	});

	describe('server-proxied reddit embeds', () => {
		const redditProps = {
			spec: { kind: 'server-oembed', url: 'https://www.reddit.com/r/x/comments/1/a/' },
			href: 'https://www.reddit.com/r/x/comments/1/a/',
			label: 'reddit link'
		} satisfies {
			spec: Extract<EmbedSpec, { kind: 'server-oembed' }>;
			href: string;
			label: string;
		};

		it('waits for the scrollport, not for a click, before calling the proxy', async () => {
			// The click gate is gone: an embed the writer put in a message is one
			// the reader is meant to see. The viewport wait that is left is about
			// request volume, not consent.
			installIntersectionObserverMock();
			const fetchMock = vi.fn(() => new Promise(() => {}));
			vi.stubGlobal('fetch', fetchMock);
			const { container, queryByRole } = render(UrlEmbed, { props: redditProps });

			expect(queryByRole('button', { name: 'Show' })).toBeNull();
			expect(fetchMock).not.toHaveBeenCalled();

			emitIntersection(container.querySelector('.url-embed')!, true, 1);
			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});
		});

		it('draws nothing until the proxy resolves', async () => {
			const resolver: { current: ((response: Response) => void) | null } = { current: null };
			vi.stubGlobal(
				'fetch',
				vi.fn(
					() =>
						new Promise<Response>((resolve) => {
							resolver.current = resolve;
						})
				)
			);
			const { container, queryByText } = render(UrlEmbed, { props: redditProps });

			expect(isHolding(container)).toBe(true);
			expect(container.querySelector('.card')).toBeNull();

			// Waited for rather than read straight after render: the lookup is gated
			// on the embed scrolling into view, and a real IntersectionObserver
			// reports that a frame later, not synchronously.
			const settle = await vi.waitFor(() => {
				if (!resolver.current) throw new Error('expected pending fetch resolver');
				return resolver.current;
			});
			expect(container.querySelector('.card')).toBeNull();
			settle(
				Response.json({
					title: 'A post',
					provider_name: 'Reddit',
					permalink: 'https://www.reddit.com/r/x/comments/1/a/',
					outbound: null,
					html: '<blockquote><a href="https://www.reddit.com/x">A post</a></blockquote>',
					height: 600
				})
			);

			await vi.waitFor(() => {
				expect(container.querySelector('.card')).not.toBeNull();
			});
			expect(queryByText('Loading…')).toBeNull();
		});

		it('renders the outbound link natively when the proxy reports one', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () =>
					Response.json({
						title: 'A post',
						provider_name: 'Reddit',
						permalink: 'https://www.reddit.com/r/x/comments/1/a/',
						outbound: 'https://www.redgifs.com/watch/abc123'
					})
				)
			);
			const { container } = render(UrlEmbed, { props: redditProps });
			await vi.waitFor(() => {
				expect(container.querySelector('.player iframe')).not.toBeNull();
			});
			const card = container.querySelector('.card');
			expect(card?.textContent).toContain('Reddit');
			expect(card?.textContent).toContain('A post');
			expect(container.querySelector('.loading-overlay')).not.toBeNull();
			// The post's own redgifs link renders as our native player — not
			// reddit's frame, whose NSFW previews come back dead.
			const player = container.querySelector('.player iframe');
			expect(player?.getAttribute('src')).toBe('https://www.redgifs.com/ifr/abc123');
			expect(player?.closest('a')).toBeNull();
			expect(container.querySelector('iframe.reddit-frame')).toBeNull();
		});

		it('fetches through the same-origin proxy and frames the permalink', async () => {
			const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
				Response.json({
					title: 'A post',
					provider_name: 'Reddit',
					html: '<blockquote><a href="https://www.reddit.com/x">A post</a></blockquote>',
					height: 600,
					permalink: 'https://www.reddit.com/r/x/comments/1/a/',
					outbound: null
				})
			);
			vi.stubGlobal('fetch', fetchMock);
			const { container } = render(UrlEmbed, { props: redditProps });

			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});
			const firstCall = fetchMock.mock.calls.at(0);
			expect(firstCall?.[0]).toBe(`/api/oembed?url=${encodeURIComponent(redditProps.spec.url)}`);

			// The permalink is framed directly at embed.reddit.com — same-origin
			// is the frame's own origin, not ours — and the sanitized {@html}
			// path is not used when a permalink frame exists.
			await vi.waitFor(() => {
				expect(container.querySelector('iframe.reddit-frame')).not.toBeNull();
			});
			const frame = container.querySelector('iframe.reddit-frame');
			expect(frame?.getAttribute('src')).toBe(
				'https://embed.reddit.com/r/x/comments/1/a/?embed=true&ref_source=embed' +
					'&embed_host_url=' +
					// Wherever the page is actually served from — the test server's port
					// is not fixed.
					encodeURIComponent(window.location.origin)
			);
			expect(frame?.getAttribute('height')).toBe('600');
			expect(container.querySelector('.player iframe')).toBeNull();
		});
	});

	/**
	 * The Open button, a `wa-button`.
	 *
	 * Its role belongs to the native button in its shadow root, where
	 * testing-library's role queries do not look, so the host is both the
	 * assertion target and what a click goes to — Svelte's `onclick` is on the
	 * host. The accessible name it ends up with is the Playwright suite's
	 * business.
	 */
	function openButton(container: HTMLElement): HTMLElement {
		const button = container.querySelector('wa-button.open');
		if (!button) throw new Error('expected an Open button');
		return button as HTMLElement;
	}

	/**
	 * A hosted player's own chrome is built for a desktop-sized frame. Squeezed
	 * into a phone-width bubble, reddit's header and action bars cover the post
	 * itself, so below the breakpoint the frame is not built at all until the
	 * reader asks for it full screen.
	 */
	describe('on a narrow window', () => {
		const playerProps = {
			spec: {
				kind: 'iframe',
				src: 'https://www.redgifs.com/ifr/abc123',
				title: 'Redgifs video'
			} as EmbedSpec,
			href: 'https://www.redgifs.com/watch/abc123',
			label: 'https://www.redgifs.com/watch/abc123'
		};

		it('draws a button naming the embed instead of the frame', async () => {
			installMatchMedia(true);
			const { container } = render(UrlEmbed, { props: playerProps });

			await vi.waitFor(() => openButton(container));
			// Nothing loads until it is asked for: no frame, so no request.
			expect(container.querySelector('iframe')).toBeNull();
			// A curated player has no card of its own, so the head row it gets in
			// order to hold the button also has to say what the embed is.
			expect(container.querySelector('.head')?.textContent).toContain('redgifs.com');
			expect(container.querySelector('.head')?.textContent).toContain('Redgifs video');
		});

		it('builds the frame in a dialog headed by the site and title', async () => {
			installMatchMedia(true);
			const { container } = render(UrlEmbed, { props: playerProps });

			await vi.waitFor(() => openButton(container));
			await fireEvent.click(openButton(container));

			const dialog = container.querySelector('wa-dialog.embed-dialog');
			expect(dialog).not.toBeNull();
			// The dialog's own accessible name, for the browsers where the
			// header below is the thing that is visually hidden.
			expect(dialog?.getAttribute('label')).toBe('Redgifs video');
			const header = container.querySelector('.dialog-header');
			expect(header?.textContent).toContain('redgifs.com');
			expect(header?.textContent).toContain('Redgifs video');
			expect(waProp(header?.querySelector('wa-button.dialog-close wa-icon'), 'label')).toBe(
				'Close embed'
			);

			const frame = container.querySelector('.dialog-frame iframe');
			expect(frame?.getAttribute('src')).toBe('https://www.redgifs.com/ifr/abc123');
			// The same sandbox the inline frame gets: opening it bigger is not
			// a reason to hand message content top-level navigation.
			expect(frame?.getAttribute('sandbox')).toContain('allow-scripts');
			expect(frame?.getAttribute('sandbox')).not.toContain('allow-top-navigation');
		});

		it('unmounts the frame when the dialog closes, so a player stops', async () => {
			installMatchMedia(true);
			const { container } = render(UrlEmbed, { props: playerProps });

			await vi.waitFor(() => openButton(container));
			await fireEvent.click(openButton(container));
			expect(container.querySelector('iframe')).not.toBeNull();

			const close = container.querySelector('wa-button.dialog-close');
			if (!close) throw new Error('expected a close button');
			await fireEvent.click(close);

			expect(container.querySelector('wa-dialog.embed-dialog')).toBeNull();
			expect(container.querySelector('iframe')).toBeNull();
		});

		it('puts the frame back inline when the window widens', async () => {
			const media = installMatchMedia(true);
			const { container } = render(UrlEmbed, { props: playerProps });

			await vi.waitFor(() => openButton(container));
			await fireEvent.click(openButton(container));
			expect(container.querySelector('wa-dialog.embed-dialog')).not.toBeNull();

			// Turning a phone landscape crosses back over the breakpoint. The
			// overlay would otherwise sit over an embed that is now readable
			// where it is.
			media.set(false);
			await vi.waitFor(() => {
				expect(container.querySelector('.player iframe')).not.toBeNull();
			});
			expect(container.querySelector('wa-dialog.embed-dialog')).toBeNull();
			// And with nothing left to act on, the row it needed goes too.
			expect(container.querySelector('.actions')).toBeNull();
			expect(container.querySelector('.head')).toBeNull();
		});

		it('keeps the card and only replaces the frame under it', async () => {
			installMatchMedia(true);
			const cached = {
				href: 'https://provider.example/post',
				fetchedAt: Date.now(),
				kind: 'iframe',
				providerName: 'Provider',
				title: 'A framed post',
				description: null,
				thumbnailUrl: null,
				canonicalUrl: 'https://provider.example/post',
				imageUrl: null,
				iframeSrc: 'https://player.example/1',
				iframeHeight: 360,
				faviconUrl: null,
				themeColor: null
			} satisfies CachedEmbedDetails;

			const { container } = render(UrlEmbed, {
				props: {
					spec: { kind: 'oembed', endpoint: 'https://oembed.test/narrow-card' },
					href: cached.href,
					label: 'provider link',
					cached
				}
			});

			await vi.waitFor(() => openButton(container));
			// The title rides along hidden, so the button is still distinguishable
			// from every other "Open" in a thread.
			expect(openButton(container).textContent).toContain('A framed post');
			// The card is the head's own left half, so nothing is said twice.
			expect(container.querySelector('.card')?.textContent).toContain('A framed post');
			expect(container.querySelectorAll('.head .card')).toHaveLength(1);
			expect(container.querySelector('iframe')).toBeNull();
		});
	});

	/**
	 * One row for every button an embed offers, wherever it came from.
	 *
	 * Buttons used to float over a corner of the media, which does not survive
	 * a second one: the composer's remove and a refresh would have landed on
	 * top of each other.
	 */
	describe('the actions row', () => {
		const removeAction = createRawSnippet(() => ({
			render: () =>
				'<wa-button type="button"><wa-icon name="xmark" label="Remove this embed"></wa-icon></wa-button>'
		}));

		const playerProps = {
			spec: {
				kind: 'iframe',
				src: 'https://www.redgifs.com/ifr/abc123',
				title: 'Redgifs video'
			} as EmbedSpec,
			href: 'https://www.redgifs.com/watch/abc123',
			label: 'https://www.redgifs.com/watch/abc123'
		};

		it('is not drawn at all when there is nothing to put in it', () => {
			const { container } = render(UrlEmbed, { props: playerProps });

			// A bare player is still exactly as bare as it was.
			expect(container.querySelector('.actions')).toBeNull();
			expect(container.querySelector('.head')).toBeNull();
			expect(container.querySelector('.player iframe')).not.toBeNull();
		});

		it("holds the caller's own buttons, and names the embed beside them", () => {
			const { container } = render(UrlEmbed, {
				props: { ...playerProps, actions: removeAction }
			});

			expect(container.querySelector('.actions wa-icon[label="Remove this embed"]')).not.toBeNull();
			// The row exists because of that button, so it has to say what the
			// button belongs to.
			expect(container.querySelector('.head .card')?.textContent).toContain('Redgifs video');
			// And the embed itself is unaffected: still framed, still inline.
			expect(container.querySelector('.player iframe')).not.toBeNull();
		});

		it('puts the refresh button in the row rather than over the card', async () => {
			const cached = {
				href: 'https://vimeo.com/2',
				fetchedAt: Date.now(),
				kind: 'card',
				providerName: 'Vimeo',
				title: 'Cached title',
				description: null,
				thumbnailUrl: 'https://example.com/thumb.jpg',
				canonicalUrl: 'https://vimeo.com/2',
				imageUrl: null,
				iframeSrc: null,
				iframeHeight: null,
				faviconUrl: null,
				themeColor: null
			} satisfies CachedEmbedDetails;
			const onRefresh = vi.fn();

			const { container } = render(UrlEmbed, {
				props: {
					spec: { kind: 'oembed', endpoint: 'https://oembed.test/refresh-row' },
					href: cached.href,
					label: 'vimeo link',
					cached,
					onRefresh,
					actions: removeAction
				}
			});

			// Both buttons, side by side, in the order the caller's comes first.
			// Named by their icons, which is where a `wa-button` takes its name.
			const buttons = [...container.querySelectorAll('.actions wa-button')].map((button) =>
				waProp(button.querySelector('wa-icon'), 'label')
			);
			expect(buttons).toEqual(['Remove this embed', 'Refresh preview']);

			await fireEvent.click(refreshButton(container));
			expect(onRefresh).toHaveBeenCalledWith(cached.href);

			// The thumbnail sits under the row now, so it is no longer a second
			// link to the same place with no accessible name of its own.
			expect(container.querySelectorAll('a[href="https://vimeo.com/2"]')).toHaveLength(1);
			expect(container.querySelector('img.thumb')).not.toBeNull();
		});
	});
});
