<script lang="ts">
	let { children } = $props();

	// No header. There used to be one (`SiteHeader`) with Login / Sign up —
	// or, signed in, Home / Settings / Log out — above every page here but the
	// landing page. It went because each of these pages already links to where
	// a visitor would go next: the landing page's CTA, login's "Create an
	// account", signup's "Log in", and the invite page's own two buttons.
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
		--padding: 1em;
		max-width: calc(100svw - (var(--padding) * 1));
		width: 800px;
		padding: var(--padding);
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
	}
</style>
