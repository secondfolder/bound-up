<script lang="ts">
	import { resolve } from '$app/paths';
	import DaydreamDisclosure from '$lib/components/DaydreamDisclosure.svelte';
	import { daydreamTitle } from '$lib/daydream';
	import type { DaydreamSetupContent } from '$lib/sealed-kinds/daydreams';
	import { openedDaydreamSetup, openedPart, shownText } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	/** Who is in it, in a few words: the characters' names, or how it is told when there are none. */
	function withWhom(setup: DaydreamSetupContent): string {
		const names = setup.characters.map((character) => character.name);
		if (names.length > 0) {
			return `with ${new Intl.ListFormat(undefined, { type: 'conjunction' }).format(names)}`;
		}
		switch (setup.voice.narrator) {
			case 'impersonal':
				return 'under the rules';
			case 'monologue':
				return 'a monologue';
			default:
				return 'told to you';
		}
	}
</script>

<div class="page">
	<h1>Daydreams</h1>
	<p class="intro">Stories you make up and play: with characters, or told to you.</p>

	{#if !data.available}
		<wa-callout variant="neutral">
			Daydreams aren't set up on this server yet. Whoever runs it can turn them on.
		</wa-callout>
	{:else if !data.accepted}
		<DaydreamDisclosure action={`${resolve('/(auth-required)/(app)/daydreams')}?/acceptDisclosure`} />
	{:else}
		<wa-button class="new" href={resolve('/(auth-required)/(app)/daydreams/new')} variant="brand">
			<wa-icon slot="start" name="plus" variant="solid"></wa-icon>
			New daydream
		</wa-button>
		<nav class="libraries" aria-label="Your library">
			<a href={resolve('/(auth-required)/(app)/daydreams/characters')}>Your characters</a>
			<a href={resolve('/(auth-required)/(app)/daydreams/ideas')}>Your ideas</a>
		</nav>

		{#if data.daydreams.length > 0}
			<ul class="daydreams">
				{#each data.daydreams as daydream (daydream.id)}
					{const setup = $derived(openedDaydreamSetup(daydream.setup))}
					<li>
						<a href={resolve('/(auth-required)/(app)/daydreams/[id]', { id: daydream.id })}>
							<span class="title">{shownText(openedPart(setup, daydreamTitle))}</span>
							<span class="detail">
								{#if setup}{withWhom(setup)} ·
								{/if}{daydream.lastTurnAt
									? `played ${dateFormat.format(daydream.lastTurnAt)}`
									: 'not started yet'}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	/* The app shell's <main> is the full-width scroll container, so the page
	   carries its own column, as the Playroom does. */
	.page {
		max-width: var(--page-width);
		margin-inline: auto;
		padding: var(--wa-space-m) var(--page-gutter);

		h1 {
			text-align: center;
			margin-block-end: 0.25em;
		}

		.intro {
			text-align: center;
			color: var(--wa-color-text-quiet);
			margin-block-start: 0;
		}

		> wa-callout,
		> :global(.disclosure) {
			display: block;
			max-inline-size: 30rem;
			margin: 2rem auto 0;
		}

		.new {
			display: flex;
			max-inline-size: 30rem;
			margin: 2rem auto 0;
		}

		.libraries {
			display: flex;
			justify-content: center;
			gap: 1.5rem;
			margin-block-start: 0.75rem;
		}
	}

	.daydreams {
		list-style: none;
		padding: 0;
		margin: 1.5rem auto 0;
		max-inline-size: 30rem;
		display: grid;
		gap: 0.75rem;

		a {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			padding: 0.875rem 1.25rem;
			border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-l);
			background: var(--wa-color-surface-default);
			color: inherit;
			text-decoration: none;

			&:hover,
			&:focus-visible {
				border-color: var(--wa-color-brand-border-loud);
			}

			.title {
				font-weight: 600;
			}

			.detail {
				font-size: 0.875rem;
				color: var(--wa-color-text-quiet);
			}
		}
	}
</style>
