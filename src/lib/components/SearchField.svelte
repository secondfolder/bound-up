<script lang="ts">
	/**
	 * A search box. With `collapsible` it rests as its magnifying glass alone,
	 * at the end of whatever holds it, and opens out towards the start while
	 * it has focus or anything in it — so the glass slides across to become
	 * the open field's own icon, since it is the same element all along. Left
	 * empty, it folds away again as focus leaves; there is no close button.
	 *
	 * One `wa-input` in both states rather than a button swapped for a field:
	 * the closed one is already the labelled search box, so it is reached by
	 * Tab and named for what it is, and nothing has to move focus across a
	 * swap.
	 */
	let {
		value = $bindable(''),
		label,
		placeholder = '',
		collapsible = false
	}: {
		value?: string;
		/** Visually hidden; what assistive tech calls the box, closed or open. */
		label: string;
		placeholder?: string;
		collapsible?: boolean;
	} = $props();

	let focused = $state(false);
	const open = $derived(!collapsible || focused || value !== '');

	// Listened for directly: Svelte's delegated `oninput` does not cross the
	// input's shadow root (AGENTS.md).
	function field(node: HTMLElement & { value: string }) {
		const update = () => {
			({ value } = node);
		};
		const clear = () => {
			value = '';
		};
		const onFocusIn = () => {
			focused = true;
		};
		const onFocusOut = (event: FocusEvent) => {
			// Focus moving inside it — to its clear button, say — is not leaving.
			const to = event.relatedTarget;
			if (to instanceof Node && (node.contains(to) || node.shadowRoot?.contains(to))) {
				return;
			}
			focused = false;
		};
		// Escape empties it, as a native search box does; closed, it then folds away.
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && value !== '') {
				event.preventDefault();
				value = '';
				node.value = '';
			} else if (event.key === 'Escape' && collapsible) {
				node.blur();
			}
		};
		node.addEventListener('input', update);
		node.addEventListener('wa-clear', clear);
		node.addEventListener('focusin', onFocusIn);
		node.addEventListener('focusout', onFocusOut);
		node.addEventListener('keydown', onKeyDown);
		return () => {
			node.removeEventListener('input', update);
			node.removeEventListener('wa-clear', clear);
			node.removeEventListener('focusin', onFocusIn);
			node.removeEventListener('focusout', onFocusOut);
			node.removeEventListener('keydown', onKeyDown);
		};
	}
</script>

<div class="search-field" class:closed={!open}>
	<wa-input
		{@attach field}
		type="search"
		size="s"
		pill
		{label}
		placeholder={open ? placeholder : ''}
		{value}
		with-clear
	>
		<wa-icon slot="start" name="magnifying-glass" variant="solid"></wa-icon>
	</wa-input>
</div>

<style>
	/* Registered so it can be animated: the padding either side of the glass,
	   which closed centres it in a circle and open is the field's own. */
	@property --search-field-padding {
		syntax: '<length>';
		inherits: true;
		initial-value: 0;
	}

	.search-field {
		/* The input's own size, so the ems below are the ones it lays out in. */
		font-size: var(--wa-font-size-s);
		--search-field-padding: 1em;
		/* Sized by what holds it, never by the native input's twenty-odd
		   characters: as a row's minimum that once widened a whole page past a
		   phone's screen. */
		contain: inline-size;

		inline-size: 100%;
		min-inline-size: var(--wa-form-control-height);
		/* Pinned to the end, so it grows towards the start, carrying the glass. */
		margin-inline-start: auto;
		transition:
			inline-size var(--wa-transition-normal) var(--wa-transition-easing),
			--search-field-padding var(--wa-transition-normal) var(--wa-transition-easing);

		wa-input {
			inline-size: 100%;
			--wa-form-control-padding-inline: var(--search-field-padding);
		}

		wa-input::part(form-control-label) {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}

	/* Closed, it looks like a plain round icon button: a circle as wide as
	   the field is tall, the glass in its middle. */
	.closed {
		inline-size: var(--wa-form-control-height);
		--search-field-padding: calc(
			(var(--wa-form-control-height) - 1em) /
			2 -
			var(--wa-form-control-border-width)
		);

		wa-input {
			--wa-form-control-border-color: transparent;
			--wa-form-control-background-color: transparent;
		}

		wa-input::part(input-wrapper) {
			cursor: pointer;
		}

		wa-input:hover {
			--wa-form-control-background-color: var(--wa-color-neutral-fill-quiet);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.search-field {
			transition: none;
		}
	}
</style>
