<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import {
		currentRpId,
		describePasskeyFailure,
		type PasskeyFailure,
		wrapIdentityToPasskey
	} from '$lib/crypto/passkey';
	import {
		currentEnrolmentOffer,
		dismissEnrolmentOffer,
		enrolmentIdentityFor
	} from '$lib/crypto/session.svelte';

	/**
	 * "Use a passkey here next time?", asked once, right after an unlock.
	 *
	 * This is the only moment the offer is free. Sealing the identity to a
	 * passkey needs it as a string, and a device that can store a `CryptoKey`
	 * holds it in a form no API will turn back into one — so an offer made any
	 * later has to ask for the password a second time, which is what
	 * /settings/encryption does for exactly that case.
	 *
	 * Rendered from the app shell rather than a page, because the unlock it
	 * follows can happen anywhere: the gate's own prompt, a thread, or the
	 * moment after signing in on a new phone.
	 *
	 * Posts to the encryption settings action rather than carrying its own
	 * endpoint. Adding a wrap is that page's business, and the action already
	 * validates the shape of one.
	 */
	const offer = $derived(currentEnrolmentOffer());
	let busy = $state(false);
	let failure: PasskeyFailure | null = $state(null);

	const onSubmit: SubmitFunction = async ({ formData, cancel }) => {
		const current = offer;
		const identity = current && enrolmentIdentityFor(current.userId);
		if (!identity || busy) {
			cancel();
			return;
		}

		failure = null;
		busy = true;
		let prepared = false;
		try {
			const rpId = currentRpId();
			formData.set('wrapBlob', await wrapIdentityToPasskey({ identity, rpId }));
			formData.set('wrapParams', JSON.stringify({ type: 'webauthn-prf', version: 1, rpId }));
			formData.set('label', `${navigator.platform || 'Device'} — ${new Date().toLocaleDateString()}`);
			prepared = true;
		} catch (error) {
			cancel();
			// The offer stays up whatever went wrong — the identity is still here
			// and still sealable — but it never fails silently. A passkey that
			// cannot do PRF and a dismissed sheet arrive as different kinds, and
			// only the first is the user's problem to solve.
			failure = describePasskeyFailure(error);
		} finally {
			if (!prepared) {
				busy = false;
			}
		}

		if (!prepared) {
			return;
		}
		return async ({ update, result }) => {
			busy = false;
			// Only on success. A rejected wrap leaves the offer up, because the
			// identity is still here and still sealable until the window closes.
			if (result.type === 'success') {
				dismissEnrolmentOffer();
			} else {
				failure = {
					kind: 'unknown',
					message: 'That passkey could not be saved. Your password still works.'
				};
			}
			await update();
		};
	};
</script>

{#if offer}
	<wa-callout variant="brand" class="offer">
		<wa-icon slot="icon" name="key" variant="solid"></wa-icon>
		<strong>Unlock with a passkey next time?</strong>
		<p>
			Your browser clears its storage every so often — after about a week on an iPhone — and you
			would have to type your password again. A passkey turns that into Face ID or a fingerprint.
		</p>
		<form method="POST" action="/settings/encryption?/addWrap" use:enhance={onSubmit}>
			<input type="hidden" name="wrapParams" value="" />
			<input type="hidden" name="wrapBlob" value="" />
			<input type="hidden" name="label" value="" />
			<wa-button type="submit" variant="brand" size="s" disabled={busy}>
				{busy ? 'Waiting for your passkey…' : 'Set it up'}
			</wa-button>
			<wa-button type="button" appearance="plain" size="s" onclick={() => dismissEnrolmentOffer()}>
				Not now
			</wa-button>
		</form>
		{#if failure}
			<p class={failure.kind === 'no-assertion' ? 'quiet' : 'invalid'}>{failure.message}</p>
		{/if}
	</wa-callout>
{/if}

<style>
	.offer {
		display: block;
		margin: var(--wa-space-m);

		strong {
			display: block;
		}

		p {
			margin: 0.25rem 0 0.75rem;
			color: var(--wa-color-text-quiet);
			font-size: 0.875rem;
		}

		form {
			display: flex;
			gap: 0.5rem;
			align-items: center;
		}

		.invalid,
		.quiet {
			margin: 0.5rem 0 0;
			font-size: 0.8125rem;
		}

		.invalid {
			color: var(--wa-color-text-danger);
		}

		.quiet {
			color: var(--wa-color-text-quiet);
		}
	}
</style>
