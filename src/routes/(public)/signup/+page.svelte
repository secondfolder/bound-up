<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthPage from '$lib/components/AuthPage.svelte';
	import SignupForm from '$lib/components/SignupForm.svelte';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	// Captures the load's initial `data` on purpose: this is a static property of
	// this render, and re-deriving it on every `invalidate()` changes nothing.
	// `redirectTo` was validated by `safeRedirect` in the load, so it is safe to
	// put straight back into a query string.
	const loginHref = data.redirectTo
		? `${resolve('/login')}?redirectTo=${encodeURIComponent(data.redirectTo)}`
		: resolve('/login');
</script>

<AuthPage title="Sign up">
	<SignupForm data={data.signupForm} />

	<!-- Not plain "Log in": the landing page and the log-in page's own button
	     use that name, and AGENTS.md keeps link names unambiguous within a
	     page — this says where it goes, too. -->
	<a class="cross-link" href={loginHref}>Already have an account? Log in</a>
</AuthPage>

<style>
	.cross-link {
		align-self: center;
		color: var(--wa-color-text-quiet);
	}
</style>
