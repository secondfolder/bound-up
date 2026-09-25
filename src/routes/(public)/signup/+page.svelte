<script lang="ts">
	import { resolve } from '$app/paths';
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

<!-- In the landing page's display face, as every page title is (src/lib/theme.css):
     without one, these were the only screens with nothing of it but the wash. -->
<h1>Sign up</h1>

<SignupForm data={data.signupForm} />

<!-- Not plain "Log in": the (public) header already has a link by that name,
     and two links with the same accessible name going to different places is a
     real problem for anyone navigating by link list (see AGENTS.md). -->
<a class="cross-link" href={loginHref}>Already have an account? Log in</a>

<style>
	h1 {
		text-align: center;
		font-size: clamp(2.5rem, 12vw, 4rem);
		margin: 1rem 0 1.5rem;
	}

	.cross-link {
		display: block;
		margin: 1rem auto 0;
		width: fit-content;
		color: var(--wa-color-text-quiet);
	}
</style>
