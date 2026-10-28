<script lang="ts">
	import type { SegmentedKind } from '$lib/components/segmented/context';
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';

	/**
	 * Test-only wrapper: `RadioButtonGroup` takes its options as children,
	 * which cannot be handed to `render()` as plain props. Three options of
	 * different widths, inside a form so a test can read what it submits;
	 * `shown` mounts and unmounts it, for the `continuity` key.
	 */
	let {
		kind = 'radio',
		hideLabel = false,
		value = $bindable(),
		count = 2,
		disabled = false,
		continuity,
		shown = true,
		onchange
	}: {
		kind?: SegmentedKind;
		hideLabel?: boolean;
		value?: 'one' | 'two' | 'three';
		count?: number;
		disabled?: boolean;
		continuity?: string;
		shown?: boolean;
		onchange?: (value: string) => void;
	} = $props();
</script>

<form>
	{#if shown}
		<RadioButtonGroup label="How many" {kind} {hideLabel} name="amount" bind:value {continuity} {onchange}>
			<RadioButton value="one" href="#one">One</RadioButton>
			<RadioButton value="two" href="#two" {count}>A good deal more than one</RadioButton>
			<RadioButton value="three" href="#three" {disabled}>Three</RadioButton>
		</RadioButtonGroup>
	{/if}
</form>
<output>{value ?? 'none'}</output>
