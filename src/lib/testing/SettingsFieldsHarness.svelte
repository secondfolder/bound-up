<script lang="ts">
	import SettingsFields, { type SettingsChoice } from '$lib/components/iq-test/SettingsFields.svelte';

	/**
	 * `SettingsFields` with its value held, as the dialog holds its draft: the
	 * component is controlled, so on its own a change would ask and nothing
	 * would answer. Every change is also reported, for a test to read.
	 */
	let {
		initial,
		onchange,
		sliderLast = false
	}: {
		initial: SettingsChoice;
		onchange?: (choice: SettingsChoice) => void;
		sliderLast?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	let value = $state(initial);
</script>

<SettingsFields
	{value}
	{sliderLast}
	onchange={(choice) => {
		value = choice;
		onchange?.(choice);
	}}
/>
