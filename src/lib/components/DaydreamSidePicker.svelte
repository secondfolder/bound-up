<script lang="ts">
	import type { StarterSide } from '$lib/daydream/starters';

	/**
	 * "You as: Either / Dom / Sub", the side the user is on in the stories
	 * offered, on the new-daydream page: above the box's buttons, or beside
	 * "Story suggestions" when there is no box. Each instance names its own radio
	 * group, so a second one on a page could never uncheck the first.
	 */
	let { side = $bindable() }: { side: StarterSide | null } = $props();

	const id = $props.id();
	const name = `starter-side-${id}`;

	const SIDES: readonly { value: StarterSide | null; label: string }[] = [
		{ value: null, label: 'Either' },
		{ value: 'dom', label: 'Dom' },
		{ value: 'sub', label: 'Sub' }
	];
</script>

<fieldset class="sides">
	<legend class="hint">You as</legend>
	{#each SIDES as option (option.label)}
		<label class="side">
			<input
				type="radio"
				{name}
				checked={side === option.value}
				onchange={() => {
					side = option.value;
				}}
			/>
			{option.label}
		</label>
	{/each}
</fieldset>

<style>
	/* A segmented control: native radios, since it is one choice of three,
	   visually hidden inside labels that look like the idea chips. */
	.sides {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		border: 0;

		legend {
			float: inline-start;
			padding: 0;
			margin-inline-end: 0.25rem;
		}
	}

	.side {
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 999px;
		font-size: 0.875rem;
		cursor: pointer;

		&:has(input:checked) {
			border-color: var(--wa-color-brand-border-loud, var(--wa-color-surface-border));
			background: var(--wa-color-brand-fill-quiet);
		}

		&:has(input:focus-visible) {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}

		input {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			margin: 0;
			opacity: 0;
			pointer-events: none;
		}
	}

	.hint {
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}
</style>
