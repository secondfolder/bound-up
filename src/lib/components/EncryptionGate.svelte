<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { currentKeyring, initialiseKeyring, resetKeyring } from '$lib/crypto/session.svelte';
	import MessageUnlock from './MessageUnlock.svelte';
	import PasskeyOffer from './PasskeyOffer.svelte';
	import StoragePersistenceDialog from './StoragePersistenceDialog.svelte';

	/**
	 * Works out whether this device can read the user's messages, once.
	 *
	 * Mounted in the app shell rather than on the messaging pages, because the
	 * answer is needed before the user gets there and because the prompt is
	 * worth showing wherever they happen to be. It is deliberately **not**
	 * blocking: the guides and the partner screens need no keys, so a locked
	 * device is a callout and not a wall. The callouts are only shown once the
	 * user has actual message history to lose or unlock.
	 *
	 * Only the messaging screens themselves refuse to render while locked.
	 */
	let {
		user = null,
		userHasMessageHistory = false,
		handledByPage = false
	}: {
		user?: { id: string; email: string } | null;
		userHasMessageHistory?: boolean;
		handledByPage?: boolean;
	} = $props();
	const keyring = $derived(currentKeyring());

	let lastUserId: string | null = null;

	onMount(() => {
		void refresh();
	});

	$effect(() => {
		// A different account in the same tab must not inherit the previous one's
		// keyring — it would fail to unwrap, but it would fail confusingly.
		if (user?.id !== lastUserId) {
			void refresh();
			return;
		}

		// `unknown` means nobody has worked out where this device stands — the
		// state `lock()` leaves behind. Re-asking here is what makes locking
		// settle on the right panel without a reload; `initialiseKeyring` returns
		// early unless the status is `unknown`, so this cannot loop.
		if (keyring.status === 'unknown') {
			void refresh();
		}
	});

	async function refresh() {
		const current = user;
		lastUserId = current?.id ?? null;
		if (!current) {
			resetKeyring();
			return;
		}
		try {
			await initialiseKeyring(current);
		} catch (error) {
			// A failed bundle fetch leaves the keyring 'unknown', which renders
			// nothing — better than a scary banner for what is usually a dropped
			// connection on a page that does not need keys anyway.
			console.error('could not work out encryption state', error);
		}
	}

	/**
	 * Where the gate keeps quiet.
	 *
	 * The messaging screens render their own locked state, because there the
	 * lock is the whole story rather than an aside. So does
	 * `/settings/encryption` — offering a second unlock form beside that page's
	 * own would put two identical buttons on one screen, which is confusing and
	 * exactly the sort of duplicate accessible name AGENTS.md warns about.
	 */
</script>

<!-- Not gated on `handledByPage`: both follow an unlock rather than replacing
     a locked screen, so there is no duplicate form to avoid. -->
{#if user}
	<PasskeyOffer />
	<StoragePersistenceDialog />
{/if}

<!-- Mounted whenever there is a user, with the callout passed in as chrome
     rather than wrapped around it. Unlocking flips the keyring, and wrapping
     would unmount the whole thing — dialogs included — half way through
     "unlock, then set up a passkey". -->
{#if user && userHasMessageHistory && !handledByPage}
	<MessageUnlock {user}>
		{#snippet chrome(panel)}
			<wa-callout variant="warning" class="gate">
				<wa-icon slot="icon" name="lock" variant="solid"></wa-icon>
				<strong>Your messages are locked on this device</strong>
				<p>Unlock them with your password, or carry on — everything else works without it.</p>
				{@render panel()}
			</wa-callout>
		{/snippet}
	</MessageUnlock>
{/if}

{#if user && userHasMessageHistory && keyring.status === 'absent' && !handledByPage}
	<wa-callout variant="neutral" class="gate">
		<wa-icon slot="icon" name="key" variant="solid"></wa-icon>
		<strong>Private messages are not set up on this account</strong>
		<p>
			<a href={resolve('/(auth-required)/(app)/settings/encryption')}>Set up messaging</a> to send your
			partner something only the two of you can read.
		</p>
	</wa-callout>
{/if}

<style>
	.gate {
		display: block;
		/* Matches the 40rem column the settings pages use. Without it the
		   callout ran the full width of a desktop window, which made a short
		   unlock form look like a page-wide error banner. */
		max-width: 40rem;
		margin: var(--wa-space-m) auto;
		width: calc(100% - 2 * var(--wa-space-m));

		strong {
			display: block;
		}

		p {
			margin: 0.25rem 0 0.75rem;
			color: var(--wa-color-text-quiet);
			font-size: 0.875rem;
		}
	}
</style>
