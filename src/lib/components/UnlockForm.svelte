<script lang="ts">
	import { resolve } from '$app/paths';
	import { describePasskeyFailure } from '$lib/crypto/passkey';
	import { MIN_PASSWORD_LENGTH } from '$lib/password-strength';
	import PasswordField from './PasswordField.svelte';

	/**
	 * Asks for the password so the message identity can be unsealed.
	 *
	 * A normal screen, not an error state. It is reached on a new device, after
	 * signing in with a passkey, and whenever the browser has evicted its
	 * storage — iOS drops IndexedDB after about a week of inactivity, so this is
	 * something a regular user will see regularly.
	 *
	 * `unlock` and `passkeyUnlock` are injected so the component tests can drive
	 * them without WebCrypto, IndexedDB or WebAuthn, none of which jsdom has.
	 */
	let {
		unlock,
		passkeyUnlock = null,
		wrongPassword = false,
		willRepeat = false,
		busyLabel = 'Unlocking…',
		submitLabel = 'Unlock messages'
	}: {
		unlock: (password: string) => Promise<void>;
		/** Offered above the password when the account has a passkey wrap. */
		passkeyUnlock?: (() => Promise<void>) | null;
		wrongPassword?: boolean;
		/** This browser cannot store the key, so this prompt will be back. */
		willRepeat?: boolean;
		busyLabel?: string;
		submitLabel?: string;
	} = $props();

	const settingsHref = resolve('/(auth-required)/(app)/settings/encryption');

	let password = $state('');
	let busy = $state(false);
	let failed = $state(false);
	let passkeyBusy = $state(false);
	let passkeyError: string | null = $state(null);

	async function onPasskey() {
		if (!passkeyUnlock || passkeyBusy) return;
		passkeyError = null;
		passkeyBusy = true;
		try {
			await passkeyUnlock();
		} catch (error) {
			const failure = describePasskeyFailure(error);
			// A dismissed sheet is not worth a red message: they chose to dismiss
			// it, and the password field is right there.
			passkeyError = failure.cancelled ? null : failure.message;
		} finally {
			passkeyBusy = false;
		}
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || password.length === 0) return;
		failed = false;
		busy = true;
		try {
			await unlock(password);
		} finally {
			busy = false;
			// Cleared whether it worked or not: on success it is not needed, and on
			// failure leaving it in the box invites a retry of the same wrong value.
			password = '';
		}
	}

	const showError = $derived(wrongPassword || failed);
</script>

<form onsubmit={onSubmit}>
	{#if passkeyUnlock}
		<!-- svelte-ignore a11y_click_events_have_key_events,a11y_no_static_element_interactions -->
		<wa-button type="button" variant="brand" onclick={onPasskey} disabled={passkeyBusy}>
			{passkeyBusy ? 'Waiting for your passkey…' : 'Unlock with a passkey'}
		</wa-button>
		{#if passkeyError}
			<span class="invalid">{passkeyError}</span>
		{/if}
		<p class="divider">or use your password</p>
	{/if}
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
	{#if willRepeat}
		<!-- Said before the unlock and not after it: this is the one moment the
		     user is deciding whether to bother, and being surprised by the same
		     prompt tomorrow is what made this feel broken rather than limited. -->
		<p class="note">
			This browser will not remember your key, so you will be asked again each time you open the
			app. <a href={settingsHref}>Encryption settings</a> says why.
		</p>
	{/if}
	<p class="note">
		This is the password you signed up with. It is checked on this device, not sent anywhere — if it
		is wrong you will be told instantly. Needs at least {MIN_PASSWORD_LENGTH} characters.
	</p>
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
	}
</style>
