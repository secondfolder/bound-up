<script lang="ts">
	import type { DialValue } from '$lib/daydream';

	/**
	 * One 1–5 dial that may be left unset: a character's control or libido, a
	 * scene's heat or kink. Unset says nothing to the model, rather than
	 * "middling", so it reads as off until it is moved, and Clear takes it back
	 * there. The words for each step come from `daydream/dial-words.ts`, which
	 * the prompt reads too.
	 *
	 * Controlled: `value` is the level, and a change is asked for through
	 * `onchange`. The slider is wired by hand rather than with `onchange=`: its
	 * events come from inside a shadow root, which Svelte's delegated handlers
	 * do not reliably see (AGENTS.md).
	 */
	let {
		label,
		low,
		high,
		scale,
		value,
		onchange
	}: {
		label: string;
		low: string;
		high: string;
		scale: Readonly<Record<DialValue, { label: string }>>;
		value: DialValue | null;
		onchange: (level: DialValue | null) => void;
	} = $props();

	type WaSlider = HTMLElement & { value: number; valueFormatter?: (value: number) => string };

	function wire(node: WaSlider) {
		// What a screen reader announces instead of a bare number.
		node.valueFormatter = (level) => scale[level as DialValue]?.label ?? String(level);
		const update = () => onchange(Math.round(node.value) as DialValue);
		node.addEventListener('change', update);
		return () => node.removeEventListener('change', update);
	}
</script>

<div class="dial" class:unset={value === null}>
	<wa-slider {@attach wire} {label} min={1} max={5} step={1} value={value ?? 3}>
		<span slot="reference">{low}</span>
		<span slot="reference">{high}</span>
	</wa-slider>
	<div class="state">
		<span>{value === null ? 'Not set' : scale[value].label}</span>
		{#if value !== null}
			<wa-button size="s" appearance="plain" onclick={() => onchange(null)}>
				Clear {label.toLowerCase()}
			</wa-button>
		{/if}
	</div>
</div>

<style>
	.dial {
		.state {
			display: flex;
			align-items: center;
			justify-content: space-between;
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}

		/* An unset dial says nothing, so it reads as off. */
		&.unset wa-slider {
			opacity: 0.55;
		}
	}
</style>
