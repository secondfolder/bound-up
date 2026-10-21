<script lang="ts" generics="Key extends string">
	import type { Difference } from '$lib/daydream/copy-differences';

	/**
	 * Under a character or idea card on the setup page: each field where this
	 * daydream's copy has gone its own way from the library's — the story
	 * raised the idea's heat, "Update the idea" rewrote its premise, a
	 * character grew eager — with a way to take either side
	 * (docs/daydreams.md, "Characters and ideas, and the library"). "Use your
	 * library's" changes this daydream's copy, saved with the form; "Copy to
	 * your library" changes the library's at once.
	 */
	let {
		differences,
		kindName,
		onuselibrary,
		oncopytolibrary
	}: {
		differences: readonly Difference<Key>[];
		/** "idea" or "character", for the summary. */
		kindName: string;
		onuselibrary: (key: Key) => void;
		/** Answers why it could not be saved, or null. */
		oncopytolibrary: (key: Key) => Promise<string | null>;
	} = $props();

	let busy: Key | null = $state(null);
	let problem: string | null = $state(null);

	async function copy(key: Key) {
		busy = key;
		problem = await oncopytolibrary(key);
		busy = null;
	}
</script>

{#if differences.length > 0}
	<wa-details
		class="differences"
		summary={`This ${kindName} differs from your library in ${differences.length} ${differences.length === 1 ? 'place' : 'places'}`}
	>
		<ul>
			{#each differences as difference (difference.key)}
				<li>
					<p class="label">{difference.label}</p>
					<p><span class="side">Here:</span> {difference.here}</p>
					<p><span class="side">In your library:</span> {difference.library}</p>
					<div class="actions">
						<wa-button
							size="s"
							appearance="outlined"
							disabled={busy !== null}
							onclick={() => void copy(difference.key)}
						>
							Copy to your library
						</wa-button>
						<wa-button
							size="s"
							appearance="plain"
							disabled={busy !== null}
							onclick={() => onuselibrary(difference.key)}
						>
							Use your library’s
						</wa-button>
					</div>
				</li>
			{/each}
		</ul>
		{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
	</wa-details>
{/if}

<style>
	.differences {
		font-size: 0.875rem;

		ul {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		p {
			margin: 0;
			overflow-wrap: anywhere;
		}

		.label {
			font-weight: 600;
		}

		.side {
			color: var(--wa-color-text-quiet);
		}

		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: 0.375rem;
			margin-block-start: 0.25rem;
		}

		.problem {
			color: var(--wa-color-text-danger);
		}
	}
</style>
