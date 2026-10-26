<script lang="ts">
	import type { Snippet } from 'svelte';
	import InlineButton from './InlineButton.svelte';

	/**
	 * Every slider in Bound Up: `wa-slider` with the behaviour this app wants
	 * from all of them, so a feature's slider is this plus whatever only makes
	 * sense for that feature (`IntensitySlider`, `OptionalSlider`,
	 * `SoundControl`, `ListFilters`). Reach for this rather than `wa-slider`.
	 *
	 * **Notched** (the default, for a slider whose values are steps on a
	 * scale): the knob moves freely while dragged, `oninput` following the
	 * nearest notch as it passes each one, and when let go it springs onto that
	 * notch and `onchange` says so. Web Awesome's own notched slider jumps
	 * from notch to notch under the finger, which reads as stuck rather than
	 * stepped. The keyboard moves a whole notch at a time: the fine step is
	 * for dragging only. The notches are drawn here, shaded by where the knob
	 * is (`notches`).
	 *
	 * **Continuous** (`notched={false}`, for a volume): Web Awesome's slider,
	 * at `step`, `oninput` while it moves and `onchange` when let go.
	 *
	 * **Unset** (`value={null}`): a slider that may be left saying nothing,
	 * rather than something middling. The bare knob sits at `restingValue`
	 * with no filled track, and pressing it without moving it sets the level
	 * it sits at, since it already looks like a level.
	 *
	 * **Clearable** (`onclear`): an unset slider that can be taken back to
	 * unset once set. A row above the track holds its title at the left and,
	 * at the right, Clear while it has a value, after any `status` (the
	 * level in words, say). The row is drawn here rather than in the slider's
	 * label, which is a <label>, and a button must not go in one: the slider
	 * keeps that label for its accessible name, out of sight, and the row's
	 * title is hidden from assistive tech instead.
	 *
	 * Controlled: `value` is the level, and a new one is asked for through
	 * `onchange` (and, while dragging, `oninput`). A value set from outside
	 * moves the knob; one that came from the knob does not, since the knob is
	 * already nearest it. Its events are wired by hand rather than with
	 * `oninput=`: they come from inside a shadow root, which Svelte's delegated
	 * handlers do not reliably see (AGENTS.md).
	 */
	let {
		label,
		labelHidden = false,
		value,
		min = 0,
		max,
		step = 1,
		notched = true,
		restingValue,
		format,
		low,
		high,
		size,
		name,
		class: className = '',
		reference,
		oninput,
		onchange,
		ondrag,
		onclear,
		status
	}: {
		/** Its accessible name, and its visible label unless `labelHidden`. */
		label: string;
		/**
		 * Named to a screen reader but not shown, for a slider whose name is on
		 * screen some other way (an icon, a heading drawn beside it). It also
		 * takes away the room Web Awesome leaves above the track for the label,
		 * so the track sits in the middle of whatever row it is in.
		 */
		labelHidden?: boolean;
		/** The level, or null for one not set (see "Unset" above). */
		value: number | null;
		min?: number;
		max: number;
		/** The distance between notches; for a continuous slider, its step. */
		step?: number;
		notched?: boolean;
		/** Where an unset knob sits. The middle notch unless said. */
		restingValue?: number;
		/** What a screen reader announces instead of a bare number. */
		format?: (value: number) => string;
		/** Words under the two ends of the track. */
		low?: string;
		high?: string;
		size?: 's' | 'm' | 'l';
		/** For a slider inside a form, which Web Awesome's is part of. */
		name?: string;
		class?: string;
		/** Anything else for the slider's slots, such as a `reference` of its own. */
		reference?: Snippet;
		/** While it moves: the nearest notch for a notched slider, the value for a continuous one. */
		oninput?: (value: number) => void;
		/** When it settles: let go, a click on the track, or a key. */
		onchange?: (value: number) => void;
		/** A drag began or ended: from the pointer going down on it to it coming up anywhere. */
		ondrag?: (dragging: boolean) => void;
		/** Asked to go back to unset, from its Clear (see "Clearable" above). */
		onclear?: () => void;
		/** Words beside Clear on a clearable slider: its level, said in words. */
		status?: string;
	} = $props();

	type WaSlider = HTMLElement & { value: number; valueFormatter?: (value: number) => string };

	/** Dragging moves in hundredths of a notch: freely, to the eye. */
	const DRAG_DIVISIONS = 100;
	/**
	 * The spring the knob settles with, in notches: quick, with a slight
	 * overshoot, then still. A damping ratio of about 0.75.
	 */
	const STIFFNESS = 700;
	const DAMPING = 40;
	/** More notches than this and they are a texture, not marks: none are drawn. */
	const MAX_DRAWN_NOTCHES = 20;

	const resting = $derived(restingValue ?? min + Math.round((max - min) / step / 2) * step);

	/** Where the knob is, between notches while it moves: what the notches are shaded by. */
	// svelte-ignore state_referenced_locally
	let position = $state<number>(value ?? restingValue ?? min);
	/**
	 * Whether the knob is held or has moved since it last settled: an unset
	 * slider shows its fill then, since it is at a level as far as the person
	 * holding it can see.
	 */
	let held = $state(false);
	/** The value the slider starts at, for the server's render; later changes are set on the element. */
	// svelte-ignore state_referenced_locally
	const startValue = value ?? restingValue ?? min + Math.round((max - min) / step / 2) * step;

	function nearest(at: number): number {
		const notch = Math.round((at - min) / step);
		return Math.min(max, Math.max(min, min + notch * step));
	}

	let frame = 0;
	let springing = false;

	/** Settles the knob on a notch with a spring, or at once for reduced motion. */
	function springTo(node: WaSlider, target: number) {
		cancelAnimationFrame(frame);
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			node.value = target;
			position = target;
			return;
		}
		// In notches, so the spring feels the same whatever the scale's units.
		let at = (Number(node.value) - target) / step;
		let velocity = 0;
		let last = performance.now();
		springing = true;
		const tick = (now: number) => {
			// Capped, so a frame that comes late does not fling the knob.
			const seconds = Math.min(0.032, (now - last) / 1000);
			last = now;
			velocity += (-STIFFNESS * at - DAMPING * velocity) * seconds;
			at += velocity * seconds;
			const settled = Math.abs(at) < 0.002 && Math.abs(velocity) < 0.02;
			const shown = settled ? target : Math.min(max, Math.max(min, target + at * step));
			node.value = shown;
			position = shown;
			if (settled) {
				springing = false;
			} else {
				frame = requestAnimationFrame(tick);
			}
		};
		frame = requestAnimationFrame(tick);
	}

	const KEY_STEPS: Record<string, number> = {
		ArrowRight: 1,
		ArrowUp: 1,
		PageUp: 1,
		ArrowLeft: -1,
		ArrowDown: -1,
		PageDown: -1
	};

	function wire(node: WaSlider) {
		node.valueFormatter = (at) => format?.(notched ? nearest(at) : at) ?? String(at);
		/** The last notch `oninput` was told of, so it hears of each one once. */
		let passing: number | null = null;
		/** Whether the press now under way moved the knob, or settled it some other way. */
		let settledThisPress = false;

		function settle(target: number) {
			settledThisPress = true;
			passing = null;
			held = false;
			if (target !== value) {
				onchange?.(target);
			}
		}

		const onInput = () => {
			const at = Number(node.value);
			if (!notched) {
				position = at;
				oninput?.(at);
				return;
			}
			cancelAnimationFrame(frame);
			springing = false;
			held = true;
			position = at;
			const level = nearest(at);
			if (level !== passing) {
				passing = level;
				oninput?.(level);
			}
		};
		const onChange = () => {
			const at = Number(node.value);
			if (!notched) {
				settle(at);
				return;
			}
			const target = nearest(at);
			settle(target);
			springTo(node, target);
		};
		// Captured on the host, ahead of the slider's own handler inside its
		// shadow root, which would move by the drag step.
		const onKeyDown = (event: KeyboardEvent) => {
			const by = KEY_STEPS[event.key];
			if (!notched || by === undefined) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			const target = nearest(nearest(Number(node.value)) + by * step);
			oninput?.(target);
			settle(target);
			springTo(node, target);
		};
		let dragging = false;
		const onUp = () => {
			globalThis.removeEventListener('pointerup', onUp);
			globalThis.removeEventListener('pointercancel', onUp);
			dragging = false;
			ondrag?.(false);
			// An unset knob sits at a level already, so a press that did not
			// move it sets that level. The slider sends no `change` for it —
			// its value has not moved — so this does, a task later, after any
			// `change` the release did send.
			setTimeout(() => {
				if (!settledThisPress && value === null) {
					settle(nearest(Number(node.value)));
				}
			});
		};
		const onDown = () => {
			dragging = true;
			held = true;
			settledThisPress = false;
			ondrag?.(true);
			// Held: the level the knob is on, which for an unset slider is news.
			const level = notched ? nearest(Number(node.value)) : Number(node.value);
			passing = level;
			oninput?.(level);
			globalThis.addEventListener('pointerup', onUp);
			globalThis.addEventListener('pointercancel', onUp);
		};
		node.addEventListener('input', onInput);
		node.addEventListener('change', onChange);
		node.addEventListener('keydown', onKeyDown, true);
		node.addEventListener('pointerdown', onDown);
		$effect(() => {
			const wanted = value ?? resting;
			const shownAt = notched ? nearest(Number(node.value)) : Number(node.value);
			if (!(springing || dragging) && shownAt !== wanted) {
				node.value = wanted;
				position = wanted;
			}
		});
		return () => {
			cancelAnimationFrame(frame);
			node.removeEventListener('input', onInput);
			node.removeEventListener('change', onChange);
			node.removeEventListener('keydown', onKeyDown, true);
			node.removeEventListener('pointerdown', onDown);
			// Gone mid-drag: the drag is over, or whoever is holding still for
			// it would never hear that it ended.
			if (dragging) {
				onUp();
			}
			globalThis.removeEventListener('pointerup', onUp);
			globalThis.removeEventListener('pointercancel', onUp);
		};
	}

	/**
	 * The notches, one per level, drawn here rather than by Web Awesome: its
	 * `with-markers` puts one at every step, and the step is the drag's
	 * hundredth. Each is a dot over the track, light where the track is filled
	 * and dark where it is not (Web Awesome's own, in the surface colour, all
	 * but vanished on the pale unfilled part), shaded by where the knob is
	 * right now. A sheet adopted into the slider's shadow root, since the track
	 * is in there, rewritten as the knob moves. Under the knob, which Web
	 * Awesome stacks at 3.
	 */
	function notches(node: WaSlider) {
		const root = node.shadowRoot;
		const count = Math.round((max - min) / step) - 1;
		if (!(root && notched) || count < 1 || count > MAX_DRAWN_NOTCHES) {
			return;
		}
		const sheet = new CSSStyleSheet();
		root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
		$effect(() => {
			const filledTo = value === null && !held ? min - 1 : position;
			const dots = Array.from({ length: count }, (_, index) => {
				const at = min + (index + 1) * step;
				const colour =
					at <= filledTo + step / 1000
						? 'var(--wa-color-surface-default)'
						: 'var(--wa-color-neutral-on-normal)';
				return `radial-gradient(circle 0.1em at ${((at - min) / (max - min)) * 100}% 50%, ${colour} 90%, transparent)`;
			});
			sheet.replaceSync(
				`#track::after { content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none; background: ${dots.join(', ')}; }`
			);
		});
		return () => {
			root.adoptedStyleSheets = root.adoptedStyleSheets.filter((each) => each !== sheet);
		};
	}
</script>

{#snippet track()}
	<wa-slider
		{@attach wire}
		{@attach notches}
		class={["slider", onclear === undefined && className]}
		class:label-hidden={labelHidden || onclear !== undefined}
		class:unset={value === null && !held}
		{label}
		{name}
		{min}
		{max}
		step={notched ? step / DRAG_DIVISIONS : step}
		value={startValue}
		size={size ?? "m"}
	>
		{#if low !== undefined}
			<span slot="reference">{low}</span>
		{/if}
		{#if high !== undefined}
			<span slot="reference">{high}</span>
		{/if}
		{@render reference?.()}
	</wa-slider>
{/snippet}

{#if onclear}
	<!-- Clear's name ends in hidden text, so each is told apart ("Clear heat"). -->
	<div class={['clearable', className]}>
		<div class="heading">
			{#if !labelHidden}
				<span class="title" aria-hidden="true">{label}</span>
			{/if}
			<!-- Clear inherits its size and colour from the status beside it. -->
			<span class="status">
				{status ?? ''}
				{#if value !== null}
					<InlineButton onclick={onclear}>
						Clear <span class="wa-visually-hidden">{label.toLowerCase()}</span>
					</InlineButton>
				{/if}
			</span>
		</div>
		{@render track()}
	</div>
{:else}
	{@render track()}
{/if}

<style>
	.clearable .heading {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-block-end: 0.25rem;
	}

	.clearable .title {
		flex: 1 1 auto;
		font-weight: var(--wa-form-control-label-font-weight);
		color: var(--wa-form-control-label-color);
	}

	/* At the right whether or not there is a title before it. */
	.clearable .status {
		margin-inline-start: auto;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);
	}

	.slider {
		inline-size: 100%;

		/* Named to a screen reader, out of sight. */
		&.label-hidden {
			&::part(label) {
				position: absolute;
				inline-size: 1px;
				block-size: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			/* Web Awesome leaves room above the track for the label, unseen
			   here, which would put the track below the middle of its row. */
			&::part(slider) {
				margin-block-start: 0;
			}
		}

		/* An unset slider is the bare knob, with no filled track to say it is at
		   a level. Greyed out instead, it looked disabled. */
		&.unset::part(indicator) {
			visibility: hidden;
		}
	}
</style>
