<script lang="ts">
	import { DAYDREAM_LIMITS } from '$lib/daydream';
	import type { StarterSide } from '$lib/daydream/starters';

	/**
	 * "Generate": asks for a few story ideas of the kind the user describes,
	 * for the side chosen under "You as". It stays open while they are
	 * written, so a failure is said here, beside what was asked, and closes
	 * once they are in (`DaydreamStarter` shows them).
	 */
	let {
		request: initial,
		side,
		ongenerate,
		onclose
	}: {
		/** The last request, so asking again starts from it. */
		request: string;
		side: StarterSide | null;
		/** Answers why nothing came back, or null. */
		ongenerate: (request: string) => Promise<string | null>;
		onclose: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Prefilled once; from then on it is what the user is writing.
	let request = $state(initial);
	let problem: string | null = $state(null);
	let generating = $state(false);
	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();

	// Listened for directly: Svelte's delegated `oninput` does not cross the
	// textarea's shadow root (AGENTS.md).
	function field(node: HTMLElement & { value: string }) {
		const update = () => {
			request = node.value;
		};
		node.addEventListener('input', update);
		return () => node.removeEventListener('input', update);
	}

	async function generate() {
		generating = true;
		problem = await ongenerate(request.trim());
		generating = false;
		if (!problem && dialog) {
			dialog.open = false;
		}
	}

	const valid = $derived(request.trim() !== '' && request.length <= DAYDREAM_LIMITS.idea);

	const forWhom = $derived(
		side === null ? 'Ideas with you on either side.' : `Ideas with you as the ${side}, from “You as”.`
	);
</script>

<wa-dialog
	bind:this={dialog}
	label="Generate story ideas"
	open
	onwa-after-hide={(event: Event) => event.target === dialog && onclose()}
>
	<p class="hint">{forWhom}</p>
	<wa-textarea
		{@attach field}
		label="What kind of stories?"
		placeholder="Teasing and denial, somewhere I might get caught…"
		value={request}
		rows={3}
		resize="auto"
		maxlength={DAYDREAM_LIMITS.idea}
	></wa-textarea>
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
	<wa-button
		slot="footer"
		appearance={valid ? 'filled' : 'outlined'}
		variant={valid ? 'brand' : 'neutral'}
		disabled={!valid || generating}
		onclick={generate}
	>
		<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
		{generating ? 'Generating…' : 'Generate'}
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
