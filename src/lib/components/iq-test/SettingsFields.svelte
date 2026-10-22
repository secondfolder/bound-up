<script lang="ts" module>
	import type { Settings } from '$lib/playroom/iq-test/settings';

	/** Everything the settings choose, which is everything but the role. */
	export type SettingsChoice = Omit<Settings, 'role'>;
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import {
		PORN_MEDIA_OPTIONS,
		PORN_OPTIONS_LABEL,
		TOGGLE_HELP,
		TOGGLE_LABELS,
		VIBE_OPTIONS
	} from '$lib/playroom/iq-test/copy';
	import {
		IQ_INPUT_MAX,
		IQ_INPUT_MIN,
		PORN_MEDIA,
		type Toggle,
		togglesAt,
		VIBE_LEVEL,
		VIBES
	} from '$lib/playroom/iq-test/settings';
	import IntensitySlider from './IntensitySlider.svelte';
	import PagePreview, { exampleSettings, ILLUSTRATED_TOGGLES } from './PagePreview.svelte';

	/**
	 * The IQ test's settings, everything but the role. Shared by the setup
	 * dialog, whose role buttons start the test, and the dock's settings
	 * panel, which changes a run as it goes.
	 *
	 * The slider picks how intense the test is, and what that level offers
	 * appears under it, all ticked to start with: from 1 the humiliating
	 * analysis; from 2 the vibe, and whether the look and the questions follow
	 * it (and bambi's hypno); from 3 porn (and every other vibe's hypno); at 4
	 * the subliminals, with their photosensitivity warning beside them. See
	 * `togglesAt` for the order, and `settings.ts` for what each one does.
	 *
	 * Controlled: `value` is what is shown, and every change is asked for
	 * through `onchange`. The dialog keeps a draft of its own and applies it
	 * when it closes; the dock's panel changes the page's settings directly.
	 * The vibe is kept whatever the level, so going back up finds it still
	 * chosen; a level below it is simply not themed (`effectiveVibe`).
	 */
	let {
		value,
		onchange,
		sliderLast = false
	}: {
		value: SettingsChoice;
		onchange: (choice: SettingsChoice) => void;
		/**
		 * The dialog's order reversed, for the dock's panel: "More options",
		 * then the options the slider brings in (themselves reversed), then
		 * the slider.
		 * The panel stands on the foot of the window and grows upwards, so
		 * options appearing above the slider leave it where it was under the
		 * pointer dragging it, rather than pushing it up out from under it.
		 * Not in the dialog, which reads top to bottom and grows downwards.
		 */
		sliderLast?: boolean;
	} = $props();

	/** Ties each info button to its popover; unique, as the dialog and the dock can both be open. */
	const uid = $props.id();

	const level = $derived(value.intensity);
	const vibe = $derived(value.vibe ?? VIBES[0]);

	const asText = (iq: number | null) => (iq === null ? '' : String(iq));

	/**
	 * The IQ boxes' text as typed, kept here rather than in `value`: a
	 * half-typed "12" is not yet an IQ (the least is 40), and must not be
	 * turned into one under the typing. `value` carries what it amounts to.
	 */
	// svelte-ignore state_referenced_locally
	let soberText = $state(asText(value.soberIq));
	// svelte-ignore state_referenced_locally
	let targetText = $state(asText(value.targetIq));

	/**
	 * What the level offers, in the order shown: reversed in the dock's
	 * panel, along with the rest of it (see `sliderLast`). Reversed in the
	 * markup rather than with CSS, so the keyboard and a screen reader meet
	 * them in the order they are seen.
	 */
	const offered = $derived.by(() => {
		const atLevel = togglesAt(level, vibe);
		return sliderLast ? [...atLevel].reverse() : atLevel;
	});
	const vibeOption = $derived(VIBE_OPTIONS.find((option) => option.id === vibe));

	function iqFrom(text: string): number | null {
		const iq = Number.parseInt(text, 10);
		if (!Number.isFinite(iq)) {
			return null;
		}
		return Math.min(IQ_INPUT_MAX, Math.max(IQ_INPUT_MIN, iq));
	}

	// An IQ that arrives from outside — remembered settings, read on mount
	// after the server's render — rewrites its box; one that came from the
	// box itself already agrees with what is typed, and is left alone.
	$effect.pre(() => {
		const { soberIq, targetIq } = value;
		untrack(() => {
			if (iqFrom(soberText) !== soberIq) {
				soberText = asText(soberIq);
			}
			if (iqFrom(targetText) !== targetIq) {
				targetText = asText(targetIq);
			}
		});
	});

	let soberInput = $state<WaValue>();
	let targetInput = $state<WaValue>();

	/**
	 * `value`, with the IQs read from the boxes themselves while they are on
	 * the page: a value can arrive in one without any event this component
	 * hears (a password manager's autofill, see AGENTS.md), and the dialog
	 * reads this as it closes. Kept below their level, like the vibe, and
	 * ignored there (`effectiveIqs`).
	 */
	export function snapshot(): SettingsChoice {
		return {
			...value,
			vibe,
			soberIq: soberInput ? iqFrom(soberInput.value ?? '') : value.soberIq,
			targetIq: targetInput ? iqFrom(targetInput.value ?? '') : value.targetIq
		};
	}

	function change(patch: Partial<SettingsChoice>) {
		onchange({ ...value, vibe, ...patch });
	}

	type WaValue = HTMLElement & { value?: string | null };
	type WaCheckbox = HTMLElement & { checked: boolean };

	/**
	 * Every control here is wired by hand rather than with `oninput=`: their
	 * events come from inside a shadow root, and Svelte's delegated handlers
	 * do not reliably see those (see AGENTS.md). Each reads the element, not
	 * the event.
	 */
	function listen(node: HTMLElement, update: () => void) {
		node.addEventListener('input', update);
		node.addEventListener('change', update);
		return () => {
			node.removeEventListener('input', update);
			node.removeEventListener('change', update);
		};
	}

	function toggleBox(toggle: Toggle) {
		return (node: WaCheckbox) =>
			listen(node, () => {
				if (value[toggle] !== node.checked) {
					change({ [toggle]: node.checked });
				}
			});
	}

	function vibeSelect(node: WaValue) {
		return listen(node, () => {
			const next = VIBES.find((each) => each === node.value);
			if (next && next !== vibe) {
				change({ vibe: next });
			}
		});
	}

	/**
	 * Whether the porn's own options are up. Mounted only while they are, so
	 * the dialog opens as it mounts: an `open={false}` rendered on the server
	 * would come out as `open="false"`, which Lit reads as open.
	 */
	let pornOptionsOpen = $state(false);

	function pornMediaGroup(node: WaValue) {
		return listen(node, () => {
			const next = PORN_MEDIA.find((each) => each === node.value);
			if (next && next !== value.pornMedia) {
				change({ pornMedia: next });
			}
		});
	}

	function iqBox(which: 'sober' | 'target') {
		return (node: WaValue) =>
			listen(node, () => {
				const text = node.value ?? '';
				if (which === 'sober') {
					soberText = text;
					change({ soberIq: iqFrom(text) });
				} else {
					targetText = text;
					change({ targetIq: iqFrom(text) });
				}
			});
	}
</script>

{#snippet vibeChoice()}
	<wa-select
		{@attach vibeSelect}
		label="Theme/Vibe"
		name="vibe"
		value={vibe}
		hint={vibeOption?.description}
		data-testid="vibe-select"
	>
		{#each VIBE_OPTIONS as option (option.id)}
			<wa-option value={option.id}>{option.label}</wa-option>
		{/each}
	</wa-select>
{/snippet}

{#snippet checkbox(toggle: Toggle)}
	<!--
		The box, and beside it — not inside its label, where a click would tick
		it — a button for what it does, with examples ticked and not.
	-->
	<div class="option" data-testid="option-{toggle}">
		<wa-checkbox
			{@attach toggleBox(toggle)}
			name={toggle}
			checked={value[toggle]}
			data-testid="toggle-{toggle}"
		>
			{TOGGLE_LABELS[toggle]}
		</wa-checkbox>
		<span class="buttons">
			<button
				type="button"
				class="info"
				id="{uid}-info-{toggle}"
				aria-label="About “{TOGGLE_LABELS[toggle]}”"
				data-testid="info-{toggle}"
			>
				<!-- Solid: Font Awesome's free set has no regular circle-info, and drew nothing. -->
				<wa-icon name="circle-info" variant="solid"></wa-icon>
			</button>
			{#if toggle === 'porn'}
				<!-- Native, to match the info button beside it. -->
				<button
					type="button"
					class="info"
					aria-label={PORN_OPTIONS_LABEL}
					aria-haspopup="dialog"
					data-testid="options-porn"
					onclick={() => {
						pornOptionsOpen = true;
					}}
				>
					<wa-icon name="gear" variant="solid"></wa-icon>
				</button>
			{/if}
		</span>
		<wa-popover
			for="{uid}-info-{toggle}"
			placement="top"
			class="help"
			class:illustrated={ILLUSTRATED_TOGGLES.includes(toggle)}
		>
			<p>{TOGGLE_HELP[toggle].about}</p>
			<!-- Side by side when pictured, so the two pictures compare at a glance. -->
			<dl>
				{#each [true, false] as on (on)}
					<div>
						<dt>{on ? 'Ticked' : 'Unticked'}</dt>
						<dd>
							{#if ILLUSTRATED_TOGGLES.includes(toggle)}
								<PagePreview
									settings={exampleSettings(toggle, on, vibe, level)}
									testid="example-{toggle}-{on ? 'on' : 'off'}"
								/>
							{/if}
							{on ? TOGGLE_HELP[toggle].on : TOGGLE_HELP[toggle].off}
						</dd>
					</div>
				{/each}
			</dl>
		</wa-popover>
		{#if toggle === 'porn' && pornOptionsOpen}
			<!--
				Over the setup dialog when it is in it: a modal opened from a modal
				stacks on top, and the setup dialog ignores the hide events that
				bubble up from it (they are not its own).
			-->
			<wa-dialog
				label={PORN_OPTIONS_LABEL}
				open
				light-dismiss
				class="porn-options"
				data-testid="porn-options"
				onwa-after-hide={(event: Event) => {
					if (event.target === event.currentTarget) {
						pornOptionsOpen = false;
					}
				}}
			>
				<wa-radio-group
					{@attach pornMediaGroup}
					label="Show"
					name="pornMedia"
					value={value.pornMedia}
					data-testid="porn-media"
				>
					{#each PORN_MEDIA_OPTIONS as option (option.id)}
						<wa-radio value={option.id}>
							{option.label}
							<span class="radio-hint">{option.hint}</span>
						</wa-radio>
					{/each}
				</wa-radio-group>
			</wa-dialog>
		{/if}
		{#if toggle === 'subliminals'}
			<!--
				Straight under the box that turns them on, so it is read before
				ticking it. Its own line rather than the box's hint: a hint widens
				the box to the warning's length, which pushed the info button to the
				far side of the row.
			-->
			<p class="photosensitivity">
				<span>
					<wa-icon name="triangle-exclamation" variant="solid"></wa-icon>
					Flashes images and text, faster as it goes. Leave this off if flashing lights can trigger
					seizures for you.
				</span>
			</p>
		{/if}
	</div>
{/snippet}

<div class="settings-fields" class:slider-last={sliderLast}>
	<IntensitySlider value={level} onchange={(intensity) => change({ intensity })} />

		<!--
			The level's options, and beside them the page as they would make it,
			following every change: under them where there is no room beside.
		-->
		<div class="choices" class:alone={offered.length === 0 || level < VIBE_LEVEL}>
			{#if offered.length > 0}
				<div class="options" data-testid="level-options">
					{#each offered as toggle (toggle)}
						<!-- The vibe comes in with level 2, ahead of the two boxes that follow it. -->
						{#if toggle === 'themedLook' && !sliderLast}
							{@render vibeChoice()}
						{/if}
						{@render checkbox(toggle)}
						{#if toggle === 'themedLook' && sliderLast}
							{@render vibeChoice()}
						{/if}
					{/each}
				</div>
			{/if}
			<!-- From the vibe's level: below it the page is the plain test, nothing to preview. -->
			{#if level >= VIBE_LEVEL}
				<!-- Decoration, like the picture in it: the options say it all in words. -->
				<figure class="preview-figure" aria-hidden="true">
					<figcaption>Preview</figcaption>
					<PagePreview
						settings={{ ...value, vibe }}
						large
						testid="settings-preview"
					/>
				</figure>
			{/if}
		</div>

	<!-- Only from level 1: a straight-faced assessment compares against nothing. -->
	{#if level >= 1}
		<wa-details summary="More options" class="more">
			<div class="numbers">
				<wa-input
					bind:this={soberInput}
					{@attach iqBox('sober')}
					type="number"
					name="soberIq"
					label="Your sober IQ"
					hint="Optional. Shown beside your result."
					min={IQ_INPUT_MIN}
					max={IQ_INPUT_MAX}
					inputmode="numeric"
					value={soberText}
				></wa-input>
				<wa-input
					bind:this={targetInput}
					{@attach iqBox('target')}
					type="number"
					name="targetIq"
					label="Target IQ"
					hint="Optional. What you're hoping for."
					min={IQ_INPUT_MIN}
					max={IQ_INPUT_MAX}
					inputmode="numeric"
					value={targetText}
				></wa-input>
			</div>
		</wa-details>
	{/if}
</div>

<style>
	.settings-fields {
		container: settings-fields / inline-size;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;

		/* The dialog's order turned upside down: "More options" first, then
		   the level's options, then the slider last of all, so nothing that
		   comes and goes with the level sits below it. */
		&.slider-last {
			wa-details {
				order: -1;
			}

			:global(.intensity) {
				order: 1;
			}
		}
	}

	/* The options and the preview side by side, the preview a fixed size at
	   the top; one above the other where the two will not fit. */
	.choices {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 1rem;

		/* Beside the options, level with the middle of their box. */
		.preview-figure {
			align-self: center;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.375rem;
			margin: 0;

			figcaption {
				font-size: var(--wa-font-size-s);
				font-weight: 600;
				color: var(--wa-color-text-quiet);
			}

			:global(.preview) {
				inline-size: 13rem;
			}
		}

		/* No preview: the options take the width. */
		&.alone {
			grid-template-columns: minmax(0, 1fr);
		}

		@container settings-fields (width < 36rem) {
			grid-template-columns: minmax(0, 1fr);

			.preview-figure {
				justify-self: center;
			}

			.preview-figure :global(.preview) {
				inline-size: min(100%, 13rem);
			}
		}
	}

	/* The dock's panel, the dialog's order reversed: stacked, the preview
	   comes above the options (and under "More options"). */
	@container settings-fields (width < 36rem) {
		.slider-last .choices .preview-figure {
			order: -1;
		}
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		padding: 0.875rem;
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);

		wa-select {
			max-inline-size: 22rem;
		}
	}

	/* The box and its info button, the button level with the label's first
	   line; a warning, if any, on a line of its own under them. */
	.option {
		display: grid;
		/* The label as wide as it needs, wrapping only when it must; the
		   button straight after it. The second column flexible, so a warning
		   spanning both is shared by it rather than squeezing the label. */
		grid-template-columns: auto 1fr;
		justify-items: start;
		align-items: start;
		gap: 0 0.375rem;
	}

	/* The info button, and the porn's settings button after it. */
	.buttons {
		display: flex;
		gap: 0.125rem;
		/* Centred on the label's first line, which is the box's height. */
		margin-block-start: calc((var(--wa-form-control-toggle-size) - 1.5rem) / 2);
	}

	/* A native button: small, round, and quiet until pointed at. */
	.info {
		flex: none;
		display: grid;
		place-items: center;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--wa-color-text-quiet);
		font-size: 0.9375rem;
		cursor: pointer;

		@media (hover: hover) {
			&:hover {
				color: var(--wa-color-brand-on-quiet);
			}
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.help {
		--max-width: min(22rem, calc(100vw - 2rem));
		font-size: var(--wa-font-size-s);

		p {
			margin: 0 0 0.625rem;
		}

		dl {
			display: grid;
			gap: 0.25rem;
			margin: 0;
		}

		dt {
			font-weight: 700;
		}

		dd {
			margin: 0 0 0.375rem;
			color: var(--wa-color-text-quiet);

			:global(.example) {
				margin-block: 0.25rem 0.375rem;
			}
		}

		&.illustrated {
			--max-width: min(28rem, calc(100vw - 2rem));

			dl {
				grid-template-columns: 1fr 1fr;
				gap: 0.75rem;
			}
		}
	}

	/* Under the label, not under the box: indented by the box and the gap
	   after it, both sized from the checkbox's font, which the paragraph
	   keeps; the words inside set their smaller size themselves. */
	.photosensitivity {
		grid-column: 1 / -1;
		margin: 0.25rem 0 0;
		padding-inline-start: calc(var(--wa-form-control-toggle-size) + 0.5em);
		font-size: var(--wa-form-control-value-font-size);

		span {
			display: inline-flex;
			align-items: baseline;
			gap: 0.375rem;
			font-size: var(--wa-font-size-smaller);
			color: var(--wa-color-warning-on-quiet);
		}

		wa-icon {
			flex: none;
		}
	}

	.porn-options {
		--width: min(calc(100vw - 2rem), 24rem);

		wa-radio-group::part(form-control-input) {
			gap: 0.75rem;
		}
	}

	/* Under the option's name, quieter. */
	.radio-hint {
		display: block;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.numbers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
	}
</style>
