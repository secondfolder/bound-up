<script lang="ts">
	import { kinkListContext } from '$lib/kink-list/context';
	import InlineButton from '../InlineButton.svelte';

	/**
	 * Whether the list is saved, and a retry when it is not.
	 *
	 * Also what keeps something typed from being lost: while the store holds
	 * changes it has not saved, leaving the page asks first. Answers save a
	 * moment after each change, so this is a note typed and the tab closed
	 * straight away, or a save that failed.
	 */
	const { store } = kinkListContext();

	$effect(() => {
		if (!store.unsaved) {
			return;
		}
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});

	const text = $derived.by(() => {
		if (store.save.status === 'failed') {
			return store.save.error ?? 'Not saved.';
		}
		if (store.unsaved || store.save.status === 'saving') {
			return 'Saving…';
		}
		// Not "Saved on this device" for a list without an account: the banner
		// under the title already says so, and the two said it twice in a row.
		return 'Saved';
	});
</script>

<p class="status" class:failed={store.save.status === 'failed'} role="status">
	{text}
	{#if store.save.status === 'failed'}
		<InlineButton onclick={() => void store.flush()}>Try again</InlineButton>
	{/if}
</p>

<style>
	.status {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);

		&.failed {
			color: var(--wa-color-danger-on-quiet);
		}
	}
</style>
