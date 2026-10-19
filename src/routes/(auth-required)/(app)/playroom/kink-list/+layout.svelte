<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import UnreadableList from '$lib/components/kink-list/UnreadableList.svelte';
	import { currentVaults } from '$lib/crypto/vaults.svelte';
	import { AccountKinkList } from '$lib/kink-list/account-store.svelte';
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
			quick: resolve('/(auth-required)/(app)/playroom/kink-list/quick'),
			transfer: resolve('/(auth-required)/(app)/playroom/kink-list/transfer'),
			// Read each time, so it follows `data` after an invalidate: there is
			// no History to offer until a version has been kept.
			get history() {
				return data.hasHistory
					? resolve('/(auth-required)/(app)/playroom/kink-list/history')
					: undefined;
			}
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

	// The copies shared with partners follow your own list: sealed again after
	// it saves, and once when it opens, in case it changed on another device.
	// One at a time, so two saves in a row cannot race each other's copies.
	// svelte-ignore state_referenced_locally
	let { shared } = data;
	let syncing: Promise<void> = Promise.resolve();
	function syncShared() {
		if (shared.length === 0) {
			return;
		}
		syncing = syncing.then(async () => {
			const { syncSharedCopies } = await import('$lib/kink-list/partner-sync');
			shared = await syncSharedCopies(store.list, store.revision, shared);
		});
	}
	store.afterSave = () => syncShared();
	let synced = false;
	$effect(() => {
		if (store.state === 'ready' && !synced) {
			synced = true;
			syncShared();
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
		<UnreadableList {store} />
	{:else}
		<h1>Kink list</h1>
		<p class="quiet" aria-busy="true">{PENDING_TEXT}</p>
	{/if}
</div>

<style>
	/* The app shell's <main> is the full-width scroll container, so the page
	   carries its own column, as the Playroom index does. Full width up to
	   that, rather than its content's: <main> is a flex container, where
	   auto margins shrink an item to fit, and the kink rows are a size
	   container (KinkRow's context columns), which counts for nothing when
	   fitting. The page shrank to a column too narrow for two contexts. */
	.page {
		box-sizing: border-box;
		inline-size: 100%;
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
