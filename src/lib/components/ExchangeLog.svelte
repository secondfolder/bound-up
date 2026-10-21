<script lang="ts">
	import { type ExchangeLogView, formatCost } from '$lib/daydream/exchange-log';
	import ExchangeEntries from './ExchangeEntries.svelte';

	/**
	 * How a draft or ideas were written, for debug mode (docs/debug-mode.md):
	 * the whole exchange with the model, from the system prompt to how it
	 * ended, as `suggestionLog` read it: the answer's own, or one a daydream
	 * kept from when it was set up (`DaydreamRawSetup`). A daydream's raw log
	 * draws its own exchanges with the same bubbles (`DaydreamRawExchange`).
	 * The heading says what the request cost, where OpenRouter said.
	 */
	let { log }: { log: ExchangeLogView } = $props();
</script>

<wa-details
	summary="Chat log: {log.model}, {log.api}{log.cost === null ? '' : ` · ${formatCost(log.cost)}`}"
	class="log"
>
	<ExchangeEntries entries={log.entries} />
</wa-details>
