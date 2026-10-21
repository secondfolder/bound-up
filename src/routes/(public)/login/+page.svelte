<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthPage from '$lib/components/AuthPage.svelte';
	import HomeScreenHint from '$lib/components/HomeScreenHint.svelte';
	import LoginForm from '$lib/components/LoginForm.svelte';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	// Captures the load's initial `data` on purpose: this is a static property of
	// this render, and re-deriving it on every `invalidate()` changes nothing.
	// `redirectTo` was validated by `safeRedirect` in the load, so it is safe to
	// put straight back into a query string.
	const signupHref = data.redirectTo
		? `${resolve('/signup')}?redirectTo=${encodeURIComponent(data.redirectTo)}`
		: resolve('/signup');
</script>

<AuthPage title="Log in">
	<!-- Where a verification link lands. An old or broken link needs no resend
	     button here: signing in to an unconfirmed account sends a fresh one. -->
	{#if data.verification === 'first-account'}
		<wa-callout variant="brand" size="s" class="notice" data-testid="verification-notice">
			<wa-icon slot="icon" name="key" variant="solid"></wa-icon>
			You're the first account here, so you're its admin, and this server can't send email yet. Log in,
			then set up email in Settings → Admin so the next people to sign up can confirm theirs.
		</wa-callout>
	{:else if data.verification === 'verified'}
		<wa-callout variant="success" size="s" class="notice" data-testid="verification-notice">
			<wa-icon slot="icon" name="envelope-circle-check" variant="solid"></wa-icon>
			Your email is confirmed. Log in to continue.
		</wa-callout>
	{:else if data.verification}
		<wa-callout variant="warning" size="s" class="notice" data-testid="verification-notice">
			<wa-icon slot="icon" name="triangle-exclamation" variant="solid"></wa-icon>
			{data.verification === 'expired' ? 'That link has expired.' : "That link didn't work."}
			Log in and we'll email you a new one.
		</wa-callout>
	{/if}

	<LoginForm data={data.loginForm} redirectTo={data.redirectTo} reason={data.reason} />

	<a class="cross-link" href={signupHref}>Create an account</a>

	<HomeScreenHint />
</AuthPage>

<style>
	.notice {
		margin: 0;
	}

	.cross-link {
		align-self: center;
		color: var(--wa-color-text-quiet);
	}
</style>
