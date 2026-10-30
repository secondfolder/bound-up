<script lang="ts">
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import type { ReplyUsage } from '$lib/dream/events';
	import type { Exchange } from '$lib/dream-browser/session.svelte';

	/**
	 * A request to the model, for debug mode (docs/dreams.md, "Debug mode"):
	 * where it went, what it cost and how much of it the provider's cache
	 * served, and, when this page has it, every message sent and the reply
	 * with the model's thinking. The transcript is kept for the page only, and
	 * only an account that can turn debug mode on is ever sent it.
	 */
	let {
		label,
		about,
		exchange,
		onclose
	}: {
		label: string;
		about: {
			provider?: string;
			model?: string;
			usage?: (ReplyUsage & { latencyMs?: number }) | undefined;
			ended?: string;
			request?: string;
		};
		exchange: Exchange | undefined;
		onclose: () => void;
	} = $props();

	const usage = $derived(about.usage ?? exchange?.usage);
	const took = $derived(about.usage?.latencyMs ?? exchange?.latencyMs);
	const cached = $derived(
		usage && usage.promptTokens > 0
			? Math.round((usage.cachedTokens / usage.promptTokens) * 100)
			: null
	);

	/** The most the reply could have been: a reply that stopped short may have hit it. */
	const maxTokens = $derived.by(() => {
		const request = exchange?.request as { maxTokens?: unknown } | undefined;
		return typeof request?.maxTokens === 'number' ? request.maxTokens : null;
	});

	type Message = { role?: string; content?: unknown };

	const messages = $derived.by((): Message[] => {
		const request = exchange?.request as { messages?: Message[] } | undefined;
		return Array.isArray(request?.messages) ? request.messages : [];
	});

	/** The request's settings, without its messages, which are shown one by one. */
	const settings = $derived.by(() => {
		const { messages: _messages, ...rest } = (exchange?.request ?? {}) as Record<string, unknown>;
		return JSON.stringify(rest, null, 2);
	});

	function text(content: unknown): string {
		return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
	}
</script>

<ResponsiveDialog {label} {onclose}>
	<div class="exchange">
		<dl>
			{#if about.request}<div><dt>Asked for</dt><dd>{about.request}</dd></div>{/if}
			<div><dt>Provider</dt><dd>{about.provider || exchange?.provider || 'unknown'}</dd></div>
			{#if about.model}<div><dt>Model</dt><dd>{about.model}</dd></div>{/if}
			{#if about.ended}<div><dt>Ended</dt><dd>{about.ended}</dd></div>{/if}
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
		{#if exchange}
			<h3>Sent</h3>
			<details>
				<summary>Settings</summary>
				<pre>{settings}</pre>
			</details>
			{#each messages as message, index (index)}
				<details open={index === messages.length - 1}>
					<summary>{message.role ?? 'message'}</summary>
					<pre>{text(message.content)}</pre>
				</details>
			{/each}
			{#if exchange.thinking}
				<h3>Thinking</h3>
				<pre>{exchange.thinking}</pre>
			{/if}
			<h3>Reply</h3>
			<pre>{exchange.reply}</pre>
		{:else}
			<p class="quiet">
				The full transcript is kept only on the page that sent the request, while it is open.
			</p>
		{/if}
	</div>
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

	.quiet {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}
</style>
