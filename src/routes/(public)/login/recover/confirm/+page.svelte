<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import AuthBox from '$lib/components/AuthBox.svelte';
	import AuthPage from '$lib/components/AuthPage.svelte';
	import { superForm } from '$lib/superform';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let ready = $state(false);
	let missing = $state(false);

	// svelte-ignore state_referenced_locally
	// Captures the load's initial `data` on purpose: `superForm` registers its
	// lifecycle once, and re-running it on every `invalidate()` would reset the
	// form.
	const superform = superForm(data.confirmForm, { resetForm: false });
	const { form, message, submitting, allErrors } = superform;

	onMount(() => {
		// From the fragment, which the browser never sent with the page request —
		// see the load.
		const token = new URLSearchParams(location.hash.slice(1)).get('token');
		if (token) {
			form.update((value) => ({ ...value, token }));
		} else {
			missing = true;
		}
		ready = true;
	});

	const outcome = $derived.by(() => {
		if ($message === 'confirmed') {
			return 'confirmed';
		}
		// A malformed token is refused by the schema, and reads the same as one
		// that matched nothing.
		if ($message === 'invalid' || $allErrors.length > 0 || missing) {
			return 'invalid';
		}
		return null;
	});
</script>

<svelte:head><title>Confirm it's you</title></svelte:head>

<AuthPage title="Is this you?">
	<AuthBox busy={$submitting} busyLabel="Confirming">
		{#if outcome === 'confirmed'}
			<p role="status">
				Thanks — that's confirmed. Go back to the page where you asked for help. Once your partner
				has confirmed too, you'll be logged in there.
			</p>
		{:else if outcome === 'invalid'}
			<p role="status">
				This link doesn't work any more. It may have expired, or been replaced by a newer request.
				You can start again from the log-in page.
			</p>
			<wa-button href={resolve('/(public)/login/recover')} variant="brand" appearance="outlined">
				Start again
			</wa-button>
		{:else}
			<p>
				Someone asked to log back in to your account with a new password, with a partner vouching
				for them. Only confirm if that was you.
			</p>
			<form method="POST" use:superform.enhance data-ready={ready ? 'true' : undefined}>
				<input type="hidden" name="token" value={$form.token} />
				<wa-button
					type="submit"
					variant="brand"
					appearance="accent"
					disabled={!ready || $submitting}
				>
					Yes, this is me
				</wa-button>
			</form>
			<p class="quiet">
				If it wasn't you, close this page. Without this, the request cannot finish, and it expires
				within a day.
			</p>
		{/if}
	</AuthBox>
</AuthPage>

<style>
	form {
		display: flex;
		flex-direction: column;
	}

	.quiet {
		color: var(--wa-color-text-quiet);
		font-size: 0.9375rem;
	}
</style>
