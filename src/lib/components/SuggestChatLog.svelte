<script lang="ts">
	import type { SuggestChatLog } from '$lib/daydream/suggest-chat-log';

	/**
	 * How a draft was written, for debug mode (docs/debug-mode.md): the whole
	 * exchange with the model, from the system prompt to how it ended, as
	 * `suggestChatLog` read it. Each bubble is a disclosure, closed, because
	 * the system prompt and a fetched page are each longer than the screen.
	 * Nothing here is kept; it is the answer's own.
	 */
	let { log }: { log: SuggestChatLog } = $props();
</script>

<wa-details summary="Chat log: {log.model}, {log.api}" class="log">
	<ol>
		{#each log.entries as entry, index (index)}
			<li class={entry.who}>
				<wa-details summary={entry.label} appearance="plain">
					<pre>{entry.text}</pre>
				</wa-details>
			</li>
		{/each}
	</ol>
</wa-details>

<style>
	ol {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		font-size: var(--wa-font-size-s);

		/* The model's side on the left, the request's on the right, as a chat reads. */
		&.user {
			margin-inline-start: 2rem;
			background: var(--wa-color-surface-raised);
		}

		&.model {
			margin-inline-end: 2rem;
		}

		&.system,
		&.end {
			border-style: dashed;
		}

		wa-details::part(header) {
			overflow-wrap: anywhere;
			color: var(--wa-color-text-quiet);
		}
	}

	pre {
		margin: 0;
		max-block-size: 24rem;
		overflow: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-family: var(--wa-font-family-code, monospace);
		font-size: 0.8125rem;
	}
</style>
