<script lang="ts">
	import type { StarterSide } from '$lib/daydream/starters';
	import './choice-controls.css';

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
	<div class="choice-segments">
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
				<span>{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	/* A segmented control (choice-controls.css), as the kink list's "Answer
	   as" is: the same kind of choice, which was drawn as separate pills
	   here. */
	.sides {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		border: 0;

		legend {
			float: inline-start;
			padding: 0;
			margin-inline-end: 0.25rem;
		}
	}

	.hint {
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}
</style>
