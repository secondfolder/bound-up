<script lang="ts">
	import type { ReceivedLog } from '$lib/daydream/received-record';

	/**
	 * How a reply ended, in debug mode's raw log (docs/debug-mode.md): which
	 * model and provider answered, why it stopped, its generation's id, its
	 * usage, and for a failed reply the error it ended on. The same as the
	 * suggestions' chat log ends with (`SuggestChatLog`). Says so when none of
	 * it was recorded: a passage from before turn v7, or without the grant.
	 */
	let { received }: { received: ReceivedLog | null } = $props();

	const line = $derived(
		received
			? [
					received.finishReason ? `Stopped: ${received.finishReason}` : null,
					received.model ?? null,
					received.provider ? `via ${received.provider}` : null,
					received.generationId ?? null
				].filter((part) => part !== null)
			: []
	);
</script>

{#if received && (line.length > 0 || received.usage || received.error)}
	<wa-details summary="How it ended{line.length > 0 ? `: ${line.join(' · ')}` : ''}" appearance="plain">
		{#if received.error}
			<span class="role">Error</span>
			<pre>{received.error}</pre>
		{/if}
		{#if received.usage}
			<span class="role">Usage</span>
			<pre>{received.usage}</pre>
		{:else}
			<p class="note">No usage was reported.</p>
		{/if}
	</wa-details>
{:else}
	<p class="note">How it ended was not recorded.</p>
{/if}

<style>
	.role,
	.note {
		color: var(--wa-color-text-quiet);
	}

	.note {
		margin: 0;
	}

	pre {
		margin: 0;
		font-family: var(--wa-font-family-code, monospace);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	wa-details::part(header) {
		overflow-wrap: anywhere;
		color: var(--wa-color-text-quiet);
	}
</style>
