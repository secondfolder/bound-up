<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		deriveAuthSecret,
		deriveMasterKey,
		WEBCRYPTO_UNAVAILABLE,
		webCryptoAvailable
	} from '$lib/crypto/kdf';
	import {
		type PasskeyRegistration,
		recordEnrolment,
		registerPasskey,
		renamePasskey,
		type SealResult,
		sealToPasskey,
		verdictFor,
		verifyPasswordWithServer
	} from '$lib/crypto/passkey-enrolment';
	import { openIdentityWithPassword } from '$lib/crypto/setup';
	import { MASTER_KEY_VERSIONS } from '$lib/encryption';
	import { providerForAaguid } from '$lib/passkey-providers';
	import type { KeyWrapView } from '$lib/types';
	import PasswordField from './PasswordField.svelte';
	import PrfProviderList from './PrfProviderList.svelte';

	/**
	 * Adding a passkey: password first, then the credential, then the seal.
	 *
	 * The whole sequence lives in one component because it is one act from the
	 * user's side, and splitting it across screens was what let the old version
	 * mint a passkey that could sign in but could not read a single message —
	 * with nothing anywhere saying so.
	 *
	 * The password is asked for two reasons at once, and the copy says both:
	 *
	 * 1. **Re-authentication.** The new credential can sign in on its own
	 *    afterwards, so a session someone walked away from should not be enough
	 *    to mint one. Checked on the server (invariant 14), not just here.
	 * 2. **It is the only way to the identity.** Sealing needs the age secret as
	 *    a *string*, and this device's cache holds a non-extractable `CryptoKey`
	 *    that no API turns back into one. Opening a password wrap is the only
	 *    route — with the happy side effect that adding a way in requires
	 *    proving you already have one.
	 *
	 * Ordering matters and is not negotiable: verify, then register, then seal.
	 * Registering first would leave a stray passkey behind every mistyped
	 * password.
	 *
	 * Driven by the parent through `start()`, so the trigger can be an ordinary
	 * button on Security or a secondary action inside the unlock panel.
	 */
	let {
		user,
		recipient,
		wraps,
		hasPassword,
		onDone
	}: {
		/**
		 * Only the email, because only the KDF needs it — the account is settled
		 * by the session cookie on every request this makes.
		 */
		user: { email: string };
		/** Null when the account has no message keys, so there is nothing to seal. */
		recipient: string | null;
		wraps: KeyWrapView[];
		/** False on a passkey-only account: there is no password to ask for. */
		hasPassword: boolean;
		onDone?: (() => void) | undefined;
	} = $props();

	type Stage = 'idle' | 'password' | 'working' | 'name';
	let stage: Stage = $state('idle');
	let busyLabel = $state('');
	let failure = $state<string | null>(null);
	let passwordErrors = $state<string[] | undefined>(undefined);

	let password = $state('');
	/**
	 * The password the caller already collected, if any.
	 *
	 * The unlock panel has one in hand — the user just typed it to unlock — so
	 * asking again would be asking the same question twice on one screen. It
	 * costs a second PBKDF2 pass to re-open the identity from it, which is a
	 * fair price on a deliberate setup action and much cheaper than plumbing a
	 * raw identity string through a component boundary.
	 */
	let supplied: string | null = null;

	let registration = $state<PasskeyRegistration | null>(null);
	let seal = $state<SealResult | null>(null);
	let name = $state('');
	/** Set once the password has been accepted, so a later failure does not ask again. */
	let passwordAccepted = false;

	/**
	 * The name box, read directly rather than through an `oninput` handler.
	 *
	 * `<wa-input>`'s editable control lives in a shadow root, and this value is
	 * load-bearing — it is what gets submitted — so it has to come from the
	 * control itself. See the autofill note in AGENTS.md: a value can arrive in
	 * an input without any event this app can see.
	 */
	type WaInput = HTMLElement & { value?: string | null; input?: HTMLInputElement | null };
	let nameHost = $state<WaInput | undefined>(undefined);

	const provider = $derived(registration ? providerForAaguid(registration.aaguid) : null);
	/** True once we know this passkey cannot open messages. Drives the warning. */
	const cannotUnlock = $derived(seal?.kind === 'no-prf');

	/**
	 * Opens the flow. `withPassword` skips the prompt for a caller that has one.
	 *
	 * Exported rather than driven by an `open` prop so the parent keeps its own
	 * trigger and this component owns every state in between.
	 */
	export function start(withPassword?: string) {
		failure = null;
		passwordErrors = undefined;
		registration = null;
		seal = null;
		name = '';
		passwordAccepted = false;
		supplied = withPassword ?? null;

		if (!webCryptoAvailable()) {
			failure = WEBCRYPTO_UNAVAILABLE;
			stage = 'password';
			return;
		}

		// Nothing to ask for on a passkey-only account, and nothing to seal
		// either — an account with no password necessarily has no message keys,
		// because /settings/encryption is the only way to get them and it sets
		// one on the way through.
		if (supplied !== null || !hasPassword) {
			void run(supplied ?? '');
			return;
		}
		stage = 'password';
	}

	function cancel() {
		stage = 'idle';
		password = '';
		onDone?.();
	}

	async function onPasswordSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (password.length === 0) {
			return;
		}
		const entered = password;
		// Never left in the box: on success it is not needed, and on failure
		// leaving it there invites a retry of the same wrong value.
		password = '';
		await run(entered);
	}

	async function run(entered: string) {
		stage = 'working';
		failure = null;
		passwordErrors = undefined;

		try {
			// ── 1. the password, locally then on the server ──────────────────────
			let identity: string | null = null;
			if (hasPassword) {
				busyLabel = 'Checking your password…';

				if (recipient) {
					// A wrong password fails its AES-GCM tag here, on the device, with
					// no round trip — so it is answered instantly and tells a watcher
					// nothing.
					const opened = await openIdentityWithPassword({
						email: user.email,
						password: entered,
						recipient,
						wraps
					});
					if (!opened) {
						return refusePassword();
					}
					({ identity } = opened);
				}

				const master = await deriveMasterKey(entered, user.email, MASTER_KEY_VERSIONS[0]);
				if (!(await verifyPasswordWithServer(await deriveAuthSecret(master)))) {
					return refusePassword();
				}
			}
			passwordAccepted = true;

			// ── 2. the credential ────────────────────────────────────────────────
			busyLabel = 'Waiting for your passkey…';
			registration = await registerPasskey();

			// ── 3. the seal, which is the only honest PRF test ───────────────────
			if (identity) {
				busyLabel = registration.prfEnabled
					? 'Setting up message unlock…'
					: // Tried anyway. Several providers answer "no" at creation and then
						// return PRF output perfectly well — see docs/passkeys.md.
						'Checking whether it can unlock messages…';
				seal = await sealToPasskey({ identity, registration });
			}

			// ── 4. record it, wrap and all ───────────────────────────────────────
			busyLabel = 'Saving…';
			const verdict = verdictFor({ seal, prfEnabled: registration.prfEnabled });
			await recordEnrolment({
				passkeyId: registration.passkeyId,
				...(verdict ? { prfStatus: verdict } : {}),
				...(seal?.kind === 'sealed'
					? { wrap: { params: seal.wrapParams, blob: seal.wrapBlob, label: defaultName() } }
					: {})
			});

			// ── 5. name it, now that the AAGUID is known ─────────────────────────
			name = defaultName();
			stage = 'name';
			await invalidateAll();
		} catch (caught) {
			console.error(caught);
			failure = caught instanceof Error ? caught.message : 'Could not add that passkey';
			// Back to the prompt only when the password is what failed. A cancelled
			// ceremony is not a password problem, and asking for it again would say
			// it was.
			stage = hasPassword && !passwordAccepted ? 'password' : 'idle';
			if (stage === 'idle') {
				registration = null;
				onDone?.();
			}
		} finally {
			busyLabel = '';
		}
	}

	function refusePassword() {
		passwordErrors = ['That password is not right'];
		stage = 'password';
		// A caller that supplied the password cannot have it corrected in a box
		// it does not own, so the prompt takes over from here.
		supplied = null;
	}

	/**
	 * What to call the passkey before the user says otherwise.
	 *
	 * The provider name when the AAGUID resolved — which it does not for Apple,
	 * the most common provider of all, because Apple reports the anonymous
	 * AAGUID under `attestation: "none"`. So there has to be a fallback, and
	 * `navigator.platform` is the same one the old code used.
	 */
	function defaultName(): string {
		return provider?.name ?? `${navigator.platform || 'Device'} — ${new Date().toLocaleDateString()}`;
	}

	async function saveName() {
		// The control inside the shadow root is authoritative; the host's own
		// `value` property is stale after a fill that dispatched nothing.
		const chosen = (nameHost?.input?.value ?? nameHost?.value ?? name).trim();
		const enrolled = registration;
		stage = 'idle';
		registration = null;

		// Always, not only when it differs from the default: `registerPasskey`
		// deliberately registers with no name at all, so without this every
		// passkey would be listed as "Unnamed passkey".
		if (enrolled && chosen) {
			try {
				await renamePasskey(enrolled.passkeyId, chosen);
				await invalidateAll();
			} catch (caught) {
				// Cosmetic: the passkey works, it just keeps a duller label. Worth
				// saying, not worth undoing anything for.
				console.error(caught);
				failure = 'That passkey was added, but could not be renamed.';
			}
		}
		onDone?.();
	}
</script>

{#if stage === 'password'}
	<wa-dialog label="Add a passkey" class="passkey-dialog" open onwa-after-hide={cancel}>
		<form onsubmit={onPasswordSubmit} data-testid="add-passkey-password">
			<p>
				Enter your password to add a passkey. It confirms it is you, and it unlocks the key your
				messages are encrypted with so the new passkey can open them too.
			</p>
			<PasswordField
				bind:value={password}
				field="addPasskeyPassword"
				label="Your password"
				autocomplete="current-password"
				errors={passwordErrors}
			/>
			{#if failure}<p class="invalid">{failure}</p>{/if}
			<div class="actions">
				<!-- disabled is never `x || undefined` — invariant 11. -->
				<wa-button type="submit" variant="brand">Continue</wa-button>
				<!-- svelte-ignore a11y_click_events_have_key_events,a11y_no_static_element_interactions -->
				<wa-button type="button" appearance="plain" onclick={cancel}>Cancel</wa-button>
			</div>
		</form>
	</wa-dialog>
{/if}

{#if stage === 'working'}
	<wa-dialog label="Adding a passkey" class="passkey-dialog" open>
		<p class="busy" role="status">{busyLabel}</p>
	</wa-dialog>
{/if}

{#if stage === 'name'}
	<wa-dialog label="Name this passkey" class="passkey-dialog" open onwa-after-hide={saveName}>
		<div class="named">
			{#if cannotUnlock}
				<wa-callout variant="warning">
					<wa-icon slot="icon" name="triangle-exclamation" variant="solid"></wa-icon>
					<strong>This passkey cannot unlock your messages</strong>
					<p>
						{provider
							? `${provider.name} can store this passkey and sign you in with it, but it did not return the extra key material your encrypted messages need.`
							: 'It can sign you in, but the password manager holding it did not return the extra key material your encrypted messages need.'}
						You can still unlock messages with your password, or save a passkey somewhere that supports
						it.
					</p>
					<PrfProviderList />
				</wa-callout>
			{:else if seal?.kind === 'sealed'}
				<wa-callout variant="success">
					<wa-icon slot="icon" name="lock-open" variant="solid"></wa-icon>
					This passkey can also unlock your messages.
				</wa-callout>
			{:else if seal?.kind === 'failed'}
				<wa-callout variant="neutral">
					<wa-icon slot="icon" name="key" variant="solid"></wa-icon>
					{seal.failure.message} The passkey was still added, and you can set up message unlock for it
					later.
				</wa-callout>
			{:else if !recipient}
				<wa-callout variant="neutral">
					<wa-icon slot="icon" name="key" variant="solid"></wa-icon>
					You can sign in with this passkey now. It will be able to unlock messages once you turn on encrypted
					messages.
				</wa-callout>
			{/if}

			<wa-input bind:this={nameHost} label="Name" value={name} data-field="passkeyName"></wa-input>
			{#if failure}<p class="invalid">{failure}</p>{/if}
			<div class="actions">
				<!-- svelte-ignore a11y_click_events_have_key_events,a11y_no_static_element_interactions -->
				<wa-button variant="brand" onclick={saveName}>Done</wa-button>
			</div>
		</div>
	</wa-dialog>
{/if}

{#if stage === 'idle' && failure}
	<p class="invalid">{failure}</p>
{/if}

<style>
	.passkey-dialog {
		form,
		.named {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
		}

		p {
			margin: 0;
		}

		.busy {
			color: var(--wa-color-text-quiet);
		}

		.actions {
			display: flex;
			gap: 0.5rem;
			align-items: center;
		}
	}

	.invalid {
		color: var(--wa-color-text-danger);
		font-size: 0.875rem;
	}
</style>
