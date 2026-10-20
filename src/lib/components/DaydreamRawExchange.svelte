<script lang="ts">
	import {
		historyAgainst,
		type LogEntry,
		parseRequest,
		sentEntry,
		settingsEntry,
		streamEntries
	} from '$lib/daydream/exchange-log';
	import type { OpenedExchange } from '$lib/daydream/story.svelte';
	import ExchangeEntries from './ExchangeEntries.svelte';

	/**
	 * One request to the model and its answer, in debug mode's raw log
	 * (docs/debug-mode.md, "Daydreams' raw log"), from the exchange kept
	 * verbatim (`daydream-exchange`): what the request added to the one
	 * before, open, and its history closed; its settings; the model's
	 * reasoning, reply and how it ended; and under it all, the request and
	 * the response exactly as they went. For a request that wrote no passage
	 * — it failed, or was stopped before anything arrived — this is all
	 * there is of it.
	 */
	let {
		exchange,
		previous
	}: {
		exchange: OpenedExchange;
		/** The exchange that wrote the passage before this one's on the branch, to compare histories with. */
		previous: OpenedExchange | null;
	} = $props();

	const content = $derived(exchange.content);
	const request = $derived(content ? parseRequest(content.request) : null);
	const before = $derived(previous?.content ? parseRequest(previous.content.request) : null);
	const history = $derived(request ? historyAgainst(request, before) : null);

	const entries: LogEntry[] = $derived.by(() => {
		if (!(content && request && history)) {
			return [];
		}
		const shared = request.messages.slice(0, history.shared);
		return [
			...(shared.length > 0
				? [
						{
							who: 'user' as const,
							label: `History: ${shared.length} ${shared.length === 1 ? 'message' : 'messages'}, as the request before sent ${shared.length === 1 ? 'it' : 'them'}`,
							text: shared.map((message) => `── ${message.role} ──\n${message.content}`).join('\n\n')
						}
					]
				: []),
			...request.messages.slice(history.shared).map(sentEntry),
			settingsEntry(request),
			...streamEntries(content.response.body)
		];
	});
	/** Open: what this request added, and what the model said back. The rest is a tap away. */
	const sharedShown = $derived(history && history.shared > 0 ? 1 : 0);
	const added = $derived(request && history ? request.messages.length - history.shared : 0);
	function shownOpen(entry: LogEntry, index: number): boolean {
		if (index >= sharedShown && index < sharedShown + added) {
			return entry.who !== 'system';
		}
		return entry.label === 'Reply' || entry.label === 'Reasoning';
	}

	const seconds = $derived(
		content ? Math.max(0, (content.endedAt - content.startedAt) / 1000).toFixed(1) : null
	);
	const ENDED = {
		done: 'finished',
		error: 'ended in an error',
		stopped: 'stopped',
		dropped: 'cut off'
	} as const;
</script>

<li class="exchange" data-exchange={exchange.id} data-exchange-for={exchange.turnId ?? ''}>
	{#if content === null}
		<p class="note">This exchange will not open here.</p>
	{:else}
		<span class="who">
			Exchange · {ENDED[content.ended]} · {seconds}s · HTTP {content.response.status}{exchange.turnId
				? ''
				: ' · wrote no passage'}
		</span>
		{#if !exchange.saved}
			<p class="note" role="note">This exchange was not saved: it is only here until the page closes.</p>
		{/if}
		{#if request}
			{#if history && !history.appended}
				<p class="note" role="note" data-not-appended>
					This request's history was not the request before plus its reply: something earlier in
					the story was sent differently this time.
				</p>
			{/if}
			{#key exchange.id}
				<ExchangeEntries {entries} open={shownOpen} />
			{/key}
		{:else}
			<p class="note">The request is not one this page can read; it is below as it was sent.</p>
		{/if}
		{#if content.response.truncated}
			<p class="note">The response ran on past what could be kept, and only its start was.</p>
		{/if}
		<wa-details summary="Request, exactly as sent" appearance="plain">
			<pre>{content.request}</pre>
		</wa-details>
		<wa-details summary="Response, exactly as it arrived" appearance="plain">
			<pre>{content.response.body}</pre>
		</wa-details>
	{/if}
</li>

<style>
	.exchange {
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
