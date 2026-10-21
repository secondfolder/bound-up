<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { onChoose } from '$lib/components/prompt-review/choose';
	import PromptReview from '$lib/components/prompt-review/PromptReview.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = resolve('/(auth-required)/(app)/debug');

	/** Another builder is another catalogue, so this one navigates and the load fetches it. */
	function openBuilder(id: string) {
		const query = new URLSearchParams({ builder: id });
		// A runtime query on a resolved route: the load ignores a builder it does not know.
		// biome-ignore lint/plugin: see above — a resolved route plus a validated query.
		void goto(`${resolve('/(auth-required)/(app)/debug/prompts')}?${query}`);
	}
</script>

<svelte:head>
	<title>Daydream prompts · Debug tools · Bound Up</title>
</svelte:head>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to debug tools"
		backText="Debug tools"
		title="Daydream prompts"
		description="Every prompt the daydream models are sent, and the paragraphs they are made of. Words a user would write are shown as ⟦placeholders⟧."
	/>

	<div class="content">
		<wa-select label="Prompt" value={data.builder.id} {@attach onChoose(openBuilder)}>
			{#each data.builders as builder (builder.id)}
				<wa-option value={builder.id}>{builder.label}</wa-option>
			{/each}
		</wa-select>
		<p class="description">{data.builder.description}</p>

		{#key data.builder.id}
			<PromptReview catalogue={data.catalogue} starters={data.starters} initial={page.url.searchParams} />
		{/key}
	</div>
</section>

<style>
	section {
		max-width: var(--page-width-wide);
		margin: 0 auto;
		width: 100%;
		padding-bottom: var(--wa-space-l);
	}

	.content {
		display: flex;
		flex-direction: column;
		padding: var(--wa-space-l) var(--page-gutter);
	}

	.description {
		margin: 0.25rem 0 1rem;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}
</style>
