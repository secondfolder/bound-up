<script lang="ts">
	import { INTENSITY_LABELS } from '$lib/playroom/iq-test/copy';
	import { type Intensity, MAX_INTENSITY } from '$lib/playroom/iq-test/settings';

	/**
	 * The intensity slider: one slider rather than five options, because the
	 * levels are steps on a single scale, from straight-faced to overwhelming,
	 * and a slider says so. In the settings (`SettingsFields`), and on its own
	 * in the collapsed settings tab when there is room (`compact`).
	 *
	 * It moves freely while dragged, the level following the nearest notch as
	 * it goes (so what a level offers changes as it passes each one), and
	 * springs onto that notch when let go — `change`, which Web Awesome fires
	 * on release and on a click on the track. The keyboard still moves a whole
	 * level at a time: the fine step is for dragging only. Its formatter is
	 * what a screen reader announces instead of a number.
	 *
	 * Controlled: `value` is the level, and a new one is asked for through
	 * `onchange`. A level set from outside moves the knob; one that came from
	 * the knob does not, since the knob is already nearest it.
	 */
	let {
		value,
		onchange,
		ondrag,
		compact = false
	}: {
		value: Intensity;
		onchange: (level: Intensity) => void;
		/** A drag began or ended: from the pointer going down on it to it coming up anywhere. */
		ondrag?: (dragging: boolean) => void;
		/**
		 * Small, for the collapsed settings tab: its label unseen but still
		 * named to a screen reader, and no "None" and "Max" at its ends.
		 */
		compact?: boolean;
	} = $props();

	type WaSlider = HTMLElement & { value: number; valueFormatter?: (value: number) => string };

	/**
	 * How finely the knob moves while dragged: freely, to the eye. The level
	 * is whichever notch it is nearest, and it settles on that notch when let
	 * go (`springTo`).
	 */
	const DRAG_STEP = 0.01;
	/**
	 * The spring the knob settles with: quick, with a slight overshoot, then
	 * still. A damping ratio of about 0.75 (22/(2√320) was 0.61, which
	 * bounced back further and took longer about it).
	 */
	const STIFFNESS = 700;
	const DAMPING = 40;

	/** Where the knob is, between notches while it moves: what the notches are shaded by. */
	// svelte-ignore state_referenced_locally
	let position = $state<number>(value);
	/** The level the slider starts at, for the server's render; later changes are set on the element. */
	// svelte-ignore state_referenced_locally
	const startLevel = value;

	const nearest = (at: number) => Math.min(MAX_INTENSITY, Math.max(0, Math.round(at))) as Intensity;

	function setLevel(next: Intensity) {
		if (next !== value) {
			onchange(next);
		}
	}

	let frame = 0;
	let springing = false;

	/** Settle the knob on a notch with a spring, or at once for reduced motion. */
	function springTo(node: WaSlider, target: number) {
		cancelAnimationFrame(frame);
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			node.value = target;
			position = target;
			return;
		}
		let at = Number(node.value);
		let velocity = 0;
		let last = performance.now();
		springing = true;
		const step = (now: number) => {
			// Capped, so a frame that comes late does not fling the knob.
			const seconds = Math.min(0.032, (now - last) / 1000);
			last = now;
			velocity += (-STIFFNESS * (at - target) - DAMPING * velocity) * seconds;
			at += velocity * seconds;
			const settled = Math.abs(at - target) < 0.002 && Math.abs(velocity) < 0.02;
			const shown = settled ? target : Math.min(MAX_INTENSITY, Math.max(0, at));
			node.value = shown;
			position = shown;
			if (settled) {
				springing = false;
			} else {
				frame = requestAnimationFrame(step);
			}
		};
		frame = requestAnimationFrame(step);
	}

	const KEY_STEPS: Record<string, number> = {
		ArrowRight: 1,
		ArrowUp: 1,
		PageUp: 1,
		ArrowLeft: -1,
		ArrowDown: -1,
		PageDown: -1
	};

	/**
	 * Wired by hand rather than with `oninput=`: the slider's events come
	 * from inside its shadow root, and Svelte's delegated handlers do not
	 * reliably see those (see AGENTS.md).
	 */
	function slider(node: WaSlider) {
		node.valueFormatter = (at) => INTENSITY_LABELS[nearest(at)];
		const onInput = () => {
			cancelAnimationFrame(frame);
			springing = false;
			position = Number(node.value);
			setLevel(nearest(position));
		};
		const onChange = () => {
			const target = nearest(Number(node.value));
			setLevel(target);
			springTo(node, target);
		};
		// Captured on the host, ahead of the slider's own handler inside its
		// shadow root, which would move by the drag step.
		const onKeyDown = (event: KeyboardEvent) => {
			const by = KEY_STEPS[event.key];
			if (by === undefined) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			const target = nearest(nearest(Number(node.value)) + by);
			setLevel(target);
			springTo(node, target);
		};
		let dragging = false;
		const onUp = () => {
			globalThis.removeEventListener('pointerup', onUp);
			globalThis.removeEventListener('pointercancel', onUp);
			dragging = false;
			ondrag?.(false);
		};
		const onDown = () => {
			dragging = true;
			ondrag?.(true);
			globalThis.addEventListener('pointerup', onUp);
			globalThis.addEventListener('pointercancel', onUp);
		};
		node.addEventListener('input', onInput);
		node.addEventListener('change', onChange);
		node.addEventListener('keydown', onKeyDown, true);
		node.addEventListener('pointerdown', onDown);
		$effect(() => {
			const wanted = value;
			if (!springing && nearest(Number(node.value)) !== wanted) {
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
			// it (the dock) would never hear that it ended.
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
	 * right now. A sheet adopted into the slider's shadow root, since the
	 * track is in there, rewritten as the knob moves. Under the knob, which
	 * Web Awesome stacks at 3.
	 */
	function notches(node: WaSlider) {
		const root = node.shadowRoot;
		if (!root) {
			return;
		}
		const sheet = new CSSStyleSheet();
		root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
		$effect(() => {
			const at = position;
			const dots = Array.from({ length: MAX_INTENSITY - 1 }, (_, index) => {
				const step = index + 1;
				const colour =
					step <= at + 0.001
						? 'var(--wa-color-surface-default)'
						: 'var(--wa-color-neutral-on-normal)';
				return `radial-gradient(circle 0.1em at ${(step / MAX_INTENSITY) * 100}% 50%, ${colour} 90%, transparent)`;
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

{#snippet control()}
	<wa-slider
		{@attach slider}
		{@attach notches}
		class="intensity"
		class:compact
		label="Stimulation intensity"
		name="intensity"
		min={0}
		max={MAX_INTENSITY}
		step={DRAG_STEP}
		value={startLevel}
	>
		{#if !compact}
			<span slot="reference">None</span>
			<span slot="reference">Max</span>
		{/if}
	</wa-slider>
{/snippet}

{#if compact}
	<!--
		With a mark for what it is, as the volume sliders have theirs. Only a
		mark: the slider is named already, and unlike theirs it does nothing
		when pressed.
	-->
	<span class="compact-control">
		<wa-icon class="mark" name="signal" variant="solid" aria-hidden="true"></wa-icon>
		{@render control()}
	</span>
{:else}
	{@render control()}
{/if}

<style>
	/* The mark and the slider, as the volume control lays out its own. */
	.compact-control {
		display: inline-flex;
		align-items: center;
	}

	/* The size and colour of the volume control's speaker, centred in a
	   button's room, so the two read as a pair. */
	.mark {
		flex: none;
		inline-size: 2rem;
		font-size: 1rem;
		color: var(--wa-color-text-quiet);
	}

	/* No wider than it needs to be to drag comfortably, in the middle. */
	.intensity {
		align-self: center;
		inline-size: min(100%, 300px);

		&::part(label) {
			font-weight: 700;
		}

		/* In the bar: room at each end for the knob, which overhangs the track
		   at 0 and 4, and the label kept for a screen reader only. */
		&.compact {
			inline-size: 8rem;
			/* Outside the slider's own box, so its ends are the track's ends. */
			margin-inline: 0.5rem;

			/* Web Awesome leaves room above the track for the label, unseen
			   here, which put the track below the middle of the bar. */
			&::part(slider) {
				margin-block-start: 0;
			}

			&::part(label) {
				position: absolute;
				inline-size: 1px;
				block-size: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		}
	}
</style>
