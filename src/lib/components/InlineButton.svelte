<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A small outlined button that sits inside a line of text, like a word
	 * that does something: the rich-text "Show" after a link, the "Share" in
	 * the Home Screen hint.
	 *
	 * Sized in `em` and `lh` so it matches whatever text it is sitting in — a
	 * message bubble and a task description have different type scales — and
	 * drawn in the text's own colour rather than the button's neutral palette,
	 * so it reads the same in either side's bubble.
	 *
	 * Space around it is the caller's: set `--inline-button-margin` where the
	 * markup has no whitespace to give it some.
	 */
	let {
		class: className = '',
		disabled = false,
		loading = false,
		onclick,
		children
	}: {
		class?: string;
		disabled?: boolean;
		/**
		 * Swapped in by hand rather than through `wa-button`'s `loading`:
		 * Svelte's SSR does not know to omit a false `loading`, and Lit reads
		 * `loading="false"` as true. Same reason as UrlEmbed's refresh button.
		 */
		loading?: boolean;
		onclick: () => void;
		children: Snippet;
	} = $props();
</script>

<wa-button
	type="button"
	class="inline-button {className}"
	size="s"
	appearance="outlined"
	pill
	{disabled}
	{onclick}
	>{#if loading}<wa-spinner slot="end"></wa-spinner>{/if}{@render children()}</wa-button
>

<style>
	.inline-button {
		--wa-form-control-height: 1lh;
		--wa-form-control-padding-inline: 0.7em;
		font-size: 0.9em;
		margin-inline: var(--inline-button-margin, 0);
		color: inherit;

		wa-spinner {
			font-size: 0.9em;
			position: absolute;
			left: 50%;
			translate: -50%;
			margin-inline-start: 0em;
		}

		&::part(base) {
			border-color: currentColor;
			background: transparent;
			color: inherit;
			vertical-align: 0.75ex;
			position: relative;
		}
	}
</style>
