<script lang="ts" generics="Value extends string">
	import type { Snippet } from 'svelte';
	import { type SegmentedKind, setSegmentedGroup } from './context';
	import { arrive, hold, leave } from './continuity';

	/**
	 * A row of options inside one pill, one of them filled: `wa-radio-group`
	 * with `wa-radio appearance="button"`, in the look `SegmentedTabs` had.
	 * The fill is one element that slides and resizes onto whichever option
	 * is chosen. Its `RadioButton`s draw themselves as native radios, as tabs
	 * (for `TabGroup`) or as links, by `kind`. See docs/segmented-controls.md.
	 *
	 * Not a wrapper round `wa-radio-group`: `wa-radio` sets `role="radio"`,
	 * `aria-checked` and its own `tabIndex` on its host, so a group of them
	 * can never be a tab list or a nav, and `wa-button` forwards no ARIA state
	 * to its inner button (AGENTS.md).
	 */
	let {
		label,
		hideLabel = false,
		value = $bindable(),
		onchange,
		kind = 'radio',
		name,
		size = 'm',
		fill = false,
		continuity,
		children
	}: {
		/** What the options choose between: shown above the pill, or only to a screen reader with `hideLabel`. */
		label: string;
		hideLabel?: boolean;
		/** The chosen option; the first while it is unset, as Web Awesome's groups do. */
		value?: Value;
		/** A person chose an option. Not called when `value` is set from outside. */
		onchange?: (value: Value) => void;
		kind?: SegmentedKind;
		/** The radios' name in a form. Radio kind only. */
		name?: string;
		/** `s` for a toolbar. */
		size?: 's' | 'm';
		/** Stretch across the container in equal columns, rather than fit the options. */
		fill?: boolean;
		/**
		 * A key shared by the same control on different pages, so the fill
		 * slides across a navigation from the option the last page showed
		 * (`continuity.ts`).
		 */
		continuity?: string;
		children: Snippet;
	} = $props();

	const uid = $props.id();
	/** Options in render order; plain, because only the first is ever read, and only once an option has registered it. */
	const order: string[] = [];
	const selected = () => value ?? order[0];

	let pill = $state<HTMLElement>();
	let indicator = $state<HTMLElement>();
	/** Set by a person's choice, so only that slides; a value set from outside moves the fill straight there. */
	let slideNext = false;

	function optionFor(option: string): HTMLElement | null {
		return pill?.querySelector<HTMLElement>(`[data-value="${CSS.escape(option)}"]`) ?? null;
	}

	/**
	 * Moves the fill onto an option. The selected option paints its own
	 * background until this first runs (on the server, before hydration), and
	 * `data-measured` hands it over to the fill, so the pill never shows
	 * nothing chosen. Written to the DOM directly, not through state: a slide
	 * from another page's option needs its starting place committed before
	 * the move, in the same task.
	 */
	function place(option: string | undefined, slide: boolean) {
		const element = option === undefined ? null : optionFor(option);
		if (!(pill && indicator)) {
			return;
		}
		if (!element) {
			delete pill.dataset.measured;
			return;
		}
		pill.toggleAttribute('data-slide', slide);
		indicator.style.setProperty('--x', `${element.offsetLeft}px`);
		indicator.style.setProperty('--y', `${element.offsetTop}px`);
		indicator.style.setProperty('--width', `${element.offsetWidth}px`);
		indicator.style.setProperty('--height', `${element.offsetHeight}px`);
		pill.dataset.measured = '';
	}

	/** This control, as the holder of its `continuity` key. */
	const owner = {};
	let placed = false;
	$effect(() => {
		const current = selected();
		if (placed) {
			place(current, slideNext);
			slideNext = false;
			if (continuity) {
				hold(continuity, owner, current);
			}
			return;
		}
		placed = true;
		const from = continuity ? arrive(continuity, owner, current) : undefined;
		if (from !== undefined && optionFor(from) && indicator) {
			place(from, false);
			// Reading layout commits the starting place, so the move below transitions.
			void indicator.offsetWidth;
			place(current, true);
		} else {
			place(current, false);
		}
	});

	$effect(() => {
		const key = continuity;
		return () => {
			if (key) {
				leave(key, owner);
			}
		};
	});

	// Labels and counts change width, and the title font loads late: keep the
	// fill on its option without sliding it there.
	$effect(() => {
		const element = pill;
		if (!element) {
			return;
		}
		const resized = new ResizeObserver(() => place(selected(), false));
		const observeAll = () => {
			resized.disconnect();
			resized.observe(element);
			for (const child of element.children) {
				resized.observe(child);
			}
		};
		observeAll();
		const changed = new MutationObserver(observeAll);
		changed.observe(element, { childList: true });
		return () => {
			resized.disconnect();
			changed.disconnect();
		};
	});

	function select(option: string, { focus = false } = {}) {
		if (option !== selected()) {
			slideNext = true;
			value = option as Value;
			onchange?.(option as Value);
		}
		if (focus) {
			optionFor(option)?.focus();
		}
	}

	/** Arrow keys wrap, Home and End jump, and focus follows, skipping disabled tabs. */
	function keydown(event: KeyboardEvent, from: string) {
		const tabs = [...(pill?.querySelectorAll<HTMLElement>('[role="tab"]:not(:disabled)') ?? [])];
		const index = tabs.findIndex((tab) => tab.dataset.value === from);
		const last = tabs.length - 1;
		const to = {
			ArrowRight: index >= last ? 0 : index + 1,
			ArrowLeft: index <= 0 ? last : index - 1,
			Home: 0,
			End: last
		}[event.key];
		const option = to === undefined ? undefined : tabs[to]?.dataset.value;
		if (option !== undefined) {
			event.preventDefault();
			select(option, { focus: true });
		}
	}

	setSegmentedGroup({
		get kind() {
			return kind;
		},
		get name() {
			return name ?? `${uid}-radio`;
		},
		get selected() {
			return selected();
		},
		register(option) {
			order.push(option);
			return () => {
				const index = order.indexOf(option);
				if (index !== -1) {
					order.splice(index, 1);
				}
			};
		},
		select,
		keydown
	});
</script>

{#snippet options()}
	<span class="indicator" bind:this={indicator} aria-hidden="true"></span>
	{@render children()}
{/snippet}

<div class={['radio-button-group', { fill }]} data-size={size}>
	{#if !hideLabel}<span class="label" id={`${uid}-label`}>{label}</span>{/if}
	{#if kind === 'link'}
		<nav bind:this={pill} class="segmented-pill" data-size={size} aria-label={label}>
			{@render options()}
		</nav>
	{:else if kind === 'tab'}
		<div
			bind:this={pill}
			class="segmented-pill"
			data-size={size}
			role="tablist"
			aria-label={hideLabel ? label : undefined}
			aria-labelledby={hideLabel ? undefined : `${uid}-label`}
		>
			{@render options()}
		</div>
	{:else}
		<div
			bind:this={pill}
			class="segmented-pill"
			data-size={size}
			role="radiogroup"
			aria-label={hideLabel ? label : undefined}
			aria-labelledby={hideLabel ? undefined : `${uid}-label`}
		>
			{@render options()}
		</div>
	{/if}
</div>

<style>
	.radio-button-group {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5em;

		&.fill {
			align-items: stretch;
		}
	}

	/* As a Web Awesome form control's label. */
	.label {
		color: var(--wa-form-control-label-color);
		font-weight: var(--wa-form-control-label-font-weight);
		line-height: var(--wa-form-control-label-line-height);

		[data-size='s'] > & {
			font-size: var(--wa-font-size-s);
		}
	}

	.segmented-pill {
		/* Read by each option's own styles, in RadioButton.svelte. */
		--segment-height: 2.25rem;
		--segment-font-size: 0.9375rem;
		--segment-padding: 0.25rem 0.75rem;

		position: relative;
		display: inline-flex;
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: var(--wa-border-radius-pill);
		background: var(--wa-color-surface-lowered);

		&[data-size='s'] {
			--segment-height: 1.875rem;
			--segment-font-size: var(--wa-font-size-s);
			--segment-padding: 0.125rem 0.625rem;
		}

		.fill > & {
			display: grid;
			grid-auto-flow: column;
			grid-auto-columns: 1fr;
		}
	}

	/* Physical left and top, because the offsets it is placed by are. */
	.indicator {
		position: absolute;
		top: 0;
		left: 0;
		translate: var(--x, 0) var(--y, 0);
		inline-size: var(--width, 0);
		block-size: var(--height, 0);
		border-radius: var(--wa-border-radius-pill);
		background: var(--wa-color-surface-raised);
		opacity: 0;
		pointer-events: none;

		.segmented-pill:global([data-measured]) > & {
			opacity: 1;
		}

		.segmented-pill:global([data-slide]) > & {
			transition:
				translate 250ms ease-out,
				inline-size 250ms ease-out,
				block-size 250ms ease-out;
		}

		@media (prefers-reduced-motion: reduce) {
			.segmented-pill:global([data-slide]) > & {
				transition: none;
			}
		}
	}
</style>
