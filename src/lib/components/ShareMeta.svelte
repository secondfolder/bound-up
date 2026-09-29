<script lang="ts">
	import { asset } from '$app/paths';
	import { page } from '$app/state';

	/**
	 * The Open Graph and Twitter card tags a link preview is built from, for a
	 * page people are expected to paste into a chat: the landing page, the
	 * roadmap and, above all, a partner invite. Rendered by each such page
	 * rather than by a layout, because a page's own tags would otherwise sit
	 * beside the layout's defaults, and previewers disagree on which duplicate
	 * wins.
	 *
	 * The image is the same card everywhere (`static/og-image.jpg`, drawn by
	 * `npm run brand-images`); only the words change per page.
	 */
	type Props = {
		title: string;
		description: string;
	};

	let { title, description }: Props = $props();

	// Previewers require an absolute URL. `asset()` can return a path relative
	// to the page being rendered during SSR, so it is resolved against the
	// page's own URL rather than prefixed with the origin. The origin is the
	// request's, which is right on Workers and, with `ORIGIN` set, behind the
	// self-hosted build's proxy.
	const image = $derived(new URL(asset('/og-image.jpg'), page.url).href);
</script>

<svelte:head>
	<meta name="description" content={description} />
	<meta property="og:site_name" content="Bound Up" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<!-- The card's size, from scripts/generate-brand-images.ts. Stated so a
	     previewer can lay the card out before (or without) fetching it. -->
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:type" content="image/jpeg" />
	<meta
		property="og:image:alt"
		content="Bound Up: explore your kinks and manage your dynamics, either with a partner or solo."
	/>
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>
