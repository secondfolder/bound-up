<script lang="ts">
	import { currentKeyring } from '$lib/crypto/session.svelte';
	import {
		requestStoragePersistence,
		type StoragePersistenceState,
		storagePersistenceState
	} from '$lib/crypto/storage-persistence.svelte';

	/**
	 * What this browser can keep, and a way to ask it to keep more.
	 *
	 * On the Security page. Two things live here, both about whether this device
	 * will stay signed in:
	 *
	 * - **A browser that can store nothing** (the keystore's `memory` tier). Every
	 *   page load then loses the key and signs the user out, and without this
	 *   there would be no way to tell "my phone keeps signing me out" apart from
	 *   a bug. `fallbackReason` is shown raw, deliberately: nobody can act on it,
	 *   but it is the difference between a support answer and a remote-inspector
	 *   session.
	 * - **The persistent-storage re-ask**, for when the explanation dialog was
	 *   dismissed or the browser said no. Only on a durable tier: with nothing
	 *   stored there is nothing to keep.
	 */
	const keyring = $derived(currentKeyring());

	let storageState = $state<StoragePersistenceState | null>(null);
	let storageRequest = $state<'idle' | 'busy' | 'refused'>('idle');

	$effect(() => {
		if (keyring.status !== 'unlocked' || !keyring.durable) {
			storageState = null;
			return;
		}
		let cancelled = false;
		void storagePersistenceState().then((state) => {
			if (!cancelled) {
				storageState = state;
			}
		});
		return () => {
			cancelled = true;
		};
	});

	async function askToKeepStorage() {
		storageRequest = 'busy';
		// Nothing awaited before `persist()`: Firefox prompts only while this
		// click's user activation is live. See `storage-persistence.svelte.ts`.
		const granted = await requestStoragePersistence();
		storageState = granted ? 'granted' : await storagePersistenceState();
		storageRequest = storageState === 'granted' ? 'idle' : 'refused';
	}
</script>

{#if keyring.status === 'unlocked'}
	{#if keyring.durable}
		<p class="quiet">This browser remembers you between visits.</p>
	{:else}
		<wa-callout variant="warning" data-testid="device-not-durable">
			<wa-icon slot="icon" name="triangle-exclamation" variant="solid"></wa-icon>
			This browser will not remember you between visits, so you will be asked to sign in each time you
			open the app. A private window does this; so do some privacy settings.
			{#if keyring.fallbackReason}
				<br /><small class="reason">What this browser refused: {keyring.fallbackReason}</small>
			{/if}
		</wa-callout>
	{/if}
	{#if storageState === 'not-granted'}
		<div class="storage">
			<p class="quiet">
				Your browser has not agreed to keep what this site stores, so it may clear it — an iPhone does
				after about a week without a visit — and you would have to sign in again.
			</p>
			<wa-button
				appearance="outlined"
				disabled={storageRequest === 'busy'}
				onclick={askToKeepStorage}
			>
				Ask the browser to keep it
			</wa-button>
			{#if storageRequest === 'refused'}
				<p class="quiet" role="status">
					Your browser said no. Safari generally only agrees once this app is on your Home Screen.
				</p>
			{/if}
		</div>
	{/if}
{:else}
	<!-- A placeholder the height of what it becomes, so the page does not jump
	     while the keystore is read. `locked` looks the same: the app shell is
	     already sending the user to sign in again. -->
	<div class="settling" aria-busy="true" data-testid="device-state-settling">
		<wa-skeleton effect="sheen"></wa-skeleton>
		<span class="visually-hidden">Checking this device…</span>
	</div>
{/if}

<style>
	.quiet {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}

	.reason {
		color: var(--wa-color-text-quiet);
	}

	.storage {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.settling wa-skeleton {
		display: block;
		block-size: 2.5rem;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
