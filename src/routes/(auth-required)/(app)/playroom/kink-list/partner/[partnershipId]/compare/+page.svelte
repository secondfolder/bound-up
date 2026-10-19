<script lang="ts">
	import { resolve } from '$app/paths';
	import CompareView from '$lib/components/kink-list/CompareView.svelte';
	import { kinkListContext } from '$lib/kink-list/context';
	import { asList, effectiveList, type PartnerPayload } from '$lib/kink-list/partner';
	import { openPartnerCopy, type PartnerKinkList } from '$lib/kink-list/partner-store.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	/**
	 * Your list for this partner against theirs for you. Theirs is the copy
	 * they share, which you can open because it is in your partnership's
	 * vault. Blind if either of you has turned blind comparing on: then only
	 * what you both want shows, and limits.
	 */
	let { data }: { data: PageData } = $props();

	const store = kinkListContext().store as PartnerKinkList;
	const name = $derived(partnerName(data.names));

	let theirs = $state<PartnerPayload | null | undefined>(undefined);
	$effect(() => {
		const view = data.theirs;
		if (!view) {
			theirs = null;
			return;
		}
		void openPartnerCopy(view).then((opened) => {
			theirs = opened;
		});
	});

	const blind = $derived(store.partner.blind.on || theirs?.blind.on === true);
	const mine = $derived(effectiveList(store.solo.list, store.partner));
	const messages = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/messages', { id: data.partnershipId })
	);
</script>

<svelte:head>
	<title>You and {name} · Kink list · Bound Up</title>
</svelte:head>

<nav class="crumbs">
	<a href={resolve('/(auth-required)/(app)/playroom/kink-list/partner/[partnershipId]', { partnershipId: data.partnershipId })}
		>Your list for {name}</a
	>
	<a href={messages}>Talk about it in messages</a>
</nav>
<h1>You and {name}</h1>

{#if !store.shared}
	<p class="quiet">Share your list with {name} first: then you can each compare.</p>
{:else if theirs === undefined}
	<p class="quiet" aria-busy="true">{PENDING_TEXT}</p>
{:else if theirs === null}
	<p class="quiet">
		{name} hasn't shared their list with you yet. Once they do, you'll see where you match here.
	</p>
{:else}
	{#if blind}
		<p class="quiet">Blind comparing is on: only what you both want, and limits, are shown.</p>
	{/if}
	<CompareView {mine} theirs={asList(theirs.resolved)} theirName={name} {blind} />
{/if}

<style>
	h1 {
		text-align: center;
	}

	.crumbs {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin-block-end: 1rem;
	}

	.quiet {
		text-align: center;
		color: var(--wa-color-text-quiet);
	}
</style>
