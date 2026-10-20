<script lang="ts">
	import { resolve } from '$app/paths';
	import KinkListHome from '$lib/components/kink-list/KinkListHome.svelte';
	import { answeredCount } from '$lib/kink-list/answers';
	import { kinkListContext } from '$lib/kink-list/context';
	import { differences } from '$lib/kink-list/partner';
	import type { PartnerKinkList } from '$lib/kink-list/partner-store.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PageData } from './$types';

	/**
	 * Your list for one partner. Until you share it, nothing is sealed for
	 * them and this page explains what sharing does, once, so it never comes
	 * as a surprise; after, it is your list as they see it, with what differs
	 * for them, comparing, and blind mode. There is no "stop sharing": while
	 * you are linked, sharing is what the partnership is for, and unlinking
	 * deletes the copy with the partnership (its `ON DELETE CASCADE`).
	 */
	let { data }: { data: PageData } = $props();

	const { store: contextStore, paths } = kinkListContext();
	const store = contextStore as PartnerKinkList;
	/**
	 * Whether there is anything of your own to share yet. Sharing an empty
	 * list would give your partner a copy with nothing in it, and comparing
	 * would show no matches as though you had none; so until your own list
	 * has something in it, this page starts you on it instead.
	 */
	const hasOwnList = $derived(answeredCount(store.solo.list) > 0);
	const name = $derived(partnerName(data.names));
	const changed = $derived(differences(store.solo.list, store.partner).length);
	const base = $derived(
		resolve('/(auth-required)/(app)/playroom/kink-list/partner/[partnershipId]', {
			partnershipId: data.partnershipId
		})
	);

	let busy = $state(false);

	async function share() {
		busy = true;
		await store.share();
		busy = false;
	}

	type WaSwitch = HTMLElement & { checked: boolean };

	/** Wired by hand: a wa-switch changes inside its shadow root (AGENTS.md). */
	function blindSwitch(node: WaSwitch) {
		node.checked = store.partner.blind.on;
		const onChange = () => store.setBlind(node.checked);
		node.addEventListener('change', onChange);
		return () => node.removeEventListener('change', onChange);
	}
</script>

<svelte:head>
	<title>Kink list for {name} · Bound Up</title>
</svelte:head>

{#if !(store.shared || hasOwnList)}
	<div class="intro">
		<h1>Your kink list for {name}</h1>
		<p>
			Start your own kink list first. Once it has some answers in it, you can share it with {name}
			and compare your lists.
		</p>
		{#if data.theirs}
			<p><strong>{name} already shares theirs with you.</strong></p>
		{/if}
		<div class="row">
			<wa-button variant="brand" appearance="accent" href={paths.quick}>Quick fill</wa-button>
			<wa-button appearance="outlined" href={paths.transfer}>
				Import a list
			</wa-button>
		</div>
	</div>
{:else if !store.shared}
	<div class="intro">
		<h1>Share your kink list with {name}</h1>
		<p>
			{name} will see your answers, and you can compare your lists. You can change any answer just
			for {name}, or keep one from them for now, without touching your own list.
		</p>
		<p>
			Anything you answer here that your own list hasn't answered yet goes on your own list too.
		</p>
		{#if data.theirs}
			<p><strong>{name} already shares theirs with you.</strong></p>
		{/if}
		<div class="row">
			<wa-button variant="brand" appearance="accent" disabled={busy} onclick={() => void share()}>
				Share my list with {name}
			</wa-button>
		</div>
	</div>
{:else}
	<KinkListHome title="Your list for {name}" minimal>
		{#snippet intro()}
			<nav class="partner-links" aria-label="For {name}">
				<a href="{base}/compare">Compare with {name}</a>
				<a href="{base}/differences">Just for {name} ({changed})</a>
			</nav>
			<wa-switch {@attach blindSwitch}>
				Blind comparing: only show what we both want, and limits
			</wa-switch>
		{/snippet}
	</KinkListHome>
{/if}

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-inline-size: 36rem;
		margin-inline: auto;

		h1 {
			text-align: center;
		}

		p {
			margin: 0;
		}
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}

	.partner-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		justify-content: center;
	}
</style>
