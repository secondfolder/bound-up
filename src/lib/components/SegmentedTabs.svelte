<script lang="ts" generics="Id extends string">
	import type { Snippet } from 'svelte';

	/**
	 * Tabs drawn as a pill-shaped segmented control, each with an optional
	 * count badge: for a page split two or three ways that should read as one
	 * thing seen from different sides ("For you" / "For Jun"), where
	 * `wa-tab-group`'s underlined tabs read as separate documents.
	 *
	 * Native buttons with the ARIA tab pattern, not `wa-button`s: a
	 * `wa-button` forwards no ARIA state to its inner button, so
	 * `aria-selected` would stay on the host (AGENTS.md). Arrow keys, Home and
	 * End move between tabs; only the selected tab is in the tab order. Every
	 * panel stays rendered and the others are `hidden`, so a panel keeps its
	 * state (an open detail, a completion in flight) when the tab changes.
	 */
	let {
		label,
		tabs,
		value = $bindable(),
		panel
	}: {
		/** What the tabs choose between, for a screen reader: "Whose tasks". */
		label: string;
		tabs: { id: Id; label: string; count?: number | null }[];
		/** The selected tab; the first when not given. */
		value?: Id;
		/** One panel's content, by tab id. */
		panel: Snippet<[Id]>;
	} = $props();

	const uid = $props.id();
	const selected = $derived(value ?? tabs[0]?.id);
	const buttons: Record<string, HTMLButtonElement> = {};

	function select(id: Id, focus = false) {
		value = id;
		if (focus) {
			buttons[id]?.focus();
		}
	}

	function onkeydown(event: KeyboardEvent, index: number) {
		const last = tabs.length - 1;
		const to = {
			ArrowRight: index === last ? 0 : index + 1,
			ArrowLeft: index === 0 ? last : index - 1,
			Home: 0,
			End: last
		}[event.key];
		const tab = to === undefined ? undefined : tabs[to];
		if (tab) {
			event.preventDefault();
			select(tab.id, true);
		}
	}
</script>

<div class="segmented" role="tablist" aria-label={label}>
	{#each tabs as tab, index (tab.id)}
		<button
			bind:this={buttons[tab.id]}
			type="button"
			role="tab"
			id={`${uid}-tab-${tab.id}`}
			aria-controls={`${uid}-panel-${tab.id}`}
			aria-selected={tab.id === selected}
			tabindex={tab.id === selected ? 0 : -1}
			onclick={() => select(tab.id)}
			onkeydown={(event) => onkeydown(event, index)}
		>
			{tab.label}
			{#if tab.count !== undefined && tab.count !== null}
				<span class="count">{tab.count}</span>
			{/if}
		</button>
	{/each}
</div>

{#each tabs as tab (tab.id)}
	<div
		role="tabpanel"
		id={`${uid}-panel-${tab.id}`}
		aria-labelledby={`${uid}-tab-${tab.id}`}
		hidden={tab.id !== selected}
		class="panel"
	>
		{@render panel(tab.id)}
	</div>
{/each}

<style>
	.segmented {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: var(--wa-border-radius-pill);
		background: var(--wa-color-surface-lowered);
	}

	button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-inline-size: 0;
		/* Its own height, not Web Awesome's native-button one. */
		block-size: auto;
		min-block-size: 2.25rem;
		margin: 0;
		transform: none;
		padding: 0.25rem 0.75rem;
		border: none;
		border-radius: var(--wa-border-radius-pill);
		background: none;
		font: inherit;
		font-size: 0.9375rem;
		font-weight: var(--wa-font-weight-semibold, 600);
		color: var(--wa-color-text-quiet);
		cursor: pointer;
		transition:
			background-color 150ms,
			color 150ms;

		&[aria-selected='true'] {
			background: var(--wa-color-surface-raised);
			color: var(--wa-color-text-normal);
		}

		@media (hover: hover) {
			&:hover:not([aria-selected='true']) {
				color: var(--wa-color-text-normal);
			}
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
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

		[aria-selected='true'] & {
			background: var(--wa-color-brand-fill-loud);
			color: var(--wa-color-brand-on-loud);
		}
	}

	.panel {
		padding-block-start: var(--wa-space-m);
	}
</style>
