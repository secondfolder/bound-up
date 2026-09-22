<script lang="ts">
	import {
		acceptStorageExplanation,
		dismissStorageExplanation,
		storageExplanationVisible
	} from '$lib/crypto/storage-persistence.svelte';

	/**
	 * Why this site wants persistent storage, shown before the browser is asked.
	 *
	 * Opens after an explicit unlock, never on its own: see
	 * `storage-persistence.svelte.ts` for why the old unprompted request went.
	 * Rendered from the app shell, like `PasskeyOffer`, because that unlock can
	 * happen on any screen.
	 *
	 * Only OK asks. Escape or the close button asks nothing and records nothing,
	 * so the explanation comes back after the next unlock; /settings/encryption
	 * can ask in the meantime.
	 */
	const visible = $derived(storageExplanationVisible());

	function accept() {
		// Not awaited, and nothing awaited before it: Firefox shows its prompt
		// only while this click's user activation is live. What the browser
		// answers changes nothing here — /settings/encryption shows the outcome.
		void acceptStorageExplanation();
	}
</script>

{#if visible}
	<wa-dialog
		label="Keep your messages unlocked here"
		class="storage-dialog"
		open
		onwa-after-hide={dismissStorageExplanation}
	>
		<p>
			Your browser can clear what this site stores on your device — an iPhone does after about a
			week without a visit — and then you have to unlock your messages again.
		</p>
		<p>
			We can ask your browser to keep it. It may ask you to allow that, or it may decide on its own.
		</p>
		<div class="actions">
			<wa-button variant="brand" onclick={accept}>OK</wa-button>
		</div>
	</wa-dialog>
{/if}

<style>
	.storage-dialog {
		p {
			margin: 0 0 0.75rem;
		}

		.actions {
			display: flex;
			justify-content: flex-end;
		}
	}
</style>
