<script lang="ts">
	import { tick } from 'svelte';
	import type { LogEntry } from '$lib/daydream/exchange-log';
	import { startOpen } from './details';

	/**
	 * An exchange with the model as bubbles (`exchange-log.ts`), for debug
	 * mode: the suggestions' chat log and a daydream's raw log both draw them
	 * here. Each is a disclosure, closed unless `open` says, because a system
	 * prompt or a fetched page is longer than the screen.
	 */
	let {
		entries,
		open = () => false,
		follow = false
	}: {
		entries: readonly LogEntry[];
		/** Which to show open: in the raw log, what the request added. */
		open?: (entry: LogEntry, index: number) => boolean;
		/** The entries are still arriving (a live chat): each keeps its end in view as it grows. */
		follow?: boolean;
	} = $props();

	/**
	 * Keeps a growing entry scrolled to its end, unless the reader has scrolled
	 * up in it to read something, which it would otherwise snatch away.
	 */
	function followEnd(entry: LogEntry) {
		return (node: HTMLElement) => {
			// Read so the attachment re-runs as the text grows. Whether the end
			// was in view is measured now, and the scroll waits for the new
			// text to be drawn.
			const grown = entry.text.length;
			const atEnd = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
			if (atEnd && grown > 0) {
				void tick().then(() => {
					node.scrollTop = node.scrollHeight;
				});
			}
		};
	}
</script>

<ol>
	{#each entries as entry, index (index)}
		<li class={entry.who}>
			<wa-details summary={entry.label} appearance="plain" {@attach startOpen(open(entry, index))}>
				<pre {@attach follow ? followEnd(entry) : undefined}>{entry.text}</pre>
			</wa-details>
		</li>
	{/each}
</ol>

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
		&.settings,
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
