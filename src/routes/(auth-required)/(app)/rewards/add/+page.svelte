<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ForWhom from '$lib/components/ForWhom.svelte';
	import RewardEditorBody from '$lib/components/RewardEditorBody.svelte';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import { itemTargets, partnerIn } from '$lib/item-pages.svelte';
	import type { ItemTarget } from '$lib/item-target';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const listHref = resolve('/(auth-required)/(app)/rewards');
	let sheet: RouteSheet | undefined = $state();

	/** Where it could go: each space the list shows that the viewer sets rewards in. */
	const targets = $derived(itemTargets(data.list.spaces, data.contextSpaces));
	let chosen = $state<ItemTarget | null>(null);
	/**
	 * The space the add button's fan picked, handed over in history state
	 * (`PageState.addFor`). Read once: an `invalidate()` resets `page.state`,
	 * and the choice must not vanish under a form being filled in. None after
	 * a reload or from a pasted link, when "For whom?" asks instead.
	 */
	const handedOver = page.state.addFor;
	const picked = $derived(targets.find((candidate) => candidate.spaceId === handedOver) ?? null);
	const target = $derived(targets.length === 1 ? (targets[0] ?? null) : (picked ?? chosen));
	const forName = $derived(target ? partnerIn(target.spaceId, data.contextSpaces) : null);

	/** Opened by its URL, with no list behind it in history: go to the list in its place. */
	function leave() {
		void goto(resolve('/(auth-required)/(app)/rewards'), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<!-- A sheet over the list, which is this route's parent layout (`RouteSheet`). -->
<RouteSheet
	bind:this={sheet}
	label={forName ? `Add a reward for ${forName}` : 'Add a reward'}
	{listHref}
	{leave}
>
	{#if targets.length > 1 && !picked}
		<!-- Asked first, as on adding a task. Remembered on this device. -->
		<ForWhom
			{targets}
			spaces={data.contextSpaces}
			storageKey="bound-up:rewards-for-whom"
			onchoose={(value) => {
				chosen = value;
			}}
		/>
	{/if}
	{#if target}
		<p class="intro">
			{forName
				? `Only ${forName} can claim this reward, from their credits with you.`
				: 'This reward belongs only to you and is paid for from your own reward balance.'}
		</p>
		{#key target.spaceId}
			<RewardEditorBody {target} onsaved={() => sheet?.close()} />
		{/key}
	{/if}
</RouteSheet>

<style>
	.intro {
		margin: 0 0 var(--wa-space-m);
		color: var(--wa-color-text-quiet);
	}
</style>
