<script lang="ts">
	/**
	 * A typed answer: one box and a button. Also the interference sum's.
	 *
	 * The answer is read from the form, not from Svelte state: `wa-input` is
	 * form-associated, so its value is in the FormData however it got there.
	 */
	let {
		inputMode,
		previous = null,
		submitLabel = 'Answer',
		onsubmit
	}: {
		inputMode: 'numeric' | 'text';
		previous?: string | null;
		submitLabel?: string;
		onsubmit: (value: string) => void;
	} = $props();

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		onsubmit(String(new FormData(form).get('answer') ?? ''));
	}

	/** Focus the answer box once it exists, without `autofocus` (see AGENTS.md). */
	function focusOnMount(node: HTMLElement) {
		void customElements.whenDefined(node.localName).then(() => {
			requestAnimationFrame(() => node.focus());
		});
	}
</script>

<form class="text-answer" onsubmit={submit}>
	<wa-input
		{@attach focusOnMount}
		name="answer"
		label="Your answer"
		inputmode={inputMode}
		autocomplete="off"
		value={previous ?? ''}
	></wa-input>
	<wa-button type="submit" variant="brand">{submitLabel}</wa-button>
</form>

<style>
	.text-answer {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: stretch;

		wa-button {
			align-self: flex-end;
		}
	}
</style>
