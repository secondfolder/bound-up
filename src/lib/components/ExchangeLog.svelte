<script lang="ts">
	import type { ExchangeLogView } from '$lib/daydream/exchange-log';
	import ExchangeEntries from './ExchangeEntries.svelte';

	/**
	 * How a draft or ideas were written, for debug mode (docs/debug-mode.md):
	 * the whole exchange with the model, from the system prompt to how it
	 * ended, as `suggestionLog` read it. Nothing here is kept; it is the
	 * answer's own. A daydream's raw log draws its exchanges with the same
	 * bubbles (`DaydreamRawExchange`).
	 */
	let { log }: { log: ExchangeLogView } = $props();
</script>

<wa-details summary="Chat log: {log.model}, {log.api}" class="log">
	<ExchangeEntries entries={log.entries} />
</wa-details>
