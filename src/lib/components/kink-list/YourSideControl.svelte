<script lang="ts">
	import { YOUR_SIDE_LABELS, YOUR_SIDES } from '$lib/kink-list/answers';
	import { kinkListContext } from '$lib/kink-list/context';

	/**
	 * "Your side: Dom · Sub · Both". Dom or Sub hides the contexts and kinks
	 * that lean the other way; Both hides nothing. On your own list it is a
	 * setting that starts on Both; in a partner's view it starts from who is
	 * in control, and changing it lasts for the visit (docs/kink-list.md,
	 * "Your side").
	 *
	 * Native radios, as segments: the state is `checked`, which a `wa-button`
	 * would not expose (AGENTS.md).
	 */
	const { store } = kinkListContext();
	const name = $props.id();
</script>

<fieldset class="your-side">
	<legend>Your side</legend>
	<div class="segments">
		{#each YOUR_SIDES as side (side)}
			<label>
				<input
					type="radio"
					{name}
					value={side}
					checked={store.filters.side === side}
					onchange={() => store.setFilters({ side })}
				/>
				<span>{YOUR_SIDE_LABELS[side]}</span>
			</label>
		{/each}
	</div>
	{#if store.sideFromControl}
		<span class="hint">Set from who's in control</span>
	{/if}
</fieldset>

<style>
	.your-side {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
		border: 0;
		margin: 0;
		padding: 0;
		min-inline-size: 0;

		legend {
			float: left;
			padding: 0;
			font-size: 0.875rem;
			font-weight: var(--wa-font-weight-semibold);
		}
	}

	.segments {
		display: inline-flex;
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-pill);
		overflow: hidden;
	}

	label {
		position: relative;

		input {
			position: absolute;
			inset: 0;
			margin: 0;
			opacity: 0;
			cursor: pointer;
		}

		span {
			display: block;
			padding: 0.2rem 0.75rem;
			font-size: 0.875rem;
		}

		& + label span {
			border-inline-start: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		}

		input:checked + span {
			font-weight: var(--wa-font-weight-bold);
			color: var(--wa-color-brand-on-loud);
			background: var(--wa-color-brand-fill-loud);
		}

		input:focus-visible + span {
			outline: var(--wa-focus-ring);
			outline-offset: calc(-1 * var(--wa-focus-ring-width, 2px));
		}
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);
	}
</style>
