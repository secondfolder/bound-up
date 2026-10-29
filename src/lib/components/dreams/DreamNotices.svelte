<script lang="ts">
	import type { DreamSession } from '$lib/dream-browser/session.svelte';

	/**
	 * What the daydream just remembered or wants to change, with what the user
	 * can do about it (docs/dreams.md, "Preferences"): nothing is remembered
	 * silently, and nothing about how it is told changes without a yes. Shown
	 * in place rather than as a floating toast, so its buttons stay put and a
	 * screen reader hears it as it arrives.
	 */
	let { session }: { session: DreamSession } = $props();
</script>

<div class="notices" role="status">
	{#each session.notices as notice (notice.id)}
		<div class="notice">
			{#if notice.kind === 'saved'}
				<p>
					Remembered for {notice.scope === 'story' ? 'this daydream' : 'every daydream'}:
					<strong>{notice.preference.text}</strong>
				</p>
				<div class="actions">
					{#if notice.scope === 'story'}
						<wa-button size="s" appearance="outlined" onclick={() => session.makeGeneral(notice.preference.id)}
							>Make it general</wa-button
						>
					{/if}
					<wa-button size="s" appearance="plain" onclick={() => session.forget(notice.preference.id)}>Undo</wa-button>
					<wa-button size="s" appearance="plain" onclick={() => session.dismiss(notice.id)}>OK</wa-button>
				</div>
			{:else}
				<p>The story has changed shape. New notes for telling it:</p>
				<blockquote>{notice.text}</blockquote>
				<div class="actions">
					<wa-button size="s" appearance="outlined" onclick={() => session.acceptTelling(notice.id)}
						>Use these</wa-button
					>
					<wa-button size="s" appearance="plain" onclick={() => session.dismiss(notice.id)}>Keep as it is</wa-button>
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.notices {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);

		&:empty {
			display: none;
		}
	}

	.notice {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
		padding: var(--wa-space-s) var(--wa-space-m);
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-surface-raised);

		p,
		blockquote {
			margin: 0;
		}

		blockquote {
			padding-left: var(--wa-space-s);
			border-left: 3px solid var(--wa-color-brand-on-quiet);
			white-space: pre-line;
			color: var(--wa-color-text-quiet);
		}
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
	}
</style>
