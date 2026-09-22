<script module lang="ts">
	/**
	 * The width below which an embedded iframe is opened on demand instead of
	 * drawn in place.
	 *
	 * A hosted player's own chrome is sized for a desktop frame: on a phone,
	 * reddit's header, vote rail and "open in app" bar cover most of the post
	 * they are wrapped around. Rather than shrink an iframe we do not control,
	 * anything narrower than the app's existing phone breakpoint gets a button
	 * and a near-fullscreen dialog. Exported so the tests do not have to
	 * restate the number.
	 */
	export const NARROW_EMBED_MEDIA_QUERY = '(max-width: 640px)';
</script>

<script lang="ts">
	import {
		cachedOembed,
		embedSpecFor,
		fetchOembed,
		type CachedEmbedDetails,
		type EmbedSpec,
		type OembedResult
	} from '$lib/embeds';
	import { embedActivationDelayMs } from '$lib/embed-activation';
	import { scrollParentOf } from '$lib/scroll-parent';
	import type { Snippet } from 'svelte';

	type CardView = {
		href: string;
		providerName: string | null;
		title: string | null;
		thumbnailUrl: string | null;
		mediaHref: string;
	};

	type IframeView = {
		shellClass: string;
		frameClass: string | null;
		src: string;
		title: string;
		/** The site, for the fullscreen header. Falls back to the host. */
		providerName: string | null;
		height: number | null;
		allowFullscreen: boolean;
	};

	/**
	 * The inline embed for one supported URL.
	 *
	 * Images and curated player iframes (redgifs, youtube) render from a
	 * deterministic URL, so they are SSR-safe and draw immediately, leaning on
	 * `loading="lazy"` to keep a thread full of them off the network until they
	 * are scrolled to.
	 *
	 * Anything that has to ask a provider what a URL is — a noembed host, or
	 * reddit through our own proxy — cannot draw anything until that answer
	 * arrives, so it renders nothing and starts the request only once it is in
	 * or near the scrollport — then appears once, fully formed. There is no
	 * loading skeleton: the composer resolves embeds while the writer is still
	 * typing, and a skeleton that is swapped for the real thing a moment later
	 * was two flashes for one embed, which nobody was waiting on anyway. That is a request-volume decision rather than
	 * a consent one: opening a thread must not fire a metadata lookup for every
	 * link in a year of conversation. The privacy boundary those lookups cross
	 * is documented in docs/privacy.md.
	 *
	 * A failed or unknown embed silently falls back to a plain link: embeds are
	 * decoration, and a dead provider (noembed has no SLA) must not leave a
	 * hole or a console error — the e2e fixture fails runs on console noise.
	 */
	let {
		spec,
		href,
		label,
		cached = null,
		cachedPending = false,
		onActivate = undefined,
		onRefresh = undefined,
		actions = undefined
	}: {
		spec: EmbedSpec;
		href: string;
		label: string;
		cached?: CachedEmbedDetails | null;
		cachedPending?: boolean;
		/** Fired once, when this embed starts loading with nothing cached for it. */
		onActivate?: ((href: string) => void | Promise<void>) | undefined;
		onRefresh?: ((href: string) => void | Promise<void>) | undefined;
		/**
		 * Extra buttons for the head row, from whoever is showing this embed —
		 * the composer's "remove", for one. They land beside the embed's own
		 * actions rather than floating over it, and their presence is what
		 * makes the head row appear on an embed that has no card of its own.
		 */
		actions?: Snippet | undefined;
	} = $props();

	let refreshing = $state(false);
	let inView = $state(false);
	let reportedActivation = $state(false);
	let rootElement: HTMLElement | undefined = $state();
	let narrow = $state(false);
	let fullscreen = $state(false);

	/**
	 * The site an iframe points at, when no provider named itself.
	 *
	 * The fullscreen header has to say where the reader is about to be taken,
	 * and a curated player (redgifs, youtube) has a title but never a provider.
	 */
	function hostLabel(url: string): string | null {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return null;
		}
	}

	/**
	 * True while this URL has nothing to draw until a provider answers.
	 *
	 * The one thing that decides whether an embed waits for the viewport. A
	 * cached entry counts as an answer, which is why a message whose metadata
	 * sidecar already covers a URL draws its card straight away.
	 */
	const needsDetails = $derived(
		(spec.kind === 'oembed' || spec.kind === 'server-oembed') && cached === null
	);
	const activated = $derived(!needsDetails || (!cachedPending && inView));
	const canRefresh = $derived(cached !== null && onRefresh !== undefined);

	// The endpoint actually fetched: direct for noembed hosts, our proxy for
	// reddit. Null until this embed is activated, and null forever when a
	// cached entry already answers the question.
	const endpoint = $derived(
		!activated || cached !== null || cachedPending
			? null
			: spec.kind === 'oembed'
				? spec.endpoint
				: spec.kind === 'server-oembed'
					? `/api/oembed?url=${encodeURIComponent(spec.url)}`
					: null
	);

	// svelte-ignore state_referenced_locally
	// Deliberate initial capture: the cached value seeds the state and the
	// $effect below is what keeps it live, so re-deriving on every prop change
	// would restart settled fetches for nothing.
	let oembed: OembedResult | 'error' | undefined = $state(
		endpoint === null ? undefined : cachedOembed(endpoint)
	);
	const cachedCard = $derived.by(() => {
		if (!cached) return null;
		if (!cached.title && !cached.providerName && !cached.thumbnailUrl && !cached.description) {
			return null;
		}
		return {
			href: cached.canonicalUrl ?? href,
			providerName: cached.providerName,
			title: cached.title,
			thumbnailUrl: cached.thumbnailUrl,
			mediaHref: cached.canonicalUrl ?? href
		} satisfies CardView;
	});

	const cachedCardImage = $derived.by(() => {
		if (!cached || cached.kind !== 'image' || !cached.imageUrl) return null;
		return {
			href: cached.canonicalUrl ?? href,
			src: cached.imageUrl,
			alt: label
		};
	});

	const cachedIframeEmbed = $derived.by(() => {
		if (!cached || cached.kind !== 'iframe' || !cached.iframeSrc) return null;
		return {
			shellClass: cachedCard ? 'card-media player iframe-shell' : 'embed player iframe-shell',
			frameClass: null,
			src: cached.iframeSrc,
			title: cached.title ?? cached.providerName ?? 'Embedded content',
			providerName: cached.providerName ?? hostLabel(cached.canonicalUrl ?? href),
			height: cached.iframeHeight,
			allowFullscreen: true
		} satisfies IframeView;
	});

	const cachedStandaloneImage = $derived.by(() => {
		if (!cachedCardImage || cachedCard) return null;
		return cachedCardImage;
	});

	async function refresh(event: MouseEvent): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		if (!onRefresh || refreshing) return;
		refreshing = true;
		try {
			await onRefresh(href);
		} finally {
			refreshing = false;
		}
	}

	function distanceFromViewport(target: HTMLElement, root: HTMLElement | null): number {
		const rect = target.getBoundingClientRect();
		const rootRect = root?.getBoundingClientRect();
		const rootTop = rootRect?.top ?? 0;
		const rootBottom = rootRect?.bottom ?? window.innerHeight;
		if (rect.bottom < rootTop) return rootTop - rect.bottom;
		if (rect.top > rootBottom) return rect.top - rootBottom;
		return 0;
	}

	/**
	 * Watches for this embed reaching the scrollport.
	 *
	 * Runs for every embed, not only the deferred ones: `inView` is also what
	 * decides when to tell the caller that a URL with no cached details is
	 * being loaded, and a thread should not backfill its whole metadata sidecar
	 * the moment it opens.
	 *
	 * Without an `IntersectionObserver` — jsdom, and any browser old enough to
	 * lack it — everything counts as in view immediately. Degrading to "load it
	 * all" is right for a fallback: the alternative is an embed that never
	 * appears.
	 */
	$effect(() => {
		const target = rootElement;
		if (!target || inView || typeof window === 'undefined') return;
		if (typeof IntersectionObserver === 'undefined') {
			inView = true;
			return;
		}
		const scroller = scrollParentOf(target);
		const root = scroller === document.scrollingElement ? null : scroller;
		let velocityPxPerMs = 0;
		let lastScrollTop = scroller.scrollTop;
		let lastScrollAt = performance.now();
		let inRange = false;
		let intersectionRatio = 0;
		let distancePx = Number.POSITIVE_INFINITY;
		let delayTimer: number | undefined;
		let idleTimer: number | undefined;

		const clearDelay = () => {
			if (delayTimer !== undefined) {
				window.clearTimeout(delayTimer);
				delayTimer = undefined;
			}
		};

		const activate = () => {
			clearDelay();
			inView = true;
		};

		const updateDistance = () => {
			distancePx = distanceFromViewport(target, root);
		};

		const schedule = () => {
			if (!inRange || inView) return;
			updateDistance();
			const delay = embedActivationDelayMs({
				intersectionRatio,
				distancePx,
				velocityPxPerMs
			});
			if (delay === 0) {
				activate();
				return;
			}
			clearDelay();
			delayTimer = window.setTimeout(() => {
				if (inRange && !inView) activate();
			}, delay);
		};

		const onScroll = () => {
			const now = performance.now();
			const nextTop = scroller.scrollTop;
			const elapsed = Math.max(now - lastScrollAt, 1);
			velocityPxPerMs = (nextTop - lastScrollTop) / elapsed;
			lastScrollTop = nextTop;
			lastScrollAt = now;
			if (idleTimer !== undefined) window.clearTimeout(idleTimer);
			idleTimer = window.setTimeout(() => {
				velocityPxPerMs = 0;
				if (inRange && !inView) schedule();
			}, 120);
			if (inRange && !inView) schedule();
		};

		const onResize = () => {
			if (inRange && !inView) schedule();
		};

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries.at(-1);
				if (!entry) return;
				inRange = entry.isIntersecting;
				intersectionRatio = entry.intersectionRatio;
				if (!inRange) {
					clearDelay();
					return;
				}
				schedule();
			},
			{
				root,
				rootMargin: '320px 0px 320px 0px',
				threshold: [0, 0.15, 0.6]
			}
		);

		scroller.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize);
		observer.observe(target);

		return () => {
			observer.disconnect();
			scroller.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
			clearDelay();
			if (idleTimer !== undefined) window.clearTimeout(idleTimer);
		};
	});

	$effect(() => {
		if (endpoint === null) return;
		let cancelled = false;
		void fetchOembed(endpoint).then((result) => {
			if (!cancelled) oembed = result;
		});
		return () => {
			cancelled = true;
		};
	});

	/**
	 * Tells the caller this URL is being loaded with nothing cached for it.
	 *
	 * That is the message thread's cue to resolve the preview once and encrypt
	 * it into the message's metadata sidecar, so the next reader — on either
	 * side — draws it without a lookup. Gated on `inView` rather than on mount
	 * so opening a long thread does not backfill every link in it at once.
	 */
	$effect(() => {
		if (!inView || cachedPending || cached !== null || reportedActivation) return;
		reportedActivation = true;
		void onActivate?.(href);
	});

	/**
	 * Generic oEmbed html is only used when it contains a plain iframe we can
	 * lift out and sandbox ourselves. Anything more dynamic — scripts,
	 * blockquotes that rely on a loader, custom widgets — falls back to the
	 * metadata card rather than opening an HTML injection surface.
	 */
	const oembedFrame = $derived.by(() => {
		if (!oembed || oembed === 'error' || !oembed.html) return null;
		const match = oembed.html.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
		if (!match) return null;
		const src = match[1];
		if (!src || !/^https?:\/\//i.test(src)) return null;
		return {
			src,
			title: oembed.title ?? oembed.providerName ?? 'Embedded content',
			height: oembed.height ?? 360
		};
	});

	/**
	 * When the proxy reports the post's outbound link and we can embed it
	 * natively (a redgifs player, a direct image), that beats everything
	 * below: reddit's own frame serves dead preview images for NSFW posts, so
	 * the outbound link is the only way to show the actual media.
	 */
	const nativeSpec = $derived(
		spec.kind === 'server-oembed' && oembed && oembed !== 'error' && oembed.outbound
			? embedSpecFor(oembed.outbound)
			: null
	);

	const redditOembed = $derived(
		spec.kind === 'server-oembed' && oembed && oembed !== 'error' ? oembed : null
	);

	/**
	 * Reddit's oEmbed `html` is a blockquote plus a widget script, and neither
	 * path is usable directly: DOMPurify strips the script (leaving a bare
	 * blockquote), and running the html in a sandboxed srcdoc frame fails too —
	 * the widget's child iframe to embed.reddit.com is rejected by reddit's
	 * `frame-ancestors` because a srcdoc parent has no network scheme.
	 *
	 * So the proxy also returns the resolved permalink, and we frame
	 * embed.reddit.com directly — the same cross-origin posture as the redgifs
	 * player, which reddit's `frame-ancestors *` allows for a normal http(s)
	 * parent. `allow-same-origin` here refers to the frame's own
	 * (embed.reddit.com) origin, not ours, so it grants nothing dangerous.
	 */
	const redditFrame = $derived.by(() => {
		if (
			nativeSpec ||
			spec.kind !== 'server-oembed' ||
			!oembed ||
			oembed === 'error' ||
			!oembed.permalink
		) {
			return null;
		}
		let pathname: string;
		try {
			pathname = new URL(oembed.permalink).pathname;
		} catch {
			return null;
		}
		// embed_host_url is where the widget's links point back at; nullsrcdoc
		// is exactly what breaks the widget path, so give it the real origin.
		const origin = typeof window === 'undefined' ? '' : window.location.origin;
		const src =
			`https://embed.reddit.com${pathname}?embed=true&ref_source=embed` +
			(origin ? `&embed_host_url=${encodeURIComponent(origin)}` : '');
		return { src, height: oembed.height ?? 600 };
	});

	const card = $derived.by(() => {
		if (redditOembed?.title) {
			return {
				href,
				providerName: redditOembed.providerName,
				title: redditOembed.title,
				thumbnailUrl: redditOembed.thumbnailUrl,
				mediaHref: redditOembed.outbound ?? href
			} satisfies CardView;
		}

		if (
			!oembed ||
			oembed === 'error' ||
			(!oembedFrame && !oembed.title && !oembed.providerName && !oembed.thumbnailUrl)
		) {
			return null;
		}

		return {
			href,
			providerName: oembed.providerName,
			title: oembed.title,
			thumbnailUrl: oembed.thumbnailUrl,
			mediaHref: href
		} satisfies CardView;
	});

	const cardImage = $derived.by(() => {
		if (cachedCardImage && cachedCard) return cachedCardImage;
		if (spec.kind !== 'server-oembed' || !card || nativeSpec?.kind !== 'image') return null;
		return {
			href: card.mediaHref,
			src: nativeSpec.url,
			alt: label
		};
	});

	const iframeEmbed = $derived.by(() => {
		if (cachedIframeEmbed) return cachedIframeEmbed;
		if (card && spec.kind === 'server-oembed') {
			if (nativeSpec?.kind === 'iframe') {
				return {
					shellClass: 'card-media player iframe-shell',
					frameClass: null,
					src: nativeSpec.src,
					title: nativeSpec.title,
					providerName: hostLabel(nativeSpec.src),
					height: null,
					allowFullscreen: true
				} satisfies IframeView;
			}

			if (redditFrame) {
				return {
					shellClass: 'card-media iframe-shell',
					frameClass: 'reddit-frame',
					src: redditFrame.src,
					title: redditOembed?.title ?? 'Reddit embed',
					providerName: card.providerName ?? hostLabel(href),
					height: redditFrame.height,
					allowFullscreen: false
				} satisfies IframeView;
			}

			if (oembedFrame) {
				return {
					shellClass: 'card-media player iframe-shell',
					frameClass: null,
					src: oembedFrame.src,
					title: oembedFrame.title,
					providerName: card.providerName ?? hostLabel(oembedFrame.src),
					height: oembedFrame.height,
					allowFullscreen: true
				} satisfies IframeView;
			}

			return null;
		}

		if (spec.kind === 'iframe') {
			return {
				shellClass: 'embed player iframe-shell',
				frameClass: null,
				src: spec.src,
				title: spec.title,
				providerName: hostLabel(href),
				height: null,
				allowFullscreen: true
			} satisfies IframeView;
		}

		if (card && oembedFrame) {
			return {
				shellClass: 'card-media player iframe-shell',
				frameClass: null,
				src: oembedFrame.src,
				title: oembedFrame.title,
				providerName: card.providerName ?? hostLabel(oembedFrame.src),
				height: oembedFrame.height,
				allowFullscreen: true
			} satisfies IframeView;
		}

		return null;
	});

	const standaloneImage = $derived.by(() => {
		if (cachedStandaloneImage) return cachedStandaloneImage;
		if (spec.kind !== 'image') return null;
		return {
			href,
			src: spec.url,
			alt: label
		};
	});

	/**
	 * True while this embed has nothing to draw yet, during which it draws
	 * nothing at all.
	 *
	 * Two windows. While details are on their way — a message's metadata still
	 * decrypting, or the composer resolving the same preview the reader will
	 * get — nothing is drawn whatever the kind: a player that appears bare and
	 * then grows a title card a moment later moves everything under it. After
	 * that, only the kinds that still have nothing to draw wait: anything
	 * resolved, including a failure, has something better to show.
	 *
	 * This used to draw a shimmering skeleton, which made every embed flash
	 * twice — once for the skeleton, once for the real thing. See the component
	 * comment above for why appearing once, late, is the better trade.
	 */
	const holding = $derived(cachedPending || (needsDetails && oembed === undefined));

	const showFallbackLink = $derived.by(() => {
		if (cachedCard || cachedStandaloneImage || cachedIframeEmbed) return false;
		if (holding || card || standaloneImage || iframeEmbed) return false;
		if (spec.kind === 'server-oembed') return true;
		if (oembed === undefined || oembed === 'error') return true;
		return !oembedFrame && !oembed.title;
	});

	let iframeLoading = $derived(iframeEmbed !== null);

	/**
	 * Whether the window is too narrow to use an iframe where it sits.
	 *
	 * Deliberately starts `false` and is only corrected once an effect has run,
	 * rather than being read from `matchMedia` while the component initialises.
	 * The initial client render has to produce the same branches the server
	 * sent, or Svelte logs `hydration_mismatch` — which the e2e fixture fails a
	 * run on. The cost is that a phone loading an SSR-rendered page briefly has
	 * the iframe in its markup; the surface this mostly exists for, a message
	 * thread, is decrypted and rendered client-side well after this has
	 * settled, so no frame is ever built there.
	 */
	$effect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
		const query = window.matchMedia(NARROW_EMBED_MEDIA_QUERY);
		narrow = query.matches;
		const onChange = (event: MediaQueryListEvent) => {
			narrow = event.matches;
			// Turning a phone landscape crosses back over the breakpoint and the
			// inline frame returns, so the overlay of the same thing must go.
			if (!narrow) fullscreen = false;
		};
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	const fullscreenView = $derived(fullscreen && iframeEmbed ? iframeEmbed : null);

	function openFullscreen(): void {
		// The frame is built fresh on every open — closing unmounts it, which is
		// also what stops a video that was left playing — so the spinner has to
		// come back with it.
		iframeLoading = true;
		fullscreen = true;
	}

	function closeFullscreen(): void {
		fullscreen = false;
	}

	function onDialogHide(event: Event): void {
		// `wa-after-hide` bubbles from nested Web Awesome controls, so only the
		// dialog's own hide unmounts the frame. Same trap as NewMessageDialog.
		if (event.target !== event.currentTarget) return;
		fullscreen = false;
	}

	/**
	 * The head row: what the embed calls itself, and what can be done to it.
	 *
	 * One place for every button, rather than each one floating over a corner
	 * of the media. That matters most where there is more than one — the
	 * composer's remove next to a refresh — but it is also what gives a bare
	 * player somewhere to put the fullscreen button, since a curated player has
	 * no card of its own.
	 */
	const headCard = $derived(cachedCard ?? card);
	const showExpand = $derived(narrow && iframeEmbed !== null);
	const hasActions = $derived(actions !== undefined || canRefresh || showExpand);

	const headMeta = $derived.by(() => {
		if (headCard) return headCard;
		if (!hasActions) return null;
		// No card, but there are buttons: name the thing they belong to rather
		// than leaving a bar of icons attached to nothing.
		return {
			href,
			providerName: iframeEmbed?.providerName ?? hostLabel(href),
			title: iframeEmbed?.title ?? null,
			thumbnailUrl: null,
			mediaHref: href
		} satisfies CardView;
	});

	/**
	 * Whether this embed draws as a bordered box.
	 *
	 * A card has always been one. Anything else only becomes one once it has a
	 * head row, so a bare player or a lone image is still exactly as bare as it
	 * was before there was anything to put above it.
	 */
	const boxed = $derived(headMeta !== null);
</script>

<!--
	The iframe, wherever it is drawn. The sandbox grants exactly what a hosted
	player needs to run, and no top-level navigation: the embed can play, pop
	out and go fullscreen, but it can never navigate this page away.

	These iframes deliberately do NOT set `referrerpolicy="no-referrer"`:
	Redgifs uses the embed origin as part of its cross-origin checks, and a
	missing Referer silently leaves the player blank.
-->
{#snippet frame(view: IframeView, inDialog: boolean)}
	<span class={inDialog ? 'dialog-frame' : view.shellClass} aria-busy={iframeLoading}>
		{#if iframeLoading}
			<span class="loading-overlay" aria-live="polite">
				<wa-spinner></wa-spinner>
				<span>Loading embed…</span>
			</span>
		{/if}
		<iframe
			class={inDialog ? undefined : (view.frameClass ?? undefined)}
			src={view.src}
			title={view.title}
			height={inDialog ? undefined : (view.height ?? undefined)}
			allowfullscreen={view.allowFullscreen}
			loading={inDialog ? 'eager' : 'lazy'}
			onload={() => (iframeLoading = false)}
			onerror={() => (iframeLoading = false)}
			sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
		></iframe>
	</span>
{/snippet}

<!--
	The head row: the site and title on the left, the actions on the right.

	The actions section is drawn only when something is in it, so an embed with
	nothing to do to it looks exactly as it did before there was a row at all.
	Buttons from the caller come first — the composer's remove is the one the
	writer reaches for — then the embed's own. Every one of them is a
	`wa-button`, sized once on the row below rather than each on its own.
-->
{#snippet actionBar()}
	{#if hasActions}
		<span class="actions">
			{@render actions?.()}
			{#if showExpand && iframeEmbed}
				<!--
					Labelled, not an icon on its own: this is the only way to reach the
					embed's content on a narrow window, so it has to read as the thing
					to press rather than as one more piece of chrome.

					The title rides along visually hidden rather than as an
					`aria-label` on the host, because `wa-button` does not forward one:
					its inner `<button>` takes its name from the slotted content. A
					thread can hold a dozen of these and a list of identical "Open"
					buttons names none of them — for a screen reader and a test
					locator alike.
				-->
				<wa-button class="open" appearance="outlined" size="s" onclick={openFullscreen}>
					Open<span class="sr-only"> {iframeEmbed.title}</span>
					<wa-icon slot="end" name="expand" variant="solid"></wa-icon>
				</wa-button>
			{/if}
			{#if canRefresh}
				<!--
					Named through the icon's `label`, which is what `wa-button` takes its
					name from — an `aria-label` on the host never reaches the inner
					`<button>`, and an icon-only button without one logs a warning.

					The spinner is swapped in by hand rather than through `loading`:
					`loading` is not an attribute Svelte's SSR knows to omit when false,
					so it would render `loading="false"`, which Lit reads as true.
				-->
				<wa-button
					type="button"
					class="refresh"
					title="Refresh preview"
					size="s"
					appearance="plain"
					pill
					disabled={refreshing}
					onclick={refresh}
				>
					{#if refreshing}
						<wa-spinner></wa-spinner>
					{:else}
						<wa-icon name="arrows-rotate" variant="solid" label="Refresh preview"></wa-icon>
					{/if}
				</wa-button>
			{/if}
		</span>
	{/if}
{/snippet}

{#snippet head()}
	<span class="head">
		{#if headMeta}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a class="card card-link" href={headMeta.href} target="_blank" rel="noopener noreferrer ugc">
				<span class="meta">
					{#if headMeta.providerName}
						<span class="provider">{headMeta.providerName}</span>
					{/if}
					{#if headMeta.title}
						<span class="title">{headMeta.title}</span>
					{/if}
				</span>
			</a>
		{/if}
		{@render actionBar()}
	</span>
{/snippet}

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<!--
	One element wraps every branch so the scrollport observer always has
	something to watch, whatever this embed turns out to be — including while
	it is still holding and draws nothing, when this is an empty box that the
	observer still reports on. It also gives the
	reader's revealed cards a stable box to be scrolled to.
-->
<span class="url-embed" bind:this={rootElement}>
	{#if holding}
		<!-- Nothing yet: the embed appears once it has something real to show. -->
	{:else if boxed}
		<span class="embed card-shell">
			{@render head()}
			{#if headCard?.thumbnailUrl}
				<!-- Not a link any more: the title above it is, and a second link to
			     the same place with no text of its own is a name-less entry in
			     every screen reader's link list. -->
				<img
					class="thumb"
					src={headCard.thumbnailUrl}
					alt=""
					loading="lazy"
					referrerpolicy="no-referrer"
				/>
			{/if}
			{#if cardImage}
				<a
					class="card-media image"
					href={cardImage.href}
					target="_blank"
					rel="noopener noreferrer ugc"
				>
					<img
						src={cardImage.src}
						alt={cardImage.alt}
						loading="lazy"
						referrerpolicy="no-referrer"
					/>
				</a>
			{:else if standaloneImage}
				<a
					class="card-media image"
					href={standaloneImage.href}
					target="_blank"
					rel="noopener noreferrer ugc"
				>
					<img
						src={standaloneImage.src}
						alt={standaloneImage.alt}
						loading="lazy"
						referrerpolicy="no-referrer"
					/>
				</a>
			{:else if iframeEmbed && !narrow}
				{@render frame(iframeEmbed, false)}
			{:else if showFallbackLink}
				<a class="card-media fallback" {href} target="_blank" rel="noopener noreferrer ugc"
					>{label}</a
				>
			{/if}
		</span>
	{:else if showFallbackLink}
		<a {href} target="_blank" rel="noopener noreferrer ugc">{label}</a>
	{:else if standaloneImage}
		<a
			class="embed image"
			href={standaloneImage.href}
			target="_blank"
			rel="noopener noreferrer ugc"
		>
			<!-- alt from the visible label: the URL text is the only description
		     the sender gave us. -->
			<img
				src={standaloneImage.src}
				alt={standaloneImage.alt}
				loading="lazy"
				referrerpolicy="no-referrer"
			/>
		</a>
	{:else if iframeEmbed}
		{@render frame(iframeEmbed, false)}
	{/if}

	<!--
		The frame the narrow window did not draw, on request.

		Built inside the dialog rather than moved into it, so nothing loads until
		the reader asks — and unmounted again on close, which is the only thing
		that reliably stops a player that was left running. `wa-dialog` uses a
		native `<dialog>` in the top layer, so it escapes the app shell's
		non-scrolling `<body>` and the scrollport it was rendered inside; see the
		positioning note in AGENTS.md.

		Spans rather than divs throughout: this component renders inside the `<p>`
		of a rich-text document, and only phrasing content is valid there.
	-->
	{#if fullscreenView}
		<wa-dialog
			class="embed-dialog"
			label={fullscreenView.title}
			open
			onwa-after-hide={onDialogHide}
		>
			<span class="dialog-body">
				<span class="dialog-header">
					<span class="dialog-meta">
						{#if fullscreenView.providerName}
							<span class="provider">{fullscreenView.providerName}</span>
						{/if}
						<span class="title">{fullscreenView.title}</span>
					</span>
					<wa-button appearance="plain" pill class="dialog-close" onclick={closeFullscreen}>
						<wa-icon name="xmark" variant="solid" label="Close embed"></wa-icon>
					</wa-button>
				</span>
				{@render frame(fullscreenView, true)}
			</span>
		</wa-dialog>
	{/if}
</span>

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
	/* A block of its own: an embed is a block-level thing in the document.
	   While an embed is holding this box is empty and zero-height, which the
	   observer still handles — a zero-area target intersects when it sits
	   inside the root's margin-expanded bounds. */
	.url-embed {
		display: block;
	}

	.embed {
		display: block;
		margin-block: 0.25rem;
		border-radius: 0.5rem;
		overflow: hidden;
		color: inherit;
		white-space: initial;
	}

	.player iframe {
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 0;
		display: block;
	}

	.iframe-shell {
		position: relative;
	}

	.loading-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: rgb(0 0 0 / 45%);
		color: white;
		font-size: 0.8125rem;
		backdrop-filter: blur(2px);

		wa-spinner {
			font-size: 1rem;
		}
	}

	.image img {
		max-inline-size: 100%;
		display: block;
	}

	/**
	 * The embed's chrome is drawn from `currentColor`, never from a fixed black.
	 *
	 * An embed inherits whatever it is sitting in: the page, a received message
	 * (dark in dark mode), or a sent one (always on brand blue). A black border
	 * at 10% is invisible on two of those. Mixing the inherited text colour
	 * means the frame follows the text it is next to, in both themes and on
	 * both sides of a conversation, with no per-bubble overrides.
	 */
	.card-shell {
		display: block;
		position: relative;
		border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
		background: color-mix(in srgb, currentColor 7%, transparent);
		color: inherit;

		img {
			max-inline-size: 100%;
			display: block;
		}
	}

	/**
	 * The head row.
	 *
	 * `min-inline-size: 0` on the link is what stops a long title pushing the
	 * actions off the end: a flex item's default minimum is its content, so
	 * without it the row simply overflows instead of wrapping the title.
	 */
	.head {
		display: flex;
		align-items: flex-start;
		gap: 0.25rem;
	}

	.card {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem;
		min-inline-size: 0;
		text-decoration: none;
		color: inherit;

		.meta {
			display: flex;
			flex-direction: column;
			min-inline-size: 0;
		}

		.provider {
			font-size: 0.75rem;
			opacity: 0.75;
		}

		.title {
			overflow-wrap: anywhere;
		}
	}

	.card-link {
		display: flex;
		flex-direction: column;
		color: inherit;
	}

	/**
	 * Where every button on an embed lives, whoever put it there.
	 *
	 * Sized in absolute units rather than around their contents: a `wa-icon`
	 * fetches its SVG, so a button sized to its icon is one height before that
	 * lands and another after, which reflows the row under whatever is being
	 * read or pressed.
	 */
	.actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.1rem;
		padding: 0.35rem 0.35rem 0 0;

		/* Every action is a `wa-button`, whoever supplied it — the caller's
		   through the `actions` snippet included — so the size is set here, on
		   the row, rather than by each of them. */
		:global(wa-button) {
			--wa-form-control-height: 2rem;
			font-size: 0.9rem;
		}

		/* The one action with a visible label rather than an icon. */
		wa-button.open {
			align-self: center;
			font-size: 0.85rem;
		}

		/* Named in the accessible name, drawn nowhere. */
		.sr-only {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
			border: 0;
		}
	}

	/* A link that never resolved into anything, inside a box it only has
	   because something else — the composer's remove — needed a row. */
	.fallback {
		display: block;
		padding: 0.5rem;
		overflow-wrap: anywhere;
	}

	.card-media {
		display: block;
		border-block-start: 1px solid color-mix(in srgb, currentColor 18%, transparent);
	}

	.reddit-frame {
		display: block;
		width: 100%;
		border: 0;
	}

	/**
	 * Nearly the whole screen, which is the entire point: the provider's own
	 * chrome needs room before the content it wraps is reachable.
	 *
	 * `100svh` rather than `100vh` so a mobile browser's collapsing address bar
	 * does not put the close button under it, less the home indicator's inset.
	 */
	wa-dialog.embed-dialog {
		--width: calc(100vw - 1rem);
		--spacing: 0;
		--backdrop-filter: brightness(0.4) blur(0.25rem);
	}

	wa-dialog.embed-dialog::part(dialog) {
		inline-size: calc(100vw - 1rem);
		max-inline-size: none;
		block-size: calc(100svh - 1rem - var(--safe-area-inset-bottom-min, 0px));
		max-block-size: none;
		margin: auto;
		padding: 0;
		overflow: hidden;
		border-radius: 0.75rem;
		border: 1px solid var(--wa-color-surface-border);
		background: var(--wa-color-surface-raised, var(--wa-color-surface-default, white));
	}

	/* Our own header instead: `label` alone cannot show the site and the title
	   as two lines, and it still supplies the dialog's accessible name. */
	wa-dialog.embed-dialog::part(header) {
		display: none;
	}

	wa-dialog.embed-dialog::part(body) {
		display: flex;
		min-block-size: 0;
		block-size: 100%;
		padding: 0;
		overflow: hidden;
	}

	/* The embed inherits the colour of whatever it was rendered in — white, on
	   a sent bubble. The dialog is its own surface, so it takes its own. */
	.dialog-body {
		display: flex;
		flex-direction: column;
		inline-size: 100%;
		min-block-size: 0;
		color: var(--wa-color-text-normal);
		white-space: initial;
	}

	.dialog-header {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.4rem 0.4rem 0.75rem;
		border-block-end: 1px solid var(--wa-color-surface-border);
	}

	.dialog-meta {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-inline-size: 0;

		.provider {
			font-size: 0.75rem;
			opacity: 0.75;
		}

		.title {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	wa-button.dialog-close {
		--wa-form-control-height: 2.5rem;
	}

	/* Fills what the header leaves. A 16/9 player letterboxes itself inside it,
	   which is better than a fixed ratio for the frames this exists for —
	   reddit's post embed is tall and has no ratio worth honouring. */
	.dialog-frame {
		display: block;
		position: relative;
		flex: 1 1 auto;
		min-block-size: 0;

		iframe {
			inline-size: 100%;
			block-size: 100%;
			border: 0;
			display: block;
		}
	}
</style>
