<script lang="ts">
	import {
		currentKeyring,
		passkeyWrapFor,
		unlockWithPasskey,
		unlockWithPassword
	} from '$lib/crypto/session.svelte';
	import AddPasskeyFlow from './AddPasskeyFlow.svelte';
	import UnlockPanel from './UnlockPanel.svelte';
	import type { Snippet } from 'svelte';
	import type { KeyWrapView } from '$lib/types';

	/**
	 * `UnlockPanel` wired to the real keyring, in one place.
	 *
	 * The panel itself takes injected callbacks so it can be tested without a
	 * real keyring or authenticator. This is the other half: the wiring every
	 * caller would otherwise repeat.
	 *
	 * That repetition is not hypothetical. Before this, four screens each built
	 * their own — and the messaging board's copy passed no `passkeyUnlock` at
	 * all, so the one screen a locked device is most likely to be discovered on
	 * was the one screen that would not offer a passkey. Callers now supply
	 * their own chrome and nothing else.
	 *
	 * Renders nothing unless the keyring is locked, so a caller can drop it in
	 * without repeating that check either.
	 */
	let {
		user,
		hasPassword = true,
		busyLabel = 'Unlocking…',
		submitLabel = 'Unlock messages',
		chrome = undefined,
		onFlowOpen = undefined
	}: {
		user: { id: string; email: string };
		/**
		 * Whether the account has a password credential at all.
		 *
		 * Defaults to true because every screen that can show a *locked* keyring
		 * has one by construction: a locked keyring means message keys exist, and
		 * the only way to get those is through a screen that sets a password.
		 * Passed explicitly where the page already knows.
		 */
		hasPassword?: boolean;
		busyLabel?: string;
		submitLabel?: string;
		/**
		 * The callout, section or heading to wrap the panel in while locked.
		 *
		 * A snippet rather than the caller wrapping `<MessageUnlock>` in its own
		 * `{#if locked}`, and that is load-bearing: unlocking flips the keyring,
		 * which would unmount this component — and `AddPasskeyFlow` with it —
		 * while "unlock, then set up a passkey" is still half way through. The
		 * flow's dialogs would vanish mid-ceremony. Keeping the mount here and
		 * the chrome in a snippet means only the chrome comes and goes.
		 */
		chrome?: Snippet<[Snippet]>;
		/**
		 * Called with `true` while the add-a-passkey dialogs are open.
		 *
		 * For a caller that swaps this whole screen out once the keyring
		 * unlocks — the messaging board and a thread both do — because "unlock,
		 * then set up a passkey" finishes *after* the unlock, and unmounting
		 * this component would take the ceremony's dialogs with it.
		 */
		onFlowOpen?: ((open: boolean) => void) | undefined;
	} = $props();

	const keyring = $derived(currentKeyring());
	const passkeyWrap = $derived(passkeyWrapFor(keyring));
	let addPasskey = $state<AddPasskeyFlow | undefined>(undefined);

	/**
	 * What the keyring said while it was still locked.
	 *
	 * Unlocking *clears* `recipient` and `wraps` from the keyring, and the
	 * "unlock and set up a passkey" path needs both a moment afterwards — the
	 * passkey flow opens the identity from a password wrap, which by then is no
	 * longer anywhere in the reactive state.
	 */
	let snapshot = $state<{ recipient: string; wraps: KeyWrapView[] } | null>(null);
	$effect(() => {
		if (keyring.status === 'locked') {
			snapshot = { recipient: keyring.recipient, wraps: keyring.wraps };
		}
	});

	async function onUnlock(password: string) {
		await unlockWithPassword(user, password);
	}

	async function onPasskeyUnlock() {
		if (!passkeyWrap) return;
		await unlockWithPasskey(user, passkeyWrap);
	}

	async function onSetUpPasskey(password: string) {
		// Reached only after a password unlock that worked — the panel guarantees
		// the ordering, because a passkey sealed off a wrong password would open
		// nothing and would look like it had.
		onFlowOpen?.(true);
		addPasskey?.start(password);
	}
</script>

{#if snapshot}
	<AddPasskeyFlow
		bind:this={addPasskey}
		{user}
		recipient={snapshot.recipient}
		wraps={snapshot.wraps}
		{hasPassword}
		onDone={() => onFlowOpen?.(false)}
	/>
{/if}

{#snippet panel()}
	{#if keyring.status === 'locked'}
		<UnlockPanel
			unlock={onUnlock}
			passkeyUnlock={passkeyWrap ? onPasskeyUnlock : null}
			setUpPasskey={onSetUpPasskey}
			passkeyCount={keyring.passkeyCount}
			passkeysKnownUnusable={keyring.passkeysKnownUnusable}
			unusableProviderAaguid={keyring.unusableProviderAaguid}
			wrongPassword={keyring.reason === 'wrong-password'}
			willRepeat={keyring.tier === 'memory'}
			{busyLabel}
			{submitLabel}
		/>
	{/if}
{/snippet}

{#if keyring.status === 'locked' && chrome}
	{@render chrome(panel)}
{:else}
	{@render panel()}
{/if}
