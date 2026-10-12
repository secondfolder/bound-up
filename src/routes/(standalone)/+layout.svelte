<script lang="ts">
	let { children } = $props();

	// The third shell, beside (public) and (app): pages that stand on their own
	// and should not look like Bound Up — a Playroom tool someone can be sent a
	// link to without being sent the app. No header, no nav, and none of the
	// app's page texture; each page dresses itself. The root layout's
	// `theme.css` still loads, so a page here undoes what it needs locally
	// (see `themes.ts` for how the IQ test does it).
</script>

<svelte:head>
	<style>
	:root {
		--page-texture: none;
	}
</style>
</svelte:head>
{@render children()}
