<script lang="ts">
	import { catalog, intensityLabel } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';

	/**
	 * How intense a list to show: kinks above this stay hidden, everywhere.
	 * Extreme is above the default, so it is seen only by someone who asks.
	 */
	const { store } = kinkListContext();

	const levels = Object.keys(catalog.intensity.levels).map(Number);

	type WaSelect = HTMLElement & { value: string | string[] | null };

	/** Wired by hand: a wa-select's change happens in its shadow root (AGENTS.md). */
	function field(node: WaSelect) {
		const onChange = () => store.setMaxIntensity(Number(node.value));
		node.addEventListener('change', onChange);
		return () => node.removeEventListener('change', onChange);
	}
</script>

<wa-select label="Show kinks up to" value={String(store.list.settings.maxIntensity)} {@attach field}>
	{#each levels as level (level)}
		<wa-option value={String(level)}>{intensityLabel(level)}</wa-option>
	{/each}
</wa-select>
