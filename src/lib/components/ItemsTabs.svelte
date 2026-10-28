<script lang="ts">
	import { resolve } from '$app/paths';
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';

	/**
	 * Tasks | Rewards, at the top of both pages: two routes that read as one
	 * place, since completing tasks is what pays for rewards. Links rather than
	 * tabs over panels (so `kind="link"`, not `TabGroup`): each is a page with
	 * its own URL, its own sheets and its own history. The current one is
	 * `aria-current="page"`.
	 *
	 * Each page draws this in its own layout, so navigating builds a new one;
	 * the `continuity` key is what lets the fill slide across from the page
	 * just left (docs/segmented-controls.md).
	 */
	let { current }: { current: 'tasks' | 'rewards' } = $props();
</script>

<RadioButtonGroup kind="link" label="Tasks and rewards" hideLabel value={current} continuity="items-tabs">
	<RadioButton value="tasks" href={resolve('/(auth-required)/(app)/tasks')}>Tasks</RadioButton>
	<RadioButton value="rewards" href={resolve('/(auth-required)/(app)/rewards')}>Rewards</RadioButton>
</RadioButtonGroup>
