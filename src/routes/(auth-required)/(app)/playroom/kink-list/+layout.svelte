<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { currentVaults } from '$lib/crypto/vaults.svelte';
	import { ACCOUNT_LIST_UNREADABLE, AccountKinkList } from '$lib/kink-list/account-store.svelte';
	import { setKinkListContext } from '$lib/kink-list/context';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Built once from the first load: the store is the live list from then on,
	// and an `invalidate()` handing over a newer `data` must not replace it
	// (AGENTS.md, on effects that read `data`).
	// svelte-ignore state_referenced_locally
	const store = new AccountKinkList(data.list);

	setKinkListContext({
		store,
		paths: {
			home: resolve('/(auth-required)/(app)/playroom/kink-list'),
			category: (category) =>
				resolve('/(auth-required)/(app)/playroom/kink-list/[category]', { category }),
			quick: resolve('/(auth-required)/(app)/playroom/kink-list/quick')
		}
	});

	// The list opens in the person's own vault, which exists only once the
	// keyring is unlocked and the vaults are worked out. Until then it is a
	// placeholder, never content (AGENTS.md).
	const vaultStatus = $derived(currentVaults().status);
	$effect(() => {
		if (store.state === 'loading' && (vaultStatus === 'ready' || vaultStatus === 'failed')) {
			void store.open();
		}
	});

	onDestroy(() => {
		void store.flush();
	});
</script>

<div class="page">
	{#if store.state === 'ready'}
		{@render children()}
	{:else if store.state === 'unreadable'}
		<h1>Kink list</h1>
		<p class="quiet">{ACCOUNT_LIST_UNREADABLE} Reload to try again.</p>
	{:else}
		<h1>Kink list</h1>
		<p class="quiet" aria-busy="true">{PENDING_TEXT}</p>
	{/if}
</div>

<style>
	/* The app shell's <main> is the full-width scroll container, so the page
	   carries its own column, as the Playroom index does. */
	.page {
		max-width: 800px;
		margin-inline: auto;
		padding: 1em;
	}

	h1 {
		text-align: center;
	}

	.quiet {
		text-align: center;
		color: var(--wa-color-text-quiet);
	}
</style>
