<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { Clip } from '$lib/playroom/iq-test/media';
	import { mediaInfo, mediaWarn } from '$lib/playroom/iq-test/media-log';
	import { registerAudible, registerVideo } from '$lib/playroom/iq-test/sound.svelte';

	/**
	 * One Redgifs clip, played by the page itself where it can be, so the
	 * page's volume reaches it.
	 *
	 * Redgifs refuses its files to a request that carries another site's
	 * `Referer` (measured: 403 with one, 206 without; `Origin` alone is fine,
	 * and its CORS headers allow any origin). A `<video>` cannot drop its
	 * referrer, and dropping it for the whole document would also blank the
	 * `Origin` on the app's own form posts and fail SvelteKit's CSRF check. So
	 * the file is fetched with `referrerPolicy: 'no-referrer'` and played from
	 * a blob URL.
	 *
	 * That is not how Redgifs means its files to be used, and it could stop
	 * working without notice. When it does — the fetch fails, or the file will
	 * not play — the clip falls back to Redgifs' own player, which still works
	 * and has a sound button of its own. Losing the global volume is the whole
	 * cost.
	 *
	 * Each clip plays once and then asks for the next (`onended`). Until the
	 * next one is ready to play, the current one keeps looping, so the panel
	 * is never blank between clips: the next downloads, then loads in a hidden
	 * video element of its own, and only replaces the current one once it can
	 * play (`canplay`). Swapping the file in the one element instead left a
	 * moment of nothing while it decoded. A clip in Redgifs' player cannot say
	 * when it has ended, so that one asks for the next on a timer instead.
	 */
	let {
		clip,
		audible = false,
		fit = 'natural',
		onended,
		loading = $bindable(false)
	}: {
		clip: Clip;
		audible?: boolean;
		/**
		 * `natural`: the clip's own shape, as wide as its column. `cover`: fills
		 * whatever box it is put in, cropping to fit — the overload background.
		 */
		fit?: 'natural' | 'cover';
		onended?: () => void;
		/**
		 * Out: the clip asked for is not on show yet — downloading, or loading
		 * in its hidden element — while the one before it plays on. For the
		 * column's loading bar.
		 */
		loading?: boolean;
	} = $props();

	/** How long a clip in Redgifs' own player stays before the next is asked for. */
	const FALLBACK_CLIP_MS = 45_000;

	// Primitives, read by the effect below instead of `clip`: a new feed hands
	// over new clip objects for the same clips, and an effect reading through
	// the object would download the same file again.
	const file = $derived(clip.video);
	const clipId = $derived(clip.id);
	/**
	 * The clip's files as videos, oldest first: the one on show and, while it
	 * gets ready, the one that will replace it. Each is a blob URL.
	 */
	type Layer = { url: string; id: string; ready: boolean; paused: boolean };
	let layers = $state<Layer[]>([]);
	let fellBack = $state(false);
	/** On show: the newest that can play, or the first while none can yet. */
	const shown = $derived(layers.findLast((layer) => layer.ready) ?? layers[0] ?? null);
	/**
	 * The clip on show could play but is not: autoplay refused (a phone in
	 * low-power mode, a browser's own setting), or paused by the browser. A
	 * big play button covers it until a click starts it. Not for the
	 * background, which sits behind the page and cannot be clicked.
	 */
	$effect(() => {
		loading = !(fellBack || (shown?.id === clipId && shown.ready));
	});

	const stalled = $derived(fit !== 'cover' && shown !== null && shown.ready && shown.paused);
	let shownNode = $state<HTMLVideoElement>();

	function rememberShown(node: HTMLVideoElement) {
		shownNode = node;
	}

	function playShown() {
		void shownNode?.play().catch(() => undefined);
	}

	function drop(gone: readonly Layer[]) {
		for (const layer of gone) {
			URL.revokeObjectURL(layer.url);
		}
	}

	/** Drop every layer but these, letting their files go. */
	function keepOnly(keep: readonly Layer[]) {
		drop(layers.filter((layer) => !keep.includes(layer)));
		layers = layers.filter((layer) => keep.includes(layer));
	}

	$effect(() => {
		const url = file;
		// The current clip stays up (looping) until the next can play; only a
		// clip with no file at all goes straight to the player.
		fellBack = url === null;
		if (url === null) {
			untrack(() => keepOnly([]));
			return;
		}
		const controller = new AbortController();
		// Not tryFetch: its null for "no connection" would hide the browser's
		// own reason, and that reason — a CORS refusal, a blocker — is exactly
		// what the console needs when clips do not appear.
		const id = clipId;
		fetch(url, { referrerPolicy: 'no-referrer', mode: 'cors', signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				const blob = await response.blob();
				if (controller.signal.aborted) {
					return;
				}
				// One waiting at a time: a clip that has not got ready yet is
				// overtaken by this one.
				keepOnly(shown?.ready ? [shown] : []);
				layers = [...layers, { url: URL.createObjectURL(blob), id, ready: false, paused: false }];
				mediaInfo(
					`Clip ${id} downloaded (${Math.round(blob.size / 1024)} KB, ${blob.type || 'no type'}).`
				);
			})
			.catch((error: unknown) => {
				// Aborted because the clip changed, or refused: only the second
				// means falling back.
				if (controller.signal.aborted) {
					return;
				}
				mediaWarn(
					`Clip ${id} could not be downloaded (${explain(error)}); using Redgifs' own player instead.`,
					url
				);
				fellBack = true;
			});
		return () => controller.abort();
	});

	/** A layer can play: it goes on show, and those before it go. */
	function ready(layer: Layer, node: HTMLVideoElement) {
		if (layer.ready) {
			return;
		}
		layer.ready = true;
		keepOnly(layers.slice(layers.indexOf(layer)));
		// A refusal is not an error: it is what the play button is for.
		void node.play().catch(() => {
			layer.paused = node.paused;
		});
	}

	onDestroy(() => drop(layers));

	// In Redgifs' player there is no "ended" to hear, so move on after a while.
	$effect(() => {
		if (!fellBack) {
			return;
		}
		// Per clip: a new one restarts the wait.
		void clipId;
		const timer = setTimeout(() => onended?.(), FALLBACK_CLIP_MS);
		return () => clearTimeout(timer);
	});

	function explain(error: unknown): string {
		return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
	}

	/** What a MediaError's code means, for the console. */
	const MEDIA_ERRORS: Record<number, string> = {
		1: 'aborted',
		2: 'network error',
		3: 'could not decode',
		4: 'format not supported'
	};

	/**
	 * A file that downloaded but will not play falls back too. And while it
	 * does play, it counts towards whether the volume slider has anything to
	 * reach.
	 *
	 * Not `loop`: an element that loops never fires `ended`, and the end is
	 * when the next clip is wanted. So the loop is done by hand — back to the
	 * start and play again — and the next clip is asked for once per file, not
	 * once per time round, which would skip through the feed while one
	 * downloads.
	 */
	function trackVideo(layer: Layer) {
		return (node: HTMLVideoElement) => {
			let asked = false;
			const onEnded = () => {
				if (!asked) {
					asked = true;
					onended?.();
				}
				node.currentTime = 0;
				void node.play().catch(() => undefined);
			};
			node.addEventListener('ended', onEnded);
			// Paused, but not at the end, which loops straight back round (above).
			const onPause = () => {
				layer.paused = !node.ended;
			};
			const onPlaying = () => {
				layer.paused = false;
			};
			node.addEventListener('pause', onPause);
			node.addEventListener('playing', onPlaying);
			const onReady = () => ready(layer, node);
			node.addEventListener('canplay', onReady);
			const onError = () => {
				const { error } = node;
				mediaWarn(
					`Clip ${layer.id} downloaded but will not play (${error ? (MEDIA_ERRORS[error.code] ?? `code ${error.code}`) : 'unknown error'}${error?.message ? `: ${error.message}` : ''}); using Redgifs' own player instead.`
				);
				fellBack = true;
			};
			node.addEventListener('error', onError);
			const unregister = registerVideo();
			return () => {
				node.removeEventListener('error', onError);
				node.removeEventListener('canplay', onReady);
				node.removeEventListener('ended', onEnded);
				node.removeEventListener('pause', onPause);
				node.removeEventListener('playing', onPlaying);
				unregister();
			};
		};
	}
</script>

{#if fellBack}
	<!-- biome-ignore-start lint/nursery/noUnsafeIframeSandbox: Redgifs' own player, so `allow-same-origin` grants the frame Redgifs' origin, not ours; it needs it to play. No `referrerpolicy`: Redgifs checks the embedding origin. -->
	<iframe
		src="https://www.redgifs.com/ifr/{clip.id}"
		title="Redgifs video"
		loading="lazy"
		tabindex="-1"
		sandbox="allow-scripts allow-same-origin allow-presentation"
		data-fit={fit}
	></iframe>
	<!-- biome-ignore-end lint/nursery/noUnsafeIframeSandbox: end of the frame above -->
{:else if layers.length > 0}
	<!--
		Muted to start, because only a muted video may autoplay; the sound
		module unmutes the audible one once the visitor has turned it up. The
		one getting ready is hidden over the one on show, and neither heard nor
		started until it replaces it.
	-->
	{#each layers as layer (layer.url)}
		<video
			{@attach trackVideo(layer)}
			{@attach audible && layer === shown ? registerAudible : undefined}
			{@attach layer === shown ? rememberShown : undefined}
			src={layer.url}
			autoplay={layer === shown}
			muted
			playsinline
			preload="auto"
			disablepictureinpicture
			tabindex="-1"
			class:pending={layer !== shown}
			data-clip={layer.id}
			data-fit={fit}
		></video>
	{/each}
	{#if stalled}
		<!--
			Over the column's own "enlarge" button, so a click here plays rather
			than enlarges. Gone as soon as the clip is playing.
		-->
		<button type="button" class="play" aria-label="Play video" onclick={playShown}>
			<wa-icon name="play" variant="solid"></wa-icon>
		</button>
	{/if}
{:else}
	<span class="loading" data-fit={fit}></span>
{/if}

<style>
	iframe,
	video,
	.loading {
		display: block;
		inline-size: 100%;
		border: none;
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-neutral-fill-quiet);
	}

	/* The video keeps its own shape. The player's frame and the placeholder
	   have none of their own, so they borrow a portrait one. */
	video {
		block-size: auto;
	}

	/* Loading over the one on show, unseen, until it can take its place. Its
	   parent (a column's item, the backdrop) is positioned. */
	video.pending {
		position: absolute;
		inset: 0;
		opacity: 0;
		pointer-events: none;
	}

	iframe,
	.loading {
		aspect-ratio: 9 / 16;
	}

	.play {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		/* Released from Web Awesome's fixed control height for a <button>. */
		inline-size: auto;
		block-size: auto;
		padding: 0;
		border: none;
		border-radius: var(--wa-border-radius-m);
		background: rgb(0 0 0 / 0.35);
		color: #fff;
		font-size: 2.5rem;
		cursor: pointer;

		wa-icon {
			display: grid;
			place-items: center;
			inline-size: 5rem;
			block-size: 5rem;
			padding-inline-start: 0.3rem;
			box-sizing: border-box;
			border-radius: 50%;
			background: rgb(0 0 0 / 0.55);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: calc(-1 * var(--wa-focus-ring-width, 3px));
		}
	}

	[data-fit='cover'] {
		block-size: 100%;
		aspect-ratio: auto;
		border-radius: 0;
		object-fit: cover;
	}
</style>
