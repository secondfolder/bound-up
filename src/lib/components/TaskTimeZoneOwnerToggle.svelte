<script lang="ts">
	import { describeTimeZoneDifference } from '$lib/timezone';

	type Props = {
		viewerUserId: string;
		viewerTimezone: string;
		counterpartUserId: string;
		counterpartTimezone: string;
		counterpartName: string;
		onSelect?: () => void;
		value: string;
	};

	let {
		viewerUserId,
		viewerTimezone,
		counterpartUserId,
		counterpartTimezone,
		counterpartName,
		onSelect = () => undefined,
		value = $bindable()
	}: Props = $props();

	const visible = $derived(viewerTimezone !== counterpartTimezone);
	const counterpartOffset = $derived(describeTimeZoneDifference(counterpartTimezone, viewerTimezone));
</script>

{#snippet option(userId: string, label: string)}
	{const selected = $derived(value === userId)}
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
	<fieldset class="toggle" aria-label="Timezone owner">
		{@render option(viewerUserId, 'Your time')}
		{@render option(counterpartUserId, `${counterpartName}'s time (${counterpartOffset})`)}
	</fieldset>
{/if}

<style>
	.toggle {
		/* A fieldset, for its group semantics; none of its default box. */
		margin: 0;
		padding: 0;
		border: 0;
		min-inline-size: 0;
		display: inline-flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
</style>
