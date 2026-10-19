<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { setKinkListContext } from '$lib/kink-list/context';
	import { DeviceKinkList } from '$lib/kink-list/device-store.svelte';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';

	let { children }: { children: Snippet } = $props();

	// The list lives in this browser's storage, which the server cannot see:
	// it opens after hydration, and the server's render is a placeholder.
	const store = new DeviceKinkList();

	setKinkListContext({
		store,
		paths: {
			home: resolve('/(public)/kink-list'),
			category: (category) => resolve('/(public)/kink-list/[category]', { category }),
			quick: resolve('/(public)/kink-list/quick')
		}
	});

	onMount(() => store.open());
	onDestroy(() => {
		void store.flush();
	});
</script>

{#if store.state === 'ready'}
	{@render children()}
{:else}
	<h1 class="title">Kink list</h1>
	<p class="quiet" aria-busy="true">{PENDING_TEXT}</p>
{/if}

<style>
	.title,
	.quiet {
		text-align: center;
	}

	.quiet {
		color: var(--wa-color-text-quiet);
	}
</style>
