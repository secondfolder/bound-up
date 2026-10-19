<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CompareView from '$lib/components/kink-list/CompareView.svelte';
	import SharedListView from '$lib/components/kink-list/SharedListView.svelte';
	import { answeredCount } from '$lib/kink-list/answers';
	import { kinkListContext } from '$lib/kink-list/context';
	import { decodeShareLink, type SharedList } from '$lib/kink-list/share-link';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';

	/**
	 * A kink list someone shared as a link. The list is in the fragment, which
	 * the server never receives, so it is read here, in the browser, and is
	 * never sent anywhere.
	 *
	 * Signed in, "Compare with mine" goes to the account's compare page, where
	 * the person's own list can be opened. Signed out, it compares against the
	 * list kept on this device, if there is one.
	 */
	const { store } = kinkListContext();

	let shared = $state<SharedList | null | undefined>(undefined);
	let comparing = $state(false);

	async function read() {
		shared = await decodeShareLink(location.hash);
	}

	onMount(() => {
		void read();
		const onHash = () => void read();
		globalThis.addEventListener('hashchange', onHash);
		return () => globalThis.removeEventListener('hashchange', onHash);
	});

	const signedIn = $derived(Boolean(page.data.user));
	const title = $derived(shared?.name ? `${shared.name}’s kink list` : 'A shared kink list');
	const deviceAnswers = $derived(answeredCount(store.list));
</script>

<svelte:head>
	<title>Shared kink list · Bound Up</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if shared === undefined}
	<h1>Kink list</h1>
	<p class="quiet" aria-busy="true">{PENDING_TEXT}</p>
{:else if shared === null}
	<h1>Kink list</h1>
	<p>This link doesn't hold a kink list. It may have been cut short when it was copied.</p>
	<p><a href={resolve('/(public)/kink-list')}>Make your own</a></p>
{:else}
	<h1>{title}</h1>
	<div class="actions">
		{#if signedIn}
			<wa-button
				variant="brand"
				appearance="accent"
				href="{resolve('/(auth-required)/(app)/playroom/kink-list/compare')}{location.hash}"
			>
				Compare with mine
			</wa-button>
			<wa-button appearance="outlined" href={resolve('/(auth-required)/(app)/playroom/kink-list')}>
				Your list
			</wa-button>
		{:else}
			{#if deviceAnswers > 0}
				<wa-button
					variant="brand"
					appearance={comparing ? 'outlined' : 'accent'}
					onclick={() => {
						comparing = !comparing;
					}}
				>
					{comparing ? 'Show their list' : 'Compare with mine'}
				</wa-button>
			{/if}
			<wa-button appearance="outlined" href={resolve('/(public)/kink-list')}>
				{deviceAnswers > 0 ? 'Your list' : 'Make your own'}
			</wa-button>
		{/if}
	</div>

	{#if comparing}
		<CompareView
			mine={store.list}
			theirs={shared.list}
			theirName={shared.name}
			side={store.filters.side}
		/>
	{:else}
		<SharedListView list={shared.list} />
	{/if}
{/if}

<style>
	h1 {
		text-align: center;
	}

	.quiet {
		text-align: center;
		color: var(--wa-color-text-quiet);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		margin-block-end: 1.5rem;
	}
</style>
