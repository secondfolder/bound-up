<script lang="ts">
	/**
	 * Things the user might say next, offered under the newest passage. A tap
	 * sends one as it is; the pencil beside it puts it in the composer to be
	 * changed first.
	 */
	let {
		suggestions,
		disabled,
		onsend,
		onedit
	}: {
		suggestions: readonly string[];
		disabled: boolean;
		onsend: (text: string) => void;
		onedit: (text: string) => void;
	} = $props();
</script>

{#if suggestions.length > 0}
	<ul class="suggestions" aria-label="Suggested responses">
		{#each suggestions as suggestion, index (index)}
			<li>
				<wa-button
					class="say"
					size="s"
					appearance="outlined"
					{disabled}
					onclick={() => onsend(suggestion)}
				>
					{suggestion}
				</wa-button>
				<wa-button size="s" appearance="plain" pill {disabled} onclick={() => onedit(suggestion)}>
					<wa-icon name="pen" variant="solid" label={`Change “${suggestion}” first`}></wa-icon>
				</wa-button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.suggestions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.375rem;

		li {
			display: flex;
			align-items: center;
			gap: 0.25rem;
			max-inline-size: 90%;
		}

		.say::part(base) {
			height: auto;
			min-height: var(--wa-form-control-height);
			white-space: normal;
			text-align: start;
			padding-block: 0.375rem;
		}
	}
</style>
