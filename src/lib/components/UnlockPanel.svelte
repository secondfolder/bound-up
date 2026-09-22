<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		describePasskeyFailure,
		passkeysAvailable,
		type PasskeyFailure
	} from '$lib/crypto/passkey';
	import { unlockMode } from '$lib/passkey-unlock';
	import { providerForAaguid } from '$lib/passkey-providers';
	import { MIN_PASSWORD_LENGTH } from '$lib/password-strength';
	import PasswordField from './PasswordField.svelte';
	import PrfProviderList from './PrfProviderList.svelte';

	/**
	 * The one unlock form.
	 *
	 * Every screen that can be reached while the message key is locked renders
	 * this: the app shell's callout, the messaging board, a thread, and
	 * `/settings/encryption`. It replaced four call sites that had already drifted
	 * apart — two of them passed no `passkeyUnlock` at all, so passkey unlock
	 * silently did not exist on the messaging screens, which are where a locked
	 * device is most likely to be discovered.
	 *
	 * Not an error state. It is reached on a new device, after signing in with a
	 * passkey, and whenever the browser has evicted its storage — iOS drops
	 * IndexedDB after about a week of not opening the app — so a regular user
	 * sees it regularly.
	 *
	 * What it offers is decided by `unlockMode`, which is pure and tested
	 * separately. Everything that touches WebCrypto, IndexedDB or WebAuthn is
	 * injected, so the component tests can drive it without a real keyring or
	 * authenticator.
	 */
	let {
		unlock,
		passkeyUnlock = null,
		setUpPasskey = null,
		passkeyCount = 0,
		passkeysKnownUnusable = 0,
		unusableProviderAaguid = null,
		wrongPassword = false,
		willRepeat = false,
		busyLabel = 'Unlocking…',
		submitLabel = 'Unlock messages'
	}: {
		unlock: (password: string) => Promise<void>;
		/** Offered first when the account has a passkey wrap. Null when it has none. */
		passkeyUnlock?: (() => Promise<void>) | null;
		/**
		 * Runs after a successful password unlock, to register a passkey and seal
		 * the identity to it.
		 *
		 * Why it needs the password rather than offering a passkey button: the
		 * device is locked, so there is no identity in hand to seal to anything,
		 * and with no wrap there is nothing for a passkey to open. Selecting this
		 * therefore unlocks first and creates the credential second.
		 */
		setUpPasskey?: ((password: string) => Promise<void>) | null;
		passkeyCount?: number;
		passkeysKnownUnusable?: number;
		/** The AAGUID of a passkey that failed, so the message can name it. */
		unusableProviderAaguid?: string | null;
		wrongPassword?: boolean;
		/** This browser cannot store the key, so this prompt will be back. */
		willRepeat?: boolean;
		busyLabel?: string;
		submitLabel?: string;
	} = $props();

	const settingsHref = resolve('/(auth-required)/(app)/settings/encryption');
	const securityHref = resolve('/(auth-required)/(app)/settings/security');

	const mode = $derived(
		unlockMode({
			hasPasskeyWrap: passkeyUnlock !== null,
			passkeyCount,
			passkeysKnownUnusable,
			passkeysAvailable: passkeysAvailable()
		})
	);
	const provider = $derived(providerForAaguid(unusableProviderAaguid));

	let password = $state('');
	let busy = $state(false);
	let failed = $state(false);
	let passkeyBusy = $state(false);
	let passkeyFailure = $state<PasskeyFailure | null>(null);
	/**
	 * Whether the password box is on screen in `passkey-ready`.
	 *
	 * Hidden behind a button there, and only there. Someone who set up a passkey
	 * did so to stop typing their password, and putting the box in front of them
	 * every time undoes the thing they asked for — but it has to stay one click
	 * away, because a passkey can be on a phone that is in another room.
	 */
	let passwordRevealed = $state(false);
	const showPassword = $derived(mode !== 'passkey-ready' || passwordRevealed);

	async function onPasskey() {
		if (!passkeyUnlock || passkeyBusy) return;
		passkeyFailure = null;
		passkeyBusy = true;
		try {
			await passkeyUnlock();
		} catch (error) {
			// Always says something. A dismissal and a device with no usable
			// passkey are the same error, so staying quiet about the first leaves
			// the second looking like a button that does nothing.
			passkeyFailure = describePasskeyFailure(error);
		} finally {
			passkeyBusy = false;
		}
	}

	async function submit(alsoSetUpPasskey: boolean) {
		if (busy || password.length === 0) return;
		failed = false;
		busy = true;
		const entered = password;
		try {
			await unlock(entered);
			// Only after the unlock worked. Registering a passkey off the back of a
			// password that turned out to be wrong would leave a credential behind
			// that can never open anything.
			if (alsoSetUpPasskey && setUpPasskey) await setUpPasskey(entered);
		} finally {
			busy = false;
			// Cleared whether it worked or not: on success it is not needed, and on
			// failure leaving it in the box invites a retry of the same wrong value.
			password = '';
		}
	}

	function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		void submit(false);
	}

	const showError = $derived(wrongPassword || failed);
</script>

<form onsubmit={onSubmit} data-unlock-mode={mode}>
	{#if mode === 'passkey-ready'}
		<!-- svelte-ignore a11y_click_events_have_key_events,a11y_no_static_element_interactions -->
		<wa-button type="button" variant="brand" onclick={onPasskey} disabled={passkeyBusy}>
			{passkeyBusy ? 'Waiting for your passkey…' : 'Unlock with a passkey'}
		</wa-button>
		{#if passkeyFailure}
			<span class={passkeyFailure.kind === 'no-assertion' ? 'note' : 'invalid'}>
				{passkeyFailure.message}
			</span>
		{/if}
		{#if !passwordRevealed}
			<!-- svelte-ignore a11y_click_events_have_key_events,a11y_no_static_element_interactions -->
			<wa-button type="button" appearance="plain" onclick={() => (passwordRevealed = true)}>
				Use your password instead
			</wa-button>
		{:else}
			<p class="divider">or use your password</p>
		{/if}
	{/if}

	{#if mode === 'passkeys-unusable'}
		<!--
			Said rather than implied. Someone who set up a passkey and is then
			asked for a password with no explanation concludes the app is broken;
			the actual cause is their password manager, which they can only act on
			if they are told.
		-->
		<wa-callout variant="neutral" class="unusable">
			<wa-icon slot="icon" name="key" variant="solid"></wa-icon>
			<strong>Your passkey cannot unlock your messages</strong>
			<p>
				{provider
					? `${provider.name} can sign you in, but it does not return the extra key material encrypted messages need.`
					: 'It signs you in, but the password manager holding it does not return the extra key material encrypted messages need.'}
				Use your password here, or
				<a href={securityHref}>add a passkey</a> somewhere that supports it.
			</p>
			<PrfProviderList />
		</wa-callout>
	{/if}

	{#if showPassword}
		<PasswordField
			bind:value={password}
			field="unlockPassword"
			label="Your password"
			autocomplete="current-password"
			errors={showError ? ['That password did not unlock your messages'] : undefined}
		/>
		<!-- disabled={busy}, never `busy || undefined` — invariant 11. -->
		<wa-button type="submit" variant="brand" disabled={busy}>
			{busy ? busyLabel : submitLabel}
		</wa-button>
	{/if}

	{#if mode === 'offer-setup' && setUpPasskey}
		<!-- svelte-ignore a11y_click_events_have_key_events,a11y_no_static_element_interactions -->
		<wa-button
			type="button"
			appearance="outlined"
			disabled={busy}
			onclick={() => void submit(true)}
		>
			{passkeyCount > 0 ? 'Unlock and use my passkey next time' : 'Unlock and set up a passkey'}
		</wa-button>
		<p class="note">
			{passkeyCount > 0
				? 'Your password is still needed once here, because a locked device has nothing for a passkey to open yet.'
				: 'Your password is still needed once here. After that, Face ID or a fingerprint is enough.'}
		</p>
	{/if}

	{#if willRepeat}
		<!-- Said before the unlock and not after it: this is the one moment the
		     user is deciding whether to bother, and being surprised by the same
		     prompt tomorrow is what made this feel broken rather than limited. -->
		<p class="note">
			This browser will not remember your key, so you will be asked again each time you open the
			app. <a href={settingsHref}>Encryption settings</a> says why.
		</p>
	{/if}
	{#if showPassword}
		<p class="note">
			This is the password you signed up with. It is checked on this device, not sent anywhere — if
			it is wrong you will be told instantly. Needs at least {MIN_PASSWORD_LENGTH} characters.
		</p>
	{/if}
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;

		.note {
			margin: 0;
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}

		.invalid {
			color: var(--wa-color-text-danger);
			font-size: 0.8125rem;
		}

		.divider {
			margin: 0;
			text-align: center;
			color: var(--wa-color-text-quiet);
			font-size: 0.875em;
		}

		.unusable {
			strong {
				display: block;
			}

			p {
				margin: 0.25rem 0 0.5rem;
				font-size: 0.875rem;
			}
		}
	}
</style>
