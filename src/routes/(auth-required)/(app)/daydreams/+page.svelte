<script lang="ts">
	import { resolve } from '$app/paths';
	import DaydreamDisclosure from '$lib/components/DaydreamDisclosure.svelte';
	import { openedDaydreamSetup, openedPart, shownText } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<div class="page">
	<h1>Daydreams</h1>
	<p class="intro">Scenes you play with a character you make up.</p>

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

		{#if data.daydreams.length > 0}
			<ul class="daydreams">
				{#each data.daydreams as daydream (daydream.id)}
					{const setup = $derived(openedDaydreamSetup(daydream.setup))}
					<li>
						<a href={resolve('/(auth-required)/(app)/daydreams/[id]', { id: daydream.id })}>
							<span class="title">{shownText(openedPart(setup, (value) => value.title))}</span>
							<span class="detail">
								{#if setup}with {setup.characterName} ·
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
		max-width: 800px;
		margin-inline: auto;
		padding: 1em;

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
