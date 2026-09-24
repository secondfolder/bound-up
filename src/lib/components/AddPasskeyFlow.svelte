<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { WEBCRYPTO_UNAVAILABLE, webCryptoAvailable } from '$lib/crypto/kdf';
	import { describePasskeyFailure } from '$lib/crypto/passkey';
	import {
		type RegisteredPasskey,
		registerPasskey,
		renamePasskey
	} from '$lib/crypto/passkey-ceremony';
	import { openIdentityWithPassword } from '$lib/crypto/setup';
	import { providerForAaguid } from '$lib/passkey-providers';
	import type { KeyWrapView } from '$lib/types';
	import PasswordField from './PasswordField.svelte';

	/**
	 * Adding a passkey: the password, then the credential, then a name.
	 *
	 * One component because it is one act from the user's side. The new passkey
	 * both signs in and opens the user's messages — every passkey does, because
	 * `registerPasskey` seals the identity to it as it is created (PRF where the
	 * provider can, the user handle where it cannot).
	 *
	 * The password is asked for because it is **the only way to the identity**.
	 * Sealing needs the age secret as a string, and this device's cache holds a
	 * non-extractable `CryptoKey` that no API turns back into one; opening the
	 * password wrap is the only route. That is also the password check: a wrong
	 * one fails the wrap's AES-GCM tag here, on the device, instantly and without
	 * telling a watcher anything. It is a check on the device, not a permission
	 * — the server lets any signed-in session register a passkey, as it always
	 * did, and nothing here pretends otherwise.
	 *
	 * Ordering is not negotiable: open the identity, then register. Registering
	 * first would leave a stray passkey behind every mistyped password.
	 *
	 * Driven by the parent through `start()`, so the trigger stays an ordinary
	 * button on the Security page.
	 */
	let {
		user,
		recipient,
		wraps,
		onDone
	}: {
		/** Only the email, because only the KDF needs it. */
		user: { email: string };
		recipient: string;
		wraps: KeyWrapView[];
		onDone?: (() => void) | undefined;
	} = $props();

	type Stage = 'idle' | 'password' | 'working' | 'name';

	/** What the working dialog says at each step of `registerPasskey`. */
	const STEP_LABELS = {
		creating: 'Waiting for your passkey…',
		// A second touch on providers that cannot answer PRF while the passkey is
		// being created. See `evaluatePrf` in `passkey-ceremony.ts`.
		checking: 'Touch your passkey once more to finish…',
		saving: 'Saving…'
	} as const;
	let stage: Stage = $state('idle');
	let busyLabel = $state('');
	let failure = $state<string | null>(null);
	let passwordErrors = $state<string[] | undefined>(undefined);

	let password = $state('');
	let registered = $state<RegisteredPasskey | null>(null);
	let name = $state('');

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

	const provider = $derived(registered ? providerForAaguid(registered.aaguid) : null);

	/**
	 * Opens the flow. Exported rather than driven by an `open` prop so the
	 * parent keeps its own trigger and this component owns every state in
	 * between.
	 */
	export function start() {
		failure = null;
		passwordErrors = undefined;
		registered = null;
		name = '';
		stage = 'password';
		if (!webCryptoAvailable()) {
			failure = WEBCRYPTO_UNAVAILABLE;
		}
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

		busyLabel = 'Checking your password…';
		const opened = await openIdentityWithPassword({
			email: user.email,
			password: entered,
			recipient,
			wraps
		}).catch((error: unknown) => {
			console.error(error);
			return null;
		});
		if (!opened) {
			passwordErrors = ['That password is not right'];
			stage = 'password';
			return;
		}

		try {
			busyLabel = 'Waiting for your passkey…';
			registered = await registerPasskey({
				identity: opened.identity,
				recipient,
				onStep: (step) => {
					busyLabel = STEP_LABELS[step];
				}
			});
			name = defaultName();
			stage = 'name';
			await invalidateAll();
		} catch (caught) {
			console.error(caught);
			failure = describePasskeyFailure(caught).message;
			stage = 'idle';
			registered = null;
			onDone?.();
		} finally {
			busyLabel = '';
		}
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
		const enrolled = registered;
		stage = 'idle';
		registered = null;

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
			<p>Enter your password to add a passkey.</p>
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
			<p>You can sign in with this passkey now.</p>
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
