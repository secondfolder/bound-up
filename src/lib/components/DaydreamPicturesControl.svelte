<script lang="ts">
	import type { DaydreamPictures } from '$lib/daydream';
	import { PICTURE_STYLES } from '$lib/daydream/image-prompt';

	/**
	 * A daydream's pictures (docs/daydreams.md, "Pictures"): whether each
	 * passage gets one by itself, and in which style. In the setup form's
	 * "More options" and the story's Dials popover. Neither reaches the story
	 * model, so changing either mid-story costs nothing.
	 *
	 * Controlled: `value` is the setting, and a change is asked for through
	 * `onchange`. `name` keeps two of these on one page from sharing a radio
	 * group.
	 */
	let {
		value,
		onchange,
		name
	}: { value: DaydreamPictures; onchange: (pictures: DaydreamPictures) => void; name: string } =
		$props();
</script>

<div class="pictures">
	<wa-switch
		size="s"
		checked={value.on}
		onchange={(event: Event) =>
			onchange({ ...value, on: (event.currentTarget as HTMLInputElement).checked })}
		>A picture with each passage</wa-switch
	>
	<fieldset class="styles">
		<legend>Style</legend>
		{#each PICTURE_STYLES as choice (choice.value)}
			<label class="choice">
				<input
					type="radio"
					{name}
					value={choice.value}
					checked={value.style === choice.value}
					onchange={() => onchange({ ...value, style: choice.value })}
				/>
				<span>{choice.label}</span>
			</label>
		{/each}
	</fieldset>
</div>

<style>
	.pictures {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.styles {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		border: 0;

		legend {
			float: inline-start;
			margin-inline-end: 0.25rem;
			color: var(--wa-color-text-quiet);
			font-size: var(--wa-font-size-s);
		}
	}

	.choice {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
</style>
