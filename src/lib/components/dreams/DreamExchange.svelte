<script lang="ts">
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import Tab from '$lib/components/tabs/Tab.svelte';
	import TabGroup from '$lib/components/tabs/TabGroup.svelte';
	import TabPanel from '$lib/components/tabs/TabPanel.svelte';
	import type { ReplyUsage } from '$lib/dream/events';
	import type { Exchange, PassageExtra } from '$lib/dream-browser/session.svelte';

	/**
	 * A request to the model, for debug mode (docs/dreams.md, "Debug mode"):
	 * where it went, what it cost and how much of it the provider's cache
	 * served, and, when this page has it, every message sent and the reply
	 * with the model's thinking. The transcript is kept for the page only, and
	 * only an account that can turn debug mode on is ever sent it.
	 *
	 * A passage's other requests, when it has any, are in tabs beside its
	 * own, a tab for each kind: the clips read aloud from it, and the detail
	 * loaded from links in it. Each request is a section of its own: one
	 * passage read aloud is a dozen clips, too many for a tab each.
	 */
	let {
		label,
		about,
		exchange,
		extras = [],
		onclose
	}: {
		label: string;
		about: About;
		exchange: Exchange | undefined;
		extras?: readonly PassageExtra[];
		onclose: () => void;
	} = $props();

	type About = {
		provider?: string;
		model?: string;
		usage?: (ReplyUsage & { latencyMs?: number }) | undefined;
		ended?: string;
		request?: string;
	};

	const speech = $derived(extras.filter((extra) => extra.kind === 'speech'));
	const more = $derived(extras.filter((extra) => extra.kind === 'more'));

	type Message = { role?: string; content?: unknown };

	function messagesOf(entry: Exchange | undefined): Message[] {
		const request = entry?.request as { messages?: Message[] } | undefined;
		return Array.isArray(request?.messages) ? request.messages : [];
	}

	/** The request's settings, without its messages, which are shown one by one. */
	function settingsOf(entry: Exchange | undefined): string {
		const { messages: _messages, ...rest } = (entry?.request ?? {}) as Record<string, unknown>;
		return JSON.stringify(rest, null, 2);
	}

	/** The most the reply could have been: a reply that stopped short may have hit it. */
	function maxTokensOf(entry: Exchange | undefined): number | null {
		const request = entry?.request as { maxTokens?: unknown } | undefined;
		return typeof request?.maxTokens === 'number' ? request.maxTokens : null;
	}

	function cachedOf(usage: ReplyUsage | undefined): number | null {
		return usage && usage.promptTokens > 0
			? Math.round((usage.cachedTokens / usage.promptTokens) * 100)
			: null;
	}

	function text(content: unknown): string {
		return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
	}
</script>

{#snippet view(info: About, entry: Exchange | undefined)}
	{const usage = $derived(info.usage ?? entry?.usage)}
	{const took = $derived(info.usage?.latencyMs ?? entry?.latencyMs)}
	{const cached = $derived(cachedOf(usage))}
	{const maxTokens = $derived(maxTokensOf(entry))}
	{const messages = $derived(messagesOf(entry))}
	<div class="exchange">
		<dl>
			{#if info.request}<div><dt>Asked for</dt><dd>{info.request}</dd></div>{/if}
			<div><dt>Provider</dt><dd>{info.provider || entry?.provider || 'unknown'}</dd></div>
			{#if info.model}<div><dt>Model</dt><dd>{info.model}</dd></div>{/if}
			{#if info.ended}<div><dt>Ended</dt><dd>{info.ended}</dd></div>{/if}
			{#if usage || maxTokens !== null}
				<!-- The max is the reply's alone: a provider counts the prompt apart,
				     and a reasoning model's thinking in the reply. -->
				<div>
					<dt>Tokens</dt>
					<dd>
						<dl class="tokens">
							{#if usage}
								<div>
									<dt>Prompt</dt>
									<dd>{usage.promptTokens}, {usage.cachedTokens} from cache{cached === null ? '' : ` (${cached}%)`}</dd>
								</div>
							{/if}
							<div>
								<dt>Reply</dt>
								<dd>
									{usage ? `${usage.completionTokens}, thinking included` : 'not known'}{maxTokens === null
										? ''
										: ` (max ${maxTokens})`}
								</dd>
							</div>
							{#if usage}
								<div><dt>Total</dt><dd>{usage.promptTokens + usage.completionTokens}</dd></div>
							{/if}
						</dl>
					</dd>
				</div>
			{/if}
			{#if usage && usage.cost !== null}<div><dt>Cost</dt><dd>${usage.cost.toFixed(5)}</dd></div>{/if}
			{#if took}
				<div><dt>Took</dt><dd>{(took / 1000).toFixed(1)} s</dd></div>
			{/if}
		</dl>
		{#if entry}
			<h3>Sent</h3>
			<!-- Without messages (a clip read aloud), the settings are the whole request. -->
			<details open={messages.length === 0}>
				<summary>{messages.length > 0 ? 'Settings' : 'Request'}</summary>
				<pre>{settingsOf(entry)}</pre>
			</details>
			{#each messages as message, index (index)}
				<details open={index === messages.length - 1}>
					<summary>{message.role ?? 'message'}</summary>
					<pre>{text(message.content)}</pre>
				</details>
			{/each}
			{#if entry.thinking}
				<h3>Thinking</h3>
				<pre>{entry.thinking}</pre>
			{/if}
			<h3>Reply</h3>
			<pre>{entry.reply}</pre>
		{:else}
			<p class="quiet">
				The full transcript is kept only on the page that sent the request, while it is open.
			</p>
		{/if}
	</div>
{/snippet}

{#snippet list(entries: readonly PassageExtra[])}
	<div class="extras">
		{#each entries as extra, index (index)}
			<details open={entries.length === 1}>
				<summary>{extra.label}</summary>
				{@render view(extra.model ? { model: extra.model } : {}, extra.exchange)}
			</details>
		{/each}
	</div>
{/snippet}

<ResponsiveDialog {label} {onclose}>
	{#if speech.length + more.length === 0}
		{@render view(about, exchange)}
	{:else}
		<TabGroup label="This passage's requests">
			{#snippet nav()}
				<Tab panel="passage">Passage</Tab>
				{#if speech.length > 0}<Tab panel="speech" count={speech.length}>Speech</Tab>{/if}
				{#if more.length > 0}<Tab panel="more" count={more.length}>More detail</Tab>{/if}
			{/snippet}
			<TabPanel name="passage">{@render view(about, exchange)}</TabPanel>
			{#if speech.length > 0}<TabPanel name="speech">{@render list(speech)}</TabPanel>{/if}
			{#if more.length > 0}<TabPanel name="more">{@render list(more)}</TabPanel>{/if}
		</TabGroup>
	{/if}
</ResponsiveDialog>

<style>
	.exchange {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
		min-width: 0;

		h3 {
			margin: 0;
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		dl {
			display: grid;
			gap: var(--wa-space-3xs);
			margin: 0;

			div {
				display: flex;
				flex-wrap: wrap;
				gap: var(--wa-space-xs);
			}

			dt {
				min-width: 6rem;
				color: var(--wa-color-text-quiet);
			}

			/* Tokens' own parts, under it. */
			.tokens {
				gap: 0;
			}

			dd {
				margin: 0;
				overflow-wrap: anywhere;
			}
		}

		summary {
			cursor: pointer;
			font-family: var(--wa-font-family-code);
			font-size: var(--wa-font-size-s);
		}

		pre {
			max-height: 24rem;
			margin: var(--wa-space-2xs) 0 0;
			padding: var(--wa-space-xs);
			overflow: auto;
			border-radius: var(--wa-border-radius-s);
			background: var(--wa-color-surface-lowered);
			font-size: var(--wa-font-size-xs);
			white-space: pre-wrap;
			overflow-wrap: anywhere;
		}
	}

	.extras {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
		margin-top: var(--wa-space-s);

		> details > summary {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			cursor: pointer;
		}

		> details > .exchange {
			margin-top: var(--wa-space-xs);
			padding-left: var(--wa-space-s);
			border-left: 1px solid var(--wa-color-surface-border);
		}
	}

	.quiet {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}
</style>
