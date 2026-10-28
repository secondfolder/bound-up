<script lang="ts">
	import { onDestroy, type Snippet, untrack } from 'svelte';
	import { segmentedGroup } from './context';

	/**
	 * One option in a `RadioButtonGroup`, drawn as what the group's `kind`
	 * says it is:
	 *
	 * - `radio`: a native radio, visually hidden inside its label. Native, so
	 *   arrow keys, focus and form submission work before hydration, as
	 *   `PartnerFields` and `ThreadIconPicker` rely on.
	 * - `tab`: a native button with the ARIA tab pattern. Not a `wa-button`,
	 *   which forwards no `aria-selected` to its inner button (AGENTS.md).
	 * - `link`: a link, `aria-current="page"` when it is the page you are on.
	 */
	let {
		value,
		disabled = false,
		count,
		id,
		controls,
		href,
		children
	}: {
		value: string;
		disabled?: boolean;
		/** A number in a badge beside the label, filled in brand colour on the chosen option. */
		count?: number | null;
		/** Tab kind: the tab's id, which its panel is labelled by. */
		id?: string;
		/** Tab kind: the id of the panel it shows. */
		controls?: string;
		/** Link kind: where it goes. */
		href?: string;
		children: Snippet;
	} = $props();

	const group = segmentedGroup();
	// The first option an unset group falls back to; registered as it renders, in order.
	onDestroy(group.register(untrack(() => value)));
	const selected = $derived(group.selected === value);
</script>

{#snippet content()}
	<span class="text">{@render children()}</span>
	{#if count !== undefined && count !== null}<span class="count">{count}</span>{/if}
{/snippet}

{#if group.kind === 'tab'}
	<button
		type="button"
		role="tab"
		class="option"
		{id}
		aria-controls={controls}
		aria-selected={selected}
		tabindex={selected ? 0 : -1}
		{disabled}
		data-value={value}
		data-selected={selected || undefined}
		onclick={() => group.select(value)}
		onkeydown={(event) => group.keydown(event, value)}
	>
		{@render content()}
	</button>
{:else if group.kind === 'link'}
	<a
		class="option"
		{href}
		aria-current={selected ? 'page' : undefined}
		data-value={value}
		data-selected={selected || undefined}
	>
		{@render content()}
	</a>
{:else}
	<!-- biome-ignore lint/a11y/noLabelWithoutControl: the input is inside it and its text comes through the `content` snippet, neither of which Biome sees through. -->
	<label class={['option', { disabled }]} data-value={value} data-selected={selected || undefined}>
		<input
			class="wa-visually-hidden"
			type="radio"
			name={group.name}
			{value}
			checked={selected}
			{disabled}
			onchange={() => group.select(value)}
		/>
		{@render content()}
	</label>
{/if}

<style>
	/* Sized by the custom properties the group sets for its `size`. */
	.option {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-inline-size: 0;
		/* Its own height, not Web Awesome's native-button one. */
		block-size: auto;
		min-block-size: var(--segment-height);
		box-sizing: border-box;
		margin: 0;
		transform: none;
		padding: var(--segment-padding);
		border: none;
		border-radius: var(--wa-border-radius-pill);
		background: none;
		font: inherit;
		font-size: var(--segment-font-size);
		font-weight: var(--wa-font-weight-semibold, 600);
		line-height: 1.2;
		white-space: nowrap;
		color: var(--wa-color-text-quiet);
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color 150ms,
			color 150ms;

		&[data-selected] {
			color: var(--wa-color-text-normal);
		}

		@media (hover: hover) {
			&:hover:not([data-selected], :disabled, .disabled) {
				color: var(--wa-color-text-normal);
			}
		}

		&:focus-visible,
		&:has(input:focus-visible) {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}

		&:disabled,
		&.disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
	}

	/* Until the group has placed its sliding fill, the chosen option fills itself. */
	:global(.segmented-pill:not([data-measured])) > .option[data-selected] {
		background: var(--wa-color-surface-raised);
	}

	.text {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.count {
		display: inline-grid;
		place-items: center;
		min-inline-size: 1.25rem;
		padding: 0 0.375rem;
		border-radius: var(--wa-border-radius-pill);
		background: var(--wa-color-surface-raised);
		font-size: 0.75rem;
		line-height: 1.25rem;
		font-variant-numeric: tabular-nums;

		[data-selected] > & {
			background: var(--wa-color-brand-fill-loud);
			color: var(--wa-color-brand-on-loud);
		}
	}
</style>
