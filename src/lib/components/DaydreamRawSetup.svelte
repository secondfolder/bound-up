<script lang="ts">
	import { setupExchangeLog } from '$lib/daydream/exchange-log';
	import type { RawSetupExchanges } from '$lib/daydream/raw-setup-exchanges.svelte';
	import ExchangeLog from './ExchangeLog.svelte';

	/**
	 * How the daydream was set up, at the top of debug mode's raw log
	 * (docs/debug-mode.md, "Setup exchanges"): each suggestion request that
	 * wrote its draft — the round of ideas its idea came from, then the draft
	 * itself — as the new-daydream page's chat log drew it, and under each the
	 * request and answer as they were kept. Nothing at all for a daydream with
	 * none: a ready-made or blank one, one made without debug mode, or one
	 * from before they were kept.
	 */
	let { setup }: { setup: RawSetupExchanges } = $props();

	const TASKS = { ideas: 'Ideas round', daydream: 'Draft' } as const;
</script>

{#if setup.problem || (setup.exchanges && setup.exchanges.length > 0)}
	<li class="setup" data-setup-exchanges>
		<span class="who">How this daydream was set up</span>
		{#if setup.problem}
			<p class="note" role="alert">{setup.problem}</p>
		{/if}
		{#each setup.exchanges ?? [] as exchange (exchange.id)}
			{const content = $derived(exchange.content)}
			{#if content === null}
				<p class="note">This exchange will not open here.</p>
			{:else}
				{const log = $derived(setupExchangeLog(content))}
				<span class="who">
					{TASKS[content.task]} · {Math.max(0, (content.endedAt - content.startedAt) / 1000).toFixed(1)}s
				</span>
				{#if log}
					<ExchangeLog {log} />
				{:else}
					<p class="note">The request is not one this page can read; it is below as it was sent.</p>
				{/if}
				{#if content.response.truncated}
					<p class="note">The answer ran on past what could be kept, and only its start was.</p>
				{/if}
				<wa-details summary="Request, exactly as sent" appearance="plain">
					<pre>{content.request}</pre>
				</wa-details>
				<wa-details summary="Answer, as it was kept" appearance="plain">
					<pre>{content.response.body}</pre>
				</wa-details>
			{/if}
		{/each}
	</li>
{/if}

<style>
	.setup {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		font-size: var(--wa-font-size-s);

		.who,
		.note {
			color: var(--wa-color-text-quiet);
		}

		.note {
			margin: 0;
		}

		pre {
			margin: 0;
			max-block-size: 24rem;
			overflow: auto;
			font-family: var(--wa-font-family-code, monospace);
			white-space: pre-wrap;
			overflow-wrap: anywhere;
		}

		wa-details::part(header) {
			color: var(--wa-color-text-quiet);
		}
	}
</style>
