<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import DreamPreferenceForm from '$lib/components/dreams/DreamPreferenceForm.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { promotable, withoutPreference, withPreference } from '$lib/dream/preferences';
	import {
		DreamRequestError,
		listDreams,
		openSetup,
		readPreferences,
		savePreferences
	} from '$lib/dream-browser/api';
	import type { DreamPreference, DreamSetup } from '$lib/sealed-kinds/dreams';
	import type { PageData } from './$types';

	/**
	 * Every preference the user's daydreams keep in mind (docs/dreams.md,
	 * "Preferences"): limits ("Never"), defaults and leanings, each with where
	 * it came from, so nothing is remembered silently. Story preferences that
	 * turn up in three daydreams are suggested as general here, never made so
	 * without a tap.
	 */
	let { data }: { data: PageData } = $props();

	let preferences = $state<DreamPreference[] | null>(null);
	let revision = $state<number | null>(null);
	let setups = $state<DreamSetup[]>([]);
	let problem = $state<string | null>(null);

	onMount(async () => {
		try {
			const stored = await readPreferences();
			({ revision } = stored);
			({ preferences } = stored.preferences);
			const dreams = await listDreams();
			const opened = await Promise.all(dreams.slice(0, 40).map((dream) => openSetup(dream.setup)));
			setups = opened.filter((setup): setup is DreamSetup => setup !== null);
		} catch (cause) {
			problem =
				cause instanceof DreamRequestError ? cause.message : 'Your preferences could not be read.';
		}
	});

	const suggestions = $derived(preferences ? promotable(setups, preferences) : []);

	async function save(next: DreamPreference[]): Promise<boolean> {
		problem = null;
		try {
			revision = await savePreferences(data.userId, { preferences: next }, revision);
			preferences = next;
			return true;
		} catch (cause) {
			problem =
				cause instanceof DreamRequestError ? cause.message : 'Your preferences could not be saved.';
			return false;
		}
	}

	const GROUPS = [
		{
			firmness: 'hard',
			title: 'Never',
			note: 'Your limits. Followed as closely as the model can manage, not guaranteed.'
		},
		{ firmness: 'default', title: 'By default', note: 'Followed unless a brief says otherwise.' },
		{
			firmness: 'leaning',
			title: 'Usually',
			note: 'Tastes. Left out now and then, so not every daydream is the same.'
		}
	] as const;

	const SOURCES: Record<DreamPreference['source'], string> = {
		typed: 'You wrote this',
		answer: 'From your answer to a question',
		noticed: 'Noticed in what you wrote',
		amendment: 'From a change you asked for'
	};
</script>

<div class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/dreams')}
		backLabel="Back to your daydreams"
		backText="Daydreams"
		title="What I keep in mind"
	/>

	<div class="content">
		{#if problem}<wa-callout variant="danger">{problem}</wa-callout>{/if}

		{#if preferences === null}
			<div class="loading" role="status" aria-label="Opening your preferences">
				<wa-skeleton effect="sheen"></wa-skeleton>
				<wa-skeleton effect="sheen"></wa-skeleton>
			</div>
		{:else}
			{#if suggestions.length > 0}
				<section aria-labelledby="suggested">
					<h2 id="suggested">Keep for every daydream?</h2>
					<p class="quiet">These came up in three daydreams or more.</p>
					<ul class="list">
						{#each suggestions as suggestion (suggestion.id)}
							<li>
								<span>{suggestion.text}</span>
								<wa-button
									size="s"
									appearance="outlined"
									onclick={() => save(withPreference(preferences ?? [], { ...suggestion, id: crypto.randomUUID().slice(0, 8) }))}
									>Keep it</wa-button
								>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#each GROUPS as group (group.firmness)}
				{const entries = $derived(preferences.filter((entry) => entry.firmness === group.firmness))}
				<section aria-labelledby={`group-${group.firmness}`}>
					<h2 id={`group-${group.firmness}`}>{group.title}</h2>
					<p class="quiet">{group.note}</p>
					{#if entries.length > 0}
						<ul class="list">
							{#each entries as entry (entry.id)}
								<li>
									<span>
										{entry.text}
										<small>{SOURCES[entry.source]}{entry.appliesTo ? ` · for ${entry.appliesTo}` : ''}</small>
									</span>
									<wa-button size="s" appearance="plain" onclick={() => save(withoutPreference(preferences ?? [], entry.id))}>
										<wa-icon name="xmark" label={`Forget “${entry.text}”`}></wa-icon>
									</wa-button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="quiet">None yet.</p>
					{/if}
				</section>
			{/each}

			<section aria-labelledby="add">
				<h2 id="add">Add one</h2>
				<DreamPreferenceForm
					onadd={(added) =>
						save(
							withPreference(preferences ?? [], {
								id: crypto.randomUUID().slice(0, 8),
								text: added.text,
								firmness: added.firmness,
								appliesTo: added.appliesTo,
								source: 'typed'
							})
						)}
				/>
			</section>
		{/if}
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		max-width: var(--page-width);
		width: 100%;
		margin-inline: auto;
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
		padding: 0 var(--page-gutter) var(--wa-space-xl);

		h2 {
			margin: 0 0 var(--wa-space-2xs);
			font-size: var(--wa-font-size-m);
		}
	}

	.quiet {
		margin: 0 0 var(--wa-space-xs);
		color: var(--wa-color-text-quiet);
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--wa-space-s);
			padding-block: var(--wa-space-2xs);
		}

		small {
			display: block;
			color: var(--wa-color-text-quiet);
		}
	}

	.loading {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}
</style>
