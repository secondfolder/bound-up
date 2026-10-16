<script lang="ts">
	import { DAYDREAM_LIMITS } from '$lib/daydream';
	import type { Quote } from '$lib/sealed-kinds/daydreams';

	/**
	 * "Not this": turns a stretch of a passage into a limit, worded by the
	 * user, so it never comes back. Prefilled from the quote; the line is
	 * added to the setup's limits, and the passage rewritten without it when
	 * it is the newest (`DaydreamStory.notThis`).
	 */
	let {
		quote,
		onsave,
		onclose
	}: {
		quote: Quote;
		/** Answers why it could not be saved, or null. */
		onsave: (line: string) => Promise<string | null>;
		onclose: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Prefilled once; from then on it is what the user is writing.
	let line = $state(`Avoid: “${quote.text.slice(0, 200)}”`);
	let problem: string | null = $state(null);
	let saving = $state(false);
	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();

	function field(node: HTMLElement & { value: string }) {
		const update = () => {
			line = node.value;
		};
		node.addEventListener('input', update);
		return () => node.removeEventListener('input', update);
	}

	async function save() {
		saving = true;
		problem = await onsave(line.trim());
		saving = false;
		if (!problem && dialog) {
			dialog.open = false;
		}
	}

	const valid = $derived(line.trim().length > 0 && line.length <= DAYDREAM_LIMITS.limits);
</script>

<wa-dialog bind:this={dialog} label="Not this" open onwa-after-hide={(event: Event) => event.target === dialog && onclose()}>
	<p class="hint">This goes into your limits for this daydream, so it won't come back.</p>
	<wa-textarea {@attach field} label="Your limit" value={line} rows={3} resize="auto" maxlength={DAYDREAM_LIMITS.limits}></wa-textarea>
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
	<wa-button
		slot="footer"
		appearance={valid ? 'filled' : 'outlined'}
		variant={valid ? 'brand' : 'neutral'}
		disabled={!valid || saving}
		onclick={save}
	>
		Add to my limits
	</wa-button>
</wa-dialog>

<style>
	.hint {
		margin: 0 0 0.75rem;
		color: var(--wa-color-text-quiet);
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
