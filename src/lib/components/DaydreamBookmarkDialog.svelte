<script lang="ts">
	import { DAYDREAM_LIMITS } from '$lib/daydream';
	import type { Quote } from '$lib/sealed-kinds/daydreams';

	/**
	 * Saving a bookmark: a save point on a passage, or a highlighted quote
	 * when some of it was selected. A label is optional; the bookmarks list
	 * shows the quote or the passage's first words without one.
	 */
	let {
		quote,
		onsave,
		onclose
	}: {
		quote: Quote | null;
		onsave: (label: string) => Promise<string | null>;
		onclose: () => void;
	} = $props();

	let label = $state('');
	let problem: string | null = $state(null);
	let saving = $state(false);
	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();

	function field(node: HTMLElement & { value: string }) {
		const update = () => {
			label = node.value;
		};
		node.addEventListener('input', update);
		return () => node.removeEventListener('input', update);
	}

	async function save() {
		saving = true;
		problem = await onsave(label);
		saving = false;
		if (!problem && dialog) {
			dialog.open = false;
		}
	}
</script>

<wa-dialog
	bind:this={dialog}
	label={quote ? 'Keep this quote' : 'Bookmark this passage'}
	open
	onwa-after-hide={(event: Event) => event.target === dialog && onclose()}
>
	{#if quote}<blockquote>{quote.text}</blockquote>{/if}
	<wa-input {@attach field} label="A label (optional)" value={label} maxlength={DAYDREAM_LIMITS.bookmarkLabel}></wa-input>
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
	<wa-button slot="footer" appearance="filled" variant="brand" disabled={saving} onclick={save}>
		Save bookmark
	</wa-button>
</wa-dialog>

<style>
	blockquote {
		margin: 0 0 0.75rem;
		padding-inline-start: 0.75rem;
		border-inline-start: 3px solid var(--wa-color-brand-fill-quiet);
		font-style: italic;
		white-space: pre-wrap;
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
