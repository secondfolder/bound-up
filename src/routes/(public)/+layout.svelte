<script lang="ts">
	let { children } = $props();

	// No header. There used to be one (`SiteHeader`) with Login / Sign up —
	// or, signed in, Home / Settings / Log out — above every page here but the
	// landing page. It went because each of these pages already links to where
	// a visitor would go next: the landing page's CTA, login's "Create an
	// account", signup's "Log in", and the invite page's own two buttons — and
	// the auth pages' "Back to Bound Up" (AuthPage) leads back again.
</script>

<svelte:head>
	<style>
	body {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100svh;
	}
</style>
</svelte:head>
<div class="container">
	{@render children()}
</div>

<style>
	.container {
		/* The full width up to the column's, with the app's one gutter. It was
		   `width: 800px; max-width: calc(100svw - 1em)` and a 1em padding,
		   which on a phone left 24px a side where every other page has 16. */
		box-sizing: border-box;
		inline-size: 100%;
		max-inline-size: 800px;
		padding: var(--page-gutter);
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
	}
</style>
