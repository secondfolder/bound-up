<script lang="ts">
	import { onMount } from 'svelte';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		deriveAuthSecret,
		deriveMasterKey,
		deriveWrapKey,
		WEBCRYPTO_UNAVAILABLE,
		webCryptoAvailable
	} from '$lib/crypto/kdf';
	import { describePasskeyFailure } from '$lib/crypto/passkey';
	import { signInWithPasskey as runPasskeySignIn } from '$lib/crypto/passkey-ceremony';
	import type { PasskeySecrets } from '$lib/crypto/passkey-wraps';
	import { type SignInReason, stashUnlock } from '$lib/crypto/stash';
	import { MASTER_KEY_VERSIONS } from '$lib/encryption';
	import { invalidateAll } from '$lib/navigation';
	import { type LoginFormSchema, loginFormSchema } from '$lib/schemas/loginForm';
	import { takeSignInEmail } from '$lib/sign-in-again';
	import { superForm } from '$lib/superform';
	import AuthBox from './AuthBox.svelte';
	import InputField from './InputField.svelte';
	import PasswordField from './PasswordField.svelte';

	let {
		data,
		redirectTo = null,
		reason = null
	}: {
		data: SuperValidated<Infer<LoginFormSchema>>;
		redirectTo?: string | null;
		/**
		 * Set when the app sent the user here because this device lost its key.
		 * Changes nothing on screen — it is passed on in the stash, so the storage
		 * explanation can follow the sign-in. See `stash.ts`.
		 */
		reason?: SignInReason | null;
	} = $props();

	/**
	 * Whether the form can actually do anything yet.
	 *
	 * The submit button is a `<wa-button>` and the form's behaviour lives in
	 * `use:superform.enhance`, and until both are live a click either does
	 * nothing at all or posts an empty `authSecret` and comes back with a
	 * message about JavaScript being disabled — when it is enabled, just not
	 * ready. Both are confusing, and the second is actively misleading.
	 *
	 * So the button stays disabled until an effect has run, which only happens
	 * on the client after hydration. `data-ready` on the form is the same fact
	 * for the Playwright suite, which needs something unambiguous to wait on:
	 * the custom element registry is not enough, because the element can be
	 * upgraded before Svelte has attached the form's behaviour.
	 */
	let hydrated = $state(false);
	// onMount rather than $effect: this is "has the client taken over yet",
	// which is not derived from anything, and $effect here trips
	// svelte/prefer-writable-derived for suggesting it should be.
	onMount(() => {
		hydrated = true;
		// Pre-filled when the app sent the user back to sign in, so a password
		// manager or passkey autofill matches the right account straight away.
		const email = takeSignInEmail();
		if (email) {
			superform.form.update((form) => ({ ...form, email }));
		}
	});

	let password = $state('');
	let deriving = $state(false);
	let cryptoError: string | null = $state(null);

	// No `onResult` hook any more: there is no client-side auth store to sync a
	// cookie into. The action's 303 triggers a fresh server load, which is the
	// single source of truth for `user`.
	//
	// IMPORTANT: do not add a `validators` option to this form. Client-side
	// validation runs against `$form`, whose `authSecret` is empty until
	// `onSubmit` fills the FormData — and the password field is deliberately not
	// in `$form` at all. It would reject every submission.
	//
	// svelte-ignore state_referenced_locally
	// Captures the load's initial `data` on purpose: `superForm` registers its
	// lifecycle once, and re-running it on every `invalidate()` would reset the
	// form. The stores it returns are the live connection.
	const superform = superForm(data, {
		/**
		 * The password is turned into a key here, in the browser, and only the
		 * derived value is submitted. This is the whole point of the design: no
		 * plaintext password reaches the server, so none can appear in a request
		 * log, an error report or a captured request.
		 *
		 * Superforms awaits every `onSubmit` handler before `enhance` dispatches,
		 * and `formData` is the object it dispatches — verified against
		 * `sveltekit-superforms/dist/client/superForm.js` (the `await
		 * event(submit)` at the top of its submit handler). That is an
		 * implementation detail rather than a documented contract, so there is an
		 * e2e test asserting the posted body never contains the password; it will
		 * fail loudly if this ever stops working.
		 */
		async onSubmit({ formData, cancel }) {
			// Checked before anything is derived so the message can name the real
			// problem — an insecure page — rather than surfacing as the generic
			// "try a different browser" catch below. Plain http on anything but
			// localhost leaves `crypto.subtle` undefined (see kdf.ts).
			if (!webCryptoAvailable()) {
				cancel();
				cryptoError = WEBCRYPTO_UNAVAILABLE;
				return;
			}
			cryptoError = null;
			deriving = true;
			try {
				const email = String(formData.get('email') ?? '');
				// Derived against the newest parameter set. When a second entry is
				// added to MASTER_KEY_VERSIONS, a 401 here should retry with the
				// older ones before reporting a failure — deliberately not written
				// yet, because with one entry it would be untestable dead code. What
				// matters is already in place: each wrap records the params that
				// produced it, so an upgrade needs no "which KDF does this email
				// use?" endpoint, which would be an account-existence oracle.
				const master = await deriveMasterKey(password, email, MASTER_KEY_VERSIONS[0]);
				formData.set('authSecret', await deriveAuthSecret(master));
				// Handed to EncryptionGate on the next screen: signing in is what
				// unlocks, so this is how the password opens the message key too.
				stashUnlock({
					kind: 'password',
					email,
					wrapKey: await deriveWrapKey(master),
					...(reason ? { reason } : {})
				});
			} catch (error) {
				// Cancel rather than let this throw: superforms turns a thrown
				// onSubmit into an onError 500, which would surface as "Internal
				// Error" for what is really "this browser has no WebCrypto".
				console.error(error);
				cancel();
				cryptoError = 'Your browser could not prepare the sign-in. Try a different browser.';
			} finally {
				deriving = false;
			}
		}
	});
	const { errors, form: formValues, submitting } = superform;

	/**
	 * Whether there is something to log in with, for the Log in button's style:
	 * outlined while there is not, solid once there is (the save-button
	 * convention in AGENTS.md).
	 *
	 * Worked out by hand rather than from superforms' validity, because this
	 * form has no `validators` (see above): `authSecret` is empty until submit,
	 * and the password is never in `$form`. So it is the schema's own email rule
	 * plus a password that is not empty. Style only — the button stays enabled,
	 * so an email a password manager filled without an event Svelte sees (see
	 * AGENTS.md) leaves it outlined rather than unusable.
	 */
	const canSignIn = $derived(
		loginFormSchema.shape.email.safeParse($formValues.email).success && password.length > 0
	);

	let passkeyError: string | null = $state(null);
	/** From a passkey ceremony's answer until the next page: it never submits the form. */
	let finishingPasskey = $state(false);

	/** The box's loading bar: from the press until the next page is up, by either way in. */
	const busy = $derived(deriving || $submitting || finishingPasskey);

	async function afterPasskeySignIn(secrets: PasskeySecrets) {
		// The password path gets `redirectTo` back from the action's 303; the
		// passkey ceremony never touches the server action, so it has to apply
		// the same destination itself or an invite would be dropped here — and
		// the same default, `/today`, rather than the landing page.
		//
		// Read before `invalidateAll()`, not after. Re-running the login load
		// with a session redirects away from this page, which unmounts this
		// component, and a prop read after that is its default: `null`. That
		// sent every passkey sign-in to /today, dropping an invite or the page a
		// cleared browser was sent back from — and only a test that waited for
		// the sign-in to finish, rather than sampling the URL on its way past,
		// could see it.
		const destination = redirectTo ?? resolve('/(auth-required)/(app)/today');
		// Signing in with a passkey unlocks too: the same ceremony returned the
		// secret that opens this passkey's wrap. See `passkey-ceremony.ts`.
		stashUnlock({ kind: 'passkey', ...secrets, ...(reason ? { reason } : {}) });
		finishingPasskey = true;
		try {
			// The ceremony set the session cookie client-side, so server load data
			// is now stale — refetch before navigating.
			await invalidateAll();
			// The navigation-through-resolve plugin wants a resolve() call, but
			// this is a runtime path from a query string, not a known route id —
			// there is nothing to resolve against. It is safe because the server
			// ran it through `safeRedirect` in the load before it reached this prop.
			// biome-ignore lint/plugin: see above — a validated runtime path, not a route id.
			await goto(destination, { invalidateAll: true });
		} finally {
			finishingPasskey = false;
		}
	}

	async function signInWithPasskey() {
		passkeyError = null;
		let secrets: PasskeySecrets;
		try {
			secrets = await runPasskeySignIn();
		} catch (error) {
			passkeyError = describePasskeyFailure(error).message;
			return;
		}
		await afterPasskeySignIn(secrets);
	}

	// Conditional UI: offers passkeys from inside the email field's autofill
	// dropdown. Guarded because not every browser implements it.
	$effect(() => {
		let cancelled = false;
		void (async () => {
			if (typeof PublicKeyCredential === 'undefined') {
				return;
			}
			if (!(await PublicKeyCredential.isConditionalMediationAvailable?.())) {
				return;
			}
			let secrets: PasskeySecrets;
			try {
				secrets = await runPasskeySignIn({ autoFill: true });
			} catch {
				// Autofill is best-effort: an aborted or refused request just means
				// the user signs in another way. Nothing to say about it.
				return;
			}
			if (cancelled) {
				return;
			}
			await afterPasskeySignIn(secrets);
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

<AuthBox {busy} busyLabel="Logging in">
	<form method="POST" use:superform.enhance data-ready={hydrated ? 'true' : null}>
		<noscript>
			<!-- Said before a wasted round trip, not after it. Signing in genuinely
			     cannot work without JavaScript now: the server has nothing to check,
			     because it never receives a password. -->
			<p class="invalid">
				Logging in needs JavaScript. Your password is turned into a key in this browser and never sent
				to the server, so there is nothing for the server to check without it.
			</p>
		</noscript>

		<!-- First, and solid from the start: a passkey is the one-tap way in, needs
		     nothing typed, and unlocks messages in the same touch. `type="button"`
		     so Enter in the password box still submits the password. -->
		<wa-button type="button" variant="brand" onclick={signInWithPasskey}
			>Log in with a passkey</wa-button
		>
		{#if passkeyError}<span class="invalid">{passkeyError}</span>{/if}

		<div class="divider">or</div>

		<InputField
			{superform}
			field="email"
			title="Email"
			type="email"
			autocomplete="username webauthn"
		/>
		<PasswordField
			bind:value={password}
			field="password"
			label="Password"
			autocomplete="current-password"
			errors={$errors.authSecret}
		/>
		<!-- Beside the box it is about, where people look for it, rather than
		     under the submit button behind a divider. For someone who has lost
		     every way in: see docs/account-recovery.md. -->
		<a class="recover" href={resolve('/(public)/login/recover')}>Forgot password?</a>
		<!-- Empty in the HTML and filled by onSubmit. With no JavaScript it posts
		     blank, which the Zod field rejects with a message naming the real cause. -->
		<input type="hidden" name="authSecret" value="" />

		<wa-button
			type="submit"
			variant="brand"
			appearance={canSignIn ? 'accent' : 'outlined'}
			disabled={!hydrated || deriving}>Log in</wa-button
		>
		{#if cryptoError}<span class="invalid">{cryptoError}</span>{/if}
		{#if $errors._errors}<span class="invalid">{$errors._errors}</span>{/if}

	</form>
</AuthBox>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		.invalid {
			color: var(--wa-color-text-danger);
		}

		.recover {
			align-self: flex-end;
			/* Tucked up under the password box it belongs to, inside the form's
			   1rem rhythm. */
			margin-block-start: -0.5rem;
			color: var(--wa-color-text-quiet);
			font-size: 0.875em;
		}

		.divider {
			display: flex;
			align-items: center;
			gap: var(--wa-space-s);
			color: var(--wa-color-text-quiet);
			font-size: 0.875em;

			&::before,
			&::after {
				content: '';
				flex: 1 1 auto;
				border-top: 1px solid var(--wa-color-surface-border);
			}
		}
	}
</style>
