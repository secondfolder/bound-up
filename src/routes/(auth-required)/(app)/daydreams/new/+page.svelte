<script lang="ts">
	import { resolve } from '$app/paths';
	import DaydreamSetupForm from '$lib/components/DaydreamSetupForm.svelte';
	import DaydreamStarter from '$lib/components/DaydreamStarter.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import type { DaydreamSetup } from '$lib/daydream';
	import { assembleSetup, type StarterSide, starterSetup } from '$lib/daydream/starters';
	import { suggestDaydream } from '$lib/daydream/suggest';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Where the page is: choosing a way in, or setting the daydream up. Kept
	 * on the page rather than in the URL, because a draft is what the user
	 * is making and has no business in their history. `version` remounts the
	 * form for each new draft, which superforms needs to start from it.
	 */
	type Stage =
		| { kind: 'start' }
		| {
				kind: 'setup';
				draft: DaydreamSetup | null;
				layout: 'sentence' | 'full';
				/** Whether the model wrote it, so "Try another" can ask again. */
				described: boolean;
				version: number;
		  };

	let stage: Stage = $state({ kind: 'start' });
	let idea = $state('');
	// The load's first draw, captured once: the shuffle replaces them from
	// here, and a re-run load drawing again must not swap them underneath.
	// svelte-ignore state_referenced_locally
	let ideas = $state(data.ideas);
	let side: StarterSide | null = $state(null);
	let asking = $state(false);
	let problem: string | null = $state(null);
	let versions = 0;

	const suggestionsOn = $derived(data.accepted && data.available);

	function setUp(draft: DaydreamSetup | null, described: boolean) {
		versions += 1;
		stage = {
			kind: 'setup',
			draft,
			layout: draft ? 'sentence' : 'full',
			described,
			version: versions
		};
	}

	/**
	 * Asks the model to put a daydream together from what was written.
	 * `limits` are any the user has written on the setup since, kept on the
	 * new draft and told to the model, so "Try another" never loses them.
	 */
	async function writeDraft(limits = '') {
		asking = true;
		problem = null;
		const answer = await suggestDaydream({ idea, limits });
		asking = false;
		if (!answer.ok) {
			problem = answer.error;
			return;
		}
		setUp({ ...assembleSetup(answer.value), limits }, true);
	}
</script>

<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/daydreams')}
		backLabel="Back to daydreams"
		backText="Daydreams"
		title="New daydream"
		description={stage.kind === 'start'
			? 'Say what you feel like, or pick one to start from. You can change any of it.'
			: 'Change anything you like, then start. You can change it later too.'}
	/>

	<div class="content">
		{#if stage.kind === 'start'}
			<DaydreamStarter
				bind:idea
				bind:ideas
				bind:side
				{suggestionsOn}
				{asking}
				{problem}
				ondescribe={() => writeDraft()}
				onstarter={(starter) => setUp(starterSetup(starter), false)}
				onblank={() => setUp(null, false)}
			/>
		{:else}
			<wa-button
				class="back"
				appearance="plain"
				size="s"
				onclick={() => {
					problem = null;
					stage = { kind: 'start' };
				}}
			>
				<wa-icon slot="start" name="arrow-left" variant="solid"></wa-icon>
				Other ways to start
			</wa-button>
			{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
			{#key stage.version}
				<DaydreamSetupForm
					setupForm={data.setupForm}
					draft={stage.draft}
					layout={stage.layout}
					onretry={stage.described ? (limits) => writeDraft(limits) : undefined}
					retrying={asking}
					library={data.library}
					{suggestionsOn}
					submitLabel="Start daydreaming"
				/>
			{/key}
		{/if}
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
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0 var(--wa-space-l) var(--wa-space-l);
	}

	.back {
		align-self: flex-start;
	}

	.invalid {
		margin: 0;
		color: var(--wa-color-text-danger);
	}
</style>
