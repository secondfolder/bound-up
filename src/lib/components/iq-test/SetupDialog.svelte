<script lang="ts">
	import { ROLE_BUTTONS } from '$lib/playroom/iq-test/copy';
	import type { Role, Settings } from '$lib/playroom/iq-test/settings';
	import SettingsFields, { type SettingsChoice } from './SettingsFields.svelte';

	/**
	 * The disclaimer and settings, shown over the page on every visit.
	 *
	 * Choosing a role is what starts the test, so the two role buttons are the
	 * dialog's submit buttons. They sit at the end of its contents and scroll
	 * with them, read after the disclaimer and the settings rather than pinned
	 * under them.
	 *
	 * Closing it (the X, Escape, or a click on the backdrop) starts nothing:
	 * the page keeps whatever is picked here, with the role from last time. So
	 * it can only be closed once there is a last time (`closable`). Before a
	 * role has ever been chosen the test cannot know which way to rig itself,
	 * and the dialog stays until one is.
	 *
	 * Rendered open on the server, so it covers the page from the first paint
	 * (see the `:not(:defined)` rule below). The remembered settings only exist
	 * in the browser, so they arrive later as a new `initial`, and the draft
	 * starts again from them.
	 *
	 * What is picked here is a draft, applied only when the dialog closes or
	 * a role starts the test: the page behind does not change under it.
	 */
	let {
		initial,
		closable = false,
		onstart,
		onclose
	}: {
		initial: Settings;
		/** Whether a role has been chosen before, and so the dialog may be closed without one. */
		closable?: boolean;
		/** A role button was pressed. */
		onstart: (settings: Settings) => void;
		/** Closed without choosing a role. */
		onclose: (settings: Settings) => void;
	} = $props();

	let open = $state(true);
	let started = false;
	let fields = $state<SettingsFields>();

	const choiceOf = ({ role: _role, ...choice }: Settings): SettingsChoice => choice;
	// svelte-ignore state_referenced_locally
	let draft = $state<SettingsChoice>(choiceOf(initial));
	$effect.pre(() => {
		draft = choiceOf(initial);
	});

	function current(role: Role): Settings {
		return { ...(fields?.snapshot() ?? draft), role };
	}

	function start(role: Role) {
		started = true;
		open = false;
		onstart(current(role));
	}

	/**
	 * Refuse to close, short of a role, until one has been chosen. Web Awesome
	 * asks first with a cancelable `wa-hide` (the X, Escape, the backdrop, and
	 * `open = false` alike), so only a close that is not a start is refused.
	 * `wa-details` inside fires its own, which bubbles, and is left alone.
	 */
	function onHide(event: Event) {
		if (event.target === event.currentTarget && !(started || closable)) {
			event.preventDefault();
		}
	}

	function afterHide(event: Event) {
		// `wa-details` inside the dialog fires its own `wa-after-hide` when it
		// collapses, and it bubbles: only the dialog's own one means "closed".
		if (event.target !== event.currentTarget) {
			return;
		}
		open = false;
		if (!started) {
			onclose(current(initial.role));
		}
	}
</script>

<!--
	`light-dismiss` only when it may be closed, and spread rather than bound to
	a boolean: on the server `light-dismiss={false}` would render as the
	attribute, which Lit reads as true.
-->
<wa-dialog
	label="Before you start"
	{open}
	class="setup"
	class:closable
	{...closable ? { 'light-dismiss': true } : {}}
	onwa-hide={onHide}
	onwa-after-hide={afterHide}
>
	<div class="disclaimer">
		<p>
			<strong>This is a kink toy for consenting adults.</strong> It is not a real IQ test and its
			scores mean nothing. It is built to humiliate the people who want humiliating, and to flatter the
			people doing the humiliating — on purpose.
		</p>
		<p>
			Don't take it seriously, and don't use it on anyone who hasn't agreed to play. If you're under
			18, close this page.
		</p>
	</div>

	<SettingsFields
		bind:this={fields}
		value={draft}
		onchange={(choice) => {
			draft = choice;
		}}
	/>

	<div class="roles">
		<wa-button variant="brand" onclick={() => start('dom')}>{ROLE_BUTTONS.dom}</wa-button>
		<wa-button variant="brand" onclick={() => start('sub')}>{ROLE_BUTTONS.sub}</wa-button>
	</div>
</wa-dialog>

<style>
	/* As wide as its options read comfortably, as tall as the window, and the
	   page dimmed behind it. */
	.setup {
		--width: min(calc(100vw - 2rem), 46rem);
		/* No grow-in: before it upgrades, the rule below already draws the
		   dialog's panel in the same place, so the real one should simply
		   replace it. */
		--show-duration: 0ms;

		/* The window's full height, less a margin, whatever is in it: options
		   come and go as the slider moves, and a dialog sized to them grew and
		   shrank around the slider, moving it from under the pointer. Its
		   width stays as it was. */
		&::part(dialog) {
			block-size: calc(100dvh - 2rem);
			max-block-size: calc(100dvh - 2rem);
		}

		&::part(body) {
			display: flex;
			flex-direction: column;
			gap: 1.25rem;
		}

		/* Nothing to close to until a role has been chosen. */
		&:not(.closable)::part(close-button) {
			display: none;
		}
	}

	/*
	 * Until Web Awesome registers wa-dialog, it is an unknown element and its
	 * contents would render inline, in the page. Drawn here as a panel where
	 * the dialog will be, over a backdrop, so the page is never seen
	 * uncovered. The contents stay hidden for the moment it takes: laid out
	 * unupgraded they would only jump.
	 */
	.setup:not(:defined) {
		position: fixed;
		inset: 1rem 0;
		z-index: 100;
		display: block;
		inline-size: min(calc(100vw - 2rem), 46rem);
		block-size: calc(100dvh - 2rem);
		margin: auto;
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-raised);
		box-shadow: 0 0 0 100vmax var(--wa-color-overlay-modal);

		> * {
			visibility: hidden;
		}
	}

	.disclaimer p {
		margin: 0 0 0.5rem;
	}

	/* At the foot of the dialog while everything fits; once it does not, after
	   the rest, to be scrolled down to. The body is a full-height flex column,
	   so an auto margin takes up whatever room is left, or none. */
	.roles {
		margin-block-start: auto;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: flex-end;

		wa-button {
			flex: 1 1 16rem;

			/* The labels are sentences, and have to wrap on a phone rather than
			   run off the edge of a fixed-height control. */
			&::part(base) {
				block-size: auto;
				min-block-size: var(--wa-form-control-height);
				white-space: normal;
				padding-block: 0.5rem;
			}
		}
	}
</style>
