<script lang="ts">
	import type { Answer } from '$lib/kink-list/answers';
	import { LEVEL_LABELS } from '$lib/kink-list/answers';
	import { kinkById } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import { differences } from '$lib/kink-list/partner';
	import type { PartnerKinkList } from '$lib/kink-list/partner-store.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PageData } from './$types';

	/** Every answer that differs for this partner, with both answers and what to do about each. */
	let { data }: { data: PageData } = $props();

	const { store: base, paths } = kinkListContext();
	const store = base as PartnerKinkList;
	const name = $derived(partnerName(data.names));
	const rows = $derived(differences(store.solo.list, store.partner));

	function nameOf(key: string): string {
		return kinkById(key)?.name ?? key;
	}

	function words(answer: Answer | undefined): string {
		if (!answer) {
			return 'Not answered';
		}
		const parts = [answer.level, answer.sides?.a?.level, answer.sides?.b?.level].filter(
			(level) => level !== undefined
		);
		return [...new Set(parts)].map((level) => LEVEL_LABELS[level]).join(' / ') || 'A note';
	}
</script>

<svelte:head>
	<title>Just for {name} · Kink list · Bound Up</title>
</svelte:head>

<nav class="crumbs"><a href={paths.home}>Your list for {name}</a></nav>
<h1>Just for {name}</h1>

{#if rows.length === 0}
	<p class="quiet">Every answer {name} sees is the same as on your own list.</p>
{:else}
	<ul class="rows">
		{#each rows as row (row.key)}
			<li>
				<span class="name">{nameOf(row.key)}</span>
				<span class="answers"
					>For {name}: {words(row.override)} · Your own list: {words(row.own)}</span
				>
				<span class="actions">
					<wa-button size="s" appearance="outlined" onclick={() => store.partnerControls?.reset(row.key)}>
						Back to my own answer<span class="wa-visually-hidden">for {nameOf(row.key)}</span>
					</wa-button>
					<wa-button size="s" appearance="outlined" onclick={() => store.partnerControls?.copyToOwn(row.key)}>
						Copy to my own list<span class="wa-visually-hidden">: {nameOf(row.key)}</span>
					</wa-button>
				</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 {
		text-align: center;
	}

	.crumbs {
		margin-block-end: 1rem;
	}

	.quiet {
		text-align: center;
		color: var(--wa-color-text-quiet);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;

		/* Web Awesome's native styles indent every <li> for its marker. */
		li {
			margin: 0;
			display: flex;
			flex-direction: column;
			gap: 0.35rem;
			padding-block-end: 0.75rem;
			border-block-end: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		}
	}

	.name {
		font-weight: var(--wa-font-weight-semibold);
	}

	.answers {
		font-size: 0.9rem;
		color: var(--wa-color-text-quiet);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
