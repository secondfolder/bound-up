import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UrlEmbed from './UrlEmbed.svelte';
import { clearOembedCache, type CachedEmbedDetails, type EmbedSpec } from '$lib/embeds';

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
 * The refresh button. A `wa-button`, which jsdom never upgrades, so it has no
 * role to find it by — see AGENTS.md on testing `wa-*` elements.
 */
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

afterEach(() => {
	clearOembedCache();
	vi.unstubAllGlobals();
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

	it('holds the space with a skeleton while the oEmbed is in flight', () => {
		// Not the plain link it used to show: a link that turns into a card a
		// moment later moves everything under it, which is worse in a thread
		// than a placeholder of roughly the right size.
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
		expect(container.querySelector('.skeleton-shell')).not.toBeNull();
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
		expect(container.querySelector('.skeleton-shell')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('holds a not-yet-cached embed in a skeleton until it is in view', () => {
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

		expect(container.querySelector('.skeleton-shell')).not.toBeNull();
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

		expect(container.querySelector('.skeleton-shell')).not.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
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

		expect(refreshButton(container).querySelector('wa-icon')?.getAttribute('label')).toBe(
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

		it('keeps a skeleton up until the proxy resolves', async () => {
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

			expect(container.querySelector('.skeleton-shell')).not.toBeNull();
			expect(container.querySelector('.card')).toBeNull();

			if (!resolver.current) throw new Error('expected pending fetch resolver');
			resolver.current(
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
					encodeURIComponent('http://localhost:3000')
			);
			expect(frame?.getAttribute('height')).toBe('600');
			expect(container.querySelector('.player iframe')).toBeNull();
		});
	});
});
