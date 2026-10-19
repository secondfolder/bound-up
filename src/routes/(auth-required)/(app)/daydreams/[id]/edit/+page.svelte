<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import DaydreamSetupForm from '$lib/components/DaydreamSetupForm.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { reportRequestFailure } from '$lib/request-failure.svelte';
	import { openedDaydreamSetup, PENDING_TEXT, UNREADABLE_TEXT } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const setup = $derived(openedDaydreamSetup(data.daydream.setup));
	const daydreamHref = $derived(
		resolve('/(auth-required)/(app)/daydreams/[id]', { id: data.daydream.id })
	);
</script>

<section class="page">
	<NestedPageHeader
		backHref={daydreamHref}
		backLabel="Back to the daydream"
		backText="Daydream"
		title="Change the setup"
		description="Changes apply from the next passage. What has already happened stays as it is."
	/>

	<div class="content">
		<!-- Mounted only once the setup is open, so the form starts from it rather
		     than from empty fields that fill in a moment later. -->
		{#if setup}
			<DaydreamSetupForm
				setupForm={data.setupForm}
				daydream={{ id: data.daydream.id, revision: data.daydream.revision, setup }}
				library={data.library}
				suggestionsOn={data.accepted && data.available}
				picturesAvailable={data.picturesAvailable}
				submitLabel="Save setup"
			/>
		{:else}
			<p class="placeholder">{setup === undefined ? PENDING_TEXT : UNREADABLE_TEXT}</p>
		{/if}

		<!-- The action is the daydream page's: deleting it is about the daydream,
		     not the setup, and this is just where the button lives. -->
		<form
			class="delete"
			method="POST"
			action={`${daydreamHref}?/delete`}
			use:enhance={({ cancel }) => {
				// biome-ignore lint/suspicious/noAlert: the native confirm is the confirmation step, as for disconnecting a partner.
				if (!confirm('Delete this daydream and everything said in it? This cannot be undone.')) {
					cancel();
				}
				return async ({ result, update }) => {
					if (result.type === 'error') {
						reportRequestFailure(result);
						return;
					}
					await update();
				};
			}}
		>
			<wa-button type="submit" appearance="outlined" variant="danger">Delete daydream</wa-button>
		</form>
	</div>
</section>

<style>
	.page {
		max-width: 48rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--wa-space-l) var(--wa-space-l);
	}

	.delete {
		margin-block-start: 2rem;
		padding-block-start: 1rem;
		border-block-start: 1px solid var(--wa-color-surface-border);
	}

	.placeholder {
		color: var(--wa-color-text-quiet);
	}
</style>
