<script lang="ts">
	import { describeTimeZoneDifference } from '$lib/timezone';

	interface Props {
		viewerUserId: string;
		viewerTimezone: string;
		counterpartUserId: string;
		counterpartTimezone: string;
		counterpartName: string;
		onSelect?: () => void;
		value: string;
	}

	let {
		viewerUserId,
		viewerTimezone,
		counterpartUserId,
		counterpartTimezone,
		counterpartName,
		onSelect = () => {},
		value = $bindable()
	}: Props = $props();

	const visible = $derived(viewerTimezone !== counterpartTimezone);
	const counterpartOffset = $derived(
		describeTimeZoneDifference(counterpartTimezone, viewerTimezone)
	);
</script>

{#snippet option(userId: string, label: string)}
	{@const selected = value === userId}
	<wa-button
		type="button"
		size="s"
		pill
		variant={selected ? 'brand' : 'neutral'}
		appearance={selected ? 'filled-outlined' : 'outlined'}
		class:selected
		onclick={() => {
			value = userId;
			onSelect();
		}}
	>
		{label}
	</wa-button>
{/snippet}

{#if visible}
	<div class="toggle" role="group" aria-label="Timezone owner">
		{@render option(viewerUserId, 'Your time')}
		{@render option(counterpartUserId, `${counterpartName}'s time (${counterpartOffset})`)}
	</div>
{/if}

<style>
	.toggle {
		display: inline-flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
</style>
