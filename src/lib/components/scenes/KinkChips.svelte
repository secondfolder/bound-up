<script lang="ts">
	import { resolve } from '$app/paths';
	import { openOwnList } from '$lib/kink-list/account-store.svelte';
	import type { ListPayload } from '$lib/kink-list/answers';
	import { compareLists } from '$lib/kink-list/compare';
	import { asList, effectiveList, type PartnerPayload } from '$lib/kink-list/partner';
	import { openPartnerCopy } from '$lib/kink-list/partner-store.svelte';
	import { type KinkChip, ownKinkChips, sharedKinkChips } from '$lib/scenes/shared-kinks';
	import type { KinkListView } from '$lib/types';
	import '$lib/components/choice-controls.css';

	/**
	 * "What you're into": the kinks a scene could draw on, as chips that put
	 * themselves on the page (into a menu, when there is one). In a shared
	 * scene that is what you both said yes to, on the lists you share with
	 * each other; in a solo one, what you like. Everything is opened here, in
	 * the browser: the lists are sealed. See docs/scenes.md, "What you're
	 * into".
	 */
	let {
		kinkLists,
		partnershipId,
		level,
		readOnly,
		onPick
	}: {
		kinkLists: {
			own: KinkListView | null;
			mineForPartner: KinkListView | null;
			theirs: KinkListView | null;
		};
		partnershipId: string | null;
		level: number;
		readOnly: boolean;
		onPick: (chip: KinkChip) => void;
	} = $props();

	type Opened = {
		own: ListPayload | null;
		mineForPartner: PartnerPayload | null;
		theirs: PartnerPayload | null;
	};

	let opened = $state.raw<Opened | null>(null);

	// Read once, like the rest of the page's sealed data: a refresh of the load
	// reassigns the prop, and reopening every list on each would be wasted work.
	const own = $derived(kinkLists.own);
	const mineForPartner = $derived(kinkLists.mineForPartner);
	const theirs = $derived(kinkLists.theirs);
	$effect(() => {
		const views = { own, mineForPartner, theirs };
		let cancelled = false;
		void Promise.all([
			views.own ? openOwnList(views.own.sealed) : null,
			views.mineForPartner ? openPartnerCopy(views.mineForPartner) : null,
			views.theirs ? openPartnerCopy(views.theirs) : null
		]).then(([ownList, mineCopy, theirCopy]) => {
			if (!cancelled) {
				opened = { own: ownList, mineForPartner: mineCopy, theirs: theirCopy };
			}
		});
		return () => {
			cancelled = true;
		};
	});

	const chips = $derived.by((): KinkChip[] | 'no-list' | 'not-shared' | null => {
		if (!opened) {
			return null;
		}
		const mine = opened.own;
		if (!partnershipId) {
			return mine ? ownKinkChips(mine, level) : 'no-list';
		}
		if (!opened.theirs) {
			return 'not-shared';
		}
		const myList = mine ?? opened.mineForPartner?.resolved;
		if (!myList) {
			return 'no-list';
		}
		const effective =
			mine && opened.mineForPartner ? effectiveList(mine, opened.mineForPartner) : asListOf(myList);
		const blind = opened.theirs.blind.on || opened.mineForPartner?.blind.on === true;
		return sharedKinkChips(compareLists(effective, asList(opened.theirs.resolved)), {
			level,
			blind
		});
	});

	function asListOf(list: ListPayload | PartnerPayload['resolved']): ListPayload {
		return 'settings' in list ? list : asList(list);
	}

	const kinkListHref = $derived(
		partnershipId
			? resolve('/(auth-required)/(app)/playroom/kink-list/partner/[partnershipId]', {
					partnershipId
				})
			: resolve('/(auth-required)/(app)/playroom/kink-list')
	);
</script>

{#if chips === null}
	<div class="loading" role="status" aria-busy="true" aria-label="Opening your kink lists">
		{#each [40, 60, 50] as width (width)}
			<wa-skeleton effect="sheen" style:inline-size="{width}%"></wa-skeleton>
		{/each}
	</div>
{:else if chips === 'no-list'}
	<p class="quiet">
		Fill in your <a href={kinkListHref}>kink list</a> and what you’re into will show up here.
	</p>
{:else if chips === 'not-shared'}
	<p class="quiet">
		Once you’ve both <a href={kinkListHref}>shared your kink lists</a> with each other, what you
		both want will show up here.
	</p>
{:else if chips.length === 0}
	<p class="quiet">Nothing you both want yet. More shows what one of you is curious about.</p>
{:else}
	<div class="chips">
		{#each chips as chip (`${chip.kinkId}:${chip.sides}`)}
			<button
				type="button"
				class="choice-chip"
				disabled={readOnly}
				title={chip.sides || undefined}
				onclick={() => onPick(chip)}
			>
				{chip.name}{#if chip.sides}<span class="sides">{` · ${chip.sides}`}</span>{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
	}

	.sides {
		color: var(--wa-color-text-quiet);
	}

	.quiet {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.loading {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}

	.loading wa-skeleton {
		block-size: 1em;
	}
</style>
