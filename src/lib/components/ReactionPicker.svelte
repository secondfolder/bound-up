<script lang="ts">
	/** The six tapbacks. A closed set, like the thread icons. */
	const REACTIONS = ['❤️', '🔥', '😍', '😮', '😂', '👍'] as const;

	let {
		messageId,
		current,
		react,
		clear
	}: {
		messageId: string;
		/** The viewer's own reaction, if they have one. */
		current: string | null;
		react: (emoji: string) => Promise<void>;
		clear: () => Promise<void>;
	} = $props();

	let open = $state(false);
	let busy = $state(false);

	async function choose(emoji: string) {
		busy = true;
		try {
			// Tapping the one you already chose removes it, which is what every
			// other tapback UI does and what people will try.
			if (emoji === current) {
				await clear();
			} else {
				await react(emoji);
			}
			open = false;
		} finally {
			busy = false;
		}
	}

	const triggerId = $derived(`react-${messageId}`);
</script>

<!--
	The one native button left in the picker, on purpose: it carries
	`aria-expanded`, and `wa-button` does not forward ARIA state to the
	`<button>` inside its shadow root, so a screen reader would lose whether
	the menu is open. `wa-dropdown` would manage that itself, but lays its
	items out as a list rather than as this row of tapbacks.
-->
<button
	id={triggerId}
	type="button"
	class="trigger"
	aria-label={current ? `Change your reaction (${current})` : 'Add a reaction'}
	aria-expanded={open}
	onclick={() => { open = !open; }}
>
	<!-- Always the same smiley, never the chosen emoji: the reaction itself is
	     already shown under the message, so echoing it here duplicated it. An
	     icon rather than the "☺" character it used to be, which drew at about
	     9px in the body font beside the time. -->
	<wa-icon name="face-smile" variant="regular"></wa-icon>
</button>

{#if open}
	<fieldset class="menu" aria-label="Reactions">
		{#each REACTIONS as emoji, index (emoji)}
			<wa-button
				style={`--index: ${index}`}
				type="button"
				appearance="plain"
				pill
				class:chosen={emoji === current}
				disabled={busy}
				onclick={() => choose(emoji)}
			>
				{emoji}
			</wa-button>
		{/each}
	</fieldset>
{/if}

<style>
	/*
	 * Drawn small, so it does not compete with the message, and tapped large.
	 * The glyph is about 16px, but the hit area reaches 44px square through a
	 * pseudo-element, without moving the time beside it or the next message
	 * below. It used to be 14 by 38 pixels, and drawn at 70% opacity on top of
	 * the quiet colour.
	 */
	.trigger {
		position: relative;
		display: inline-grid;
		place-items: center;
		border: none;
		background: none;
		cursor: pointer;
		padding: 0 0.25rem;
		font-size: 1rem;
		line-height: 1;
		color: var(--wa-color-text-quiet);

		&::after {
			content: '';
			position: absolute;
			inset: -0.875rem -0.75rem;
		}

		&:hover,
		&:focus-visible {
			color: var(--wa-color-text-normal);
		}
	}

	.menu {
		/* A fieldset, for its group semantics; none of its default box. */
		margin: 0;
		min-inline-size: 0;
		display: flex;
		gap: 0.125rem;
		padding: 0.25rem;
		border-radius: 1rem;
		background: var(--wa-color-surface-raised, white);
		border: 1px solid var(--wa-color-surface-border);
		box-shadow: 0 2px 8px rgb(0 0 0 / 15%);

		wa-button {
			font-size: 2rem;
			--wa-form-control-height: 1.2em;
			--wa-form-control-padding-inline: 0.125em;

			&.chosen::part(base) {
				background: var(--wa-color-brand-fill-quiet, rgb(0 0 0 / 8%));
			}
		}
	}

	/* The row fans open from the smiley, one emoji a beat after the last, so it
	   reads as coming out of the button rather than appearing beside it. */
	@media (prefers-reduced-motion: no-preference) {
		.menu {
			transform-origin: left center;
			animation: menu-in 160ms ease-out;

			wa-button {
				animation: emoji-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
				animation-delay: calc(var(--index) * 25ms);
			}
		}
	}

	@keyframes menu-in {
		from {
			opacity: 0;
			transform: scale(0.85);
		}
	}

	@keyframes emoji-in {
		from {
			opacity: 0;
			transform: translateY(0.375rem) scale(0.5);
		}
	}
</style>
