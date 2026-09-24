<script lang="ts">
	import { resolve } from '$app/paths';
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

<LoginForm data={data.loginForm} redirectTo={data.redirectTo} reason={data.reason} />

<a class="cross-link" href={signupHref}>Create an account</a>

<HomeScreenHint />

<style>
	.cross-link {
		display: block;
		margin: 1rem auto 0;
		width: fit-content;
		color: var(--wa-color-text-quiet);
	}
</style>
