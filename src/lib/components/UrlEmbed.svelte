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
	 * arrives, so it renders a skeleton and starts the request only once it is
	 * in or near the scrollport. That is a request-volume decision rather than
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
		onRefresh = undefined
	}: {
		spec: EmbedSpec;
		href: string;
		label: string;
		cached?: CachedEmbedDetails | null;
		cachedPending?: boolean;
		/** Fired once, when this embed starts loading with nothing cached for it. */
		onActivate?: ((href: string) => void | Promise<void>) | undefined;
		onRefresh?: ((href: string) => void | Promise<void>) | undefined;
	} = $props();

	let refreshing = $state(false);
	let inView = $state(false);
	let reportedActivation = $state(false);
	let rootElement: HTMLElement | undefined = $state();

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

	const skeletonCard = $derived(cachedCard);
	const skeletonKind = $derived.by(() => {
		if (cached?.kind === 'image' || spec.kind === 'image') return 'image';
		if (cached?.kind === 'iframe' || spec.kind === 'iframe' || spec.kind === 'server-oembed') {
			return 'player';
		}
		if (cached?.thumbnailUrl || cached?.iframeSrc || cached?.imageUrl) return 'player';
		return 'card';
	});

	/**
	 * A stable placeholder for an embed that cannot be drawn yet.
	 *
	 * Two windows. While details are on their way — a message's metadata still
	 * decrypting, or the composer resolving the same preview the reader will
	 * get — nothing is drawn at all, whatever the kind: a player that appears
	 * bare and then grows a title card a moment later moves everything under
	 * it. After that, only the kinds that still have nothing to draw wait:
	 * anything resolved, including a failure, has something better to show.
	 */
	const showSkeleton = $derived(cachedPending || (needsDetails && oembed === undefined));

	const showFallbackLink = $derived.by(() => {
		if (cachedCard || cachedStandaloneImage || cachedIframeEmbed) return false;
		if (showSkeleton || card || standaloneImage || iframeEmbed) return false;
		if (spec.kind === 'server-oembed') return true;
		if (oembed === undefined || oembed === 'error') return true;
		return !oembedFrame && !oembed.title;
	});

	let iframeLoading = $derived(iframeEmbed !== null);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<!--
	One element wraps every branch so the scrollport observer always has
	something to watch, whatever this embed turns out to be. It also gives the
	reader's revealed cards a stable box to be scrolled to.
-->
<span class="url-embed" bind:this={rootElement}>
	{#if showSkeleton}
		<span class="embed skeleton-shell" aria-busy="true">
			<span class="skeleton-card">
				{#if skeletonCard?.providerName}
					<span class="provider">{skeletonCard.providerName}</span>
				{:else}
					<span class="skeleton-line short"></span>
				{/if}
				{#if skeletonCard?.title}
					<span class="title">{skeletonCard.title}</span>
				{:else}
					<span class="skeleton-line"></span>
				{/if}
			</span>
			{#if skeletonKind !== 'card' || skeletonCard?.thumbnailUrl}
				<span class:skeleton-media={true} class:image={skeletonKind === 'image'}></span>
			{/if}
		</span>
	{:else if cachedCard || card}
		<span class="embed card-shell">
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
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a
				class="card card-link"
				href={(cachedCard ?? card)?.href}
				target="_blank"
				rel="noopener noreferrer ugc"
			>
				<span class="meta">
					{#if (cachedCard ?? card)?.providerName}
						<span class="provider">{(cachedCard ?? card)?.providerName}</span>
					{/if}
					{#if (cachedCard ?? card)?.title}
						<span class="title">{(cachedCard ?? card)?.title}</span>
					{/if}
				</span>
				{#if (cachedCard ?? card)?.thumbnailUrl}
					<img
						src={(cachedCard ?? card)?.thumbnailUrl}
						alt=""
						loading="lazy"
						referrerpolicy="no-referrer"
					/>
				{/if}
			</a>
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
			{:else if iframeEmbed}
				<!-- Same sandbox as the curated players: the reddit post pointed here, and
		     the gate already covered the privacy half. These iframes deliberately do
		     NOT set `referrerpolicy="no-referrer"`: Redgifs uses the embed origin as
		     part of its cross-origin checks, and a missing Referer silently leaves
		     the player blank. -->
				<span class={iframeEmbed.shellClass} aria-busy={iframeLoading}>
					{#if iframeLoading}
						<span class="loading-overlay" aria-live="polite">
							<wa-spinner></wa-spinner>
							<span>Loading embed…</span>
						</span>
					{/if}
					<iframe
						class={iframeEmbed.frameClass ?? undefined}
						src={iframeEmbed.src}
						title={iframeEmbed.title}
						height={iframeEmbed.height ?? undefined}
						allowfullscreen={iframeEmbed.allowFullscreen}
						loading="lazy"
						onload={() => (iframeLoading = false)}
						onerror={() => (iframeLoading = false)}
						sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
					></iframe>
				</span>
			{/if}
		</span>
	{:else if showFallbackLink}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a {href} target="_blank" rel="noopener noreferrer ugc">{label}</a>
	{:else if standaloneImage}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
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
		<!-- The sandbox grants exactly what a hosted video player needs to run,
	     and no top-level navigation: the embed can play, pop out and go
	     fullscreen, but it can never navigate this page away. -->
		<span class={iframeEmbed.shellClass} aria-busy={iframeLoading}>
			{#if iframeLoading}
				<span class="loading-overlay" aria-live="polite">
					<wa-spinner></wa-spinner>
					<span>Loading embed…</span>
				</span>
			{/if}
			<iframe
				class={iframeEmbed.frameClass ?? undefined}
				src={iframeEmbed.src}
				title={iframeEmbed.title}
				height={iframeEmbed.height ?? undefined}
				allowfullscreen={iframeEmbed.allowFullscreen}
				loading="lazy"
				onload={() => (iframeLoading = false)}
				onerror={() => (iframeLoading = false)}
				sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
			></iframe>
		</span>
	{/if}
</span>

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
	/* A block of its own: an embed is a block-level thing in the document, and
	   the observer needs a box with real dimensions to measure. */
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

	/**
	 * The embed's chrome is drawn from `currentColor`, never from a fixed black.
	 *
	 * An embed inherits whatever it is sitting in: the page, a received message
	 * (dark in dark mode), or a sent one (always on brand blue). A black border
	 * at 10% is invisible on two of those. Mixing the inherited text colour
	 * means the frame follows the text it is next to, in both themes and on
	 * both sides of a conversation, with no per-bubble overrides.
	 */
	.skeleton-shell {
		display: block;
		border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
		border-radius: 0.5rem;
		overflow: hidden;
		background: color-mix(in srgb, currentColor 7%, transparent);
	}

	.skeleton-card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem;
	}

	.skeleton-line,
	.skeleton-media {
		background: linear-gradient(
			90deg,
			color-mix(in srgb, currentColor 8%, transparent),
			color-mix(in srgb, currentColor 26%, transparent),
			color-mix(in srgb, currentColor 8%, transparent)
		);
		background-size: 200% 100%;
		animation: embed-shimmer 1.2s linear infinite;
	}

	.skeleton-line {
		display: block;
		block-size: 0.85rem;
		border-radius: 999px;
	}

	.skeleton-line.short {
		inline-size: 40%;
	}

	.skeleton-media {
		display: block;
		aspect-ratio: 16 / 9;
		border-block-start: 1px solid color-mix(in srgb, currentColor 18%, transparent);
	}

	.skeleton-media.image {
		aspect-ratio: 4 / 3;
		max-block-size: 20rem;
	}

	.image img {
		max-inline-size: 100%;
		max-block-size: 20rem;
		display: block;
	}

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

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem;
		text-decoration: none;
		color: inherit;

		.meta {
			display: flex;
			flex-direction: column;
		}

		.provider {
			font-size: 0.75rem;
			opacity: 0.75;
		}
	}

	.card-link {
		display: flex;
		flex-direction: column;
		color: inherit;
	}

	.card-media {
		display: block;
		border-block-start: 1px solid color-mix(in srgb, currentColor 18%, transparent);
	}

	.refresh {
		position: absolute;
		inset-block-start: 0.35rem;
		inset-inline-end: 0.35rem;
		z-index: 1;
		--wa-form-control-height: 1.6rem;
		font-size: 0.9rem;
	}

	.reddit-frame {
		display: block;
		width: 100%;
		border: 0;
	}

	@keyframes embed-shimmer {
		from {
			background-position: 200% 0;
		}

		to {
			background-position: -200% 0;
		}
	}
</style>
