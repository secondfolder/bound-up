<script lang="ts">
	import { resolve } from '$app/paths';

	/**
	 * What someone signed out needs to know: the list is only on this device,
	 * and an account keeps it, and is what comparing with a partner needs.
	 * Signing up or in comes back to the list in the account, where the
	 * answers from this device are added in (docs/kink-list.md, "Without an
	 * account").
	 */
	const back = '/playroom/kink-list';
</script>

<wa-callout variant="brand" appearance="outlined">
	<wa-icon slot="icon" name="mobile-screen" variant="solid"></wa-icon>
	<p>
		<strong>Saved on this device only.</strong> Create an account to keep your answers safe and
		private, and to compare them with a partner. Everything you've answered here comes with you.
	</p>
	<p class="links">
		<a href="{resolve('/(public)/signup')}?redirectTo={encodeURIComponent(back)}">Create an account</a>
		<a href="{resolve('/(public)/login')}?redirectTo={encodeURIComponent(back)}">Log in</a>
	</p>
</wa-callout>

<style>
	p {
		margin: 0;
	}

	.links {
		display: flex;
		gap: 1.25rem;
		margin-block-start: 0.5rem;
	}
</style>
