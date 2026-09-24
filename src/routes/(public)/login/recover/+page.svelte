<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import PasswordField from '$lib/components/PasswordField.svelte';
	import SafetyNumber from '$lib/components/SafetyNumber.svelte';
	import { recoveryCode } from '$lib/crypto/fingerprint';
	import { WEBCRYPTO_UNAVAILABLE, webCryptoAvailable } from '$lib/crypto/kdf';
	import { buildIdentitySubmission } from '$lib/crypto/setup';
	import { stashUnlock } from '$lib/crypto/stash';
	import { normaliseEmail } from '$lib/encryption';
	import { MIN_PASSWORD_LENGTH, scorePassword } from '$lib/password-strength';

	/**
	 * Partner-assisted sign-in, from the side of the person who cannot sign in.
	 *
	 * For someone who has lost every way in — no password, no passkey. Their
	 * old key is lost with those, so this makes a new one and a new password, and
	 * asks their partner to vouch for them. The partner compares the code shown
	 * here, re-encrypts the history the two of them share to the new key, and
	 * that lets this page finish. See docs/account-recovery.md.
	 *
	 * Everything is held in this page's memory — the token that authorises the
	 * request, the new key, and the value the new password derives to — and
	 * nothing is stored. Reloading the page starts again, which is the right
	 * trade: the alternative is a login credential in the browser's storage.
	 */

	type Stage =
		| { kind: 'form' }
		| { kind: 'working' }
		| { kind: 'waiting'; code: string }
		| { kind: 'finishing' }
		| { kind: 'ended'; message: string };
	let stage: Stage = $state({ kind: 'form' });

	type WaInput = HTMLElement & { value?: string | null; input?: HTMLInputElement | null };
	let emailHost = $state<WaInput | undefined>(undefined);
	let password = $state('');
	let confirm = $state('');
	let formError: string | null = $state(null);
	let confirmErrors: string[] | undefined = $state(undefined);

	/** What completing needs, kept out of reactive state on purpose. */
	let pending:
		| {
				token: string;
				email: string;
				authSecret: string;
				identity: string;
				recipient: string;
				wrapKey: CryptoKey;
		  }
		| undefined;
	let poll: ReturnType<typeof setInterval> | undefined;

	onDestroy(() => {
		clearInterval(poll);
		pending = undefined;
	});

	async function start(event: SubmitEvent) {
		event.preventDefault();
		formError = null;
		confirmErrors = undefined;

		// The control inside the shadow root is authoritative: a password manager
		// can fill it without any event this component sees. See AGENTS.md.
		const email = normaliseEmail(emailHost?.input?.value ?? emailHost?.value ?? '');
		if (!email.includes('@')) {
			formError = 'Enter the email you signed up with';
			return;
		}
		if (!webCryptoAvailable()) {
			formError = WEBCRYPTO_UNAVAILABLE;
			return;
		}
		const strength = scorePassword(password);
		if (!strength.acceptable) {
			confirmErrors = [strength.hint ?? `Use at least ${MIN_PASSWORD_LENGTH} characters`];
			return;
		}
		if (password !== confirm) {
			confirmErrors = ["Passwords don't match"];
			return;
		}

		stage = { kind: 'working' };
		try {
			const built = await buildIdentitySubmission(email, password);
			const response = await fetch('/api/account-recovery', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					email,
					recipient: built.recipient,
					wrapParams: built.wrapParams,
					wrapBlob: built.wrapBlob
				})
			});
			if (response.status === 429) {
				stage = { kind: 'form' };
				formError = 'Too many requests for this account. Wait an hour and try again.';
				return;
			}
			if (!response.ok) {
				throw new Error(`Could not start (${response.status})`);
			}
			const { token } = (await response.json()) as { token: string };
			pending = {
				token,
				email,
				authSecret: built.authSecret,
				identity: built.identity,
				recipient: built.recipient,
				wrapKey: built.wrapKey
			};
			password = '';
			confirm = '';
			stage = { kind: 'waiting', code: await recoveryCode(built.recipient) };
			poll = setInterval(() => void check(), 4000);
		} catch (error) {
			console.error(error);
			stage = { kind: 'form' };
			formError = 'Something went wrong. Try again.';
		}
	}

	async function check() {
		if (!pending || stage.kind !== 'waiting') {
			return;
		}
		const response = await fetch('/api/account-recovery/status', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: pending.token })
		}).catch(() => null);
		if (!response?.ok) {
			return;
		}
		const { status } = (await response.json()) as { status: string };
		if (status === 'approved') {
			clearInterval(poll);
			await finish();
		} else if (status === 'declined') {
			end('Your partner said the code did not match, so nothing changed. You can try again.');
		} else if (status === 'expired' || status === 'completed') {
			end('This request has expired. You can start again.');
		}
	}

	function end(message: string) {
		clearInterval(poll);
		pending = undefined;
		stage = { kind: 'ended', message };
	}

	async function finish() {
		const current = pending;
		if (!current) {
			return;
		}
		stage = { kind: 'finishing' };
		try {
			const completed = await fetch('/api/account-recovery/complete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: current.token, authSecret: current.authSecret })
			});
			if (!completed.ok) {
				end('This request is no longer open. You can start again.');
				return;
			}

			// An ordinary email sign-in with the new password — its derived value,
			// as always. The identity goes in the stash like signup's does, so the
			// app shell caches it with nothing more to derive.
			const signedIn = await authClient.signIn.email({
				email: current.email,
				password: current.authSecret
			});
			if (signedIn.error) {
				throw new Error(signedIn.error.message ?? 'Could not sign in');
			}
			stashUnlock({
				kind: 'password',
				email: current.email,
				wrapKey: current.wrapKey,
				identity: current.identity,
				recipient: current.recipient
			});
			pending = undefined;
			await invalidateAll();
			await goto(resolve('/(auth-required)/(app)/home'));
		} catch (error) {
			console.error(error);
			end('You are back in, but signing in did not finish. Sign in with your new password.');
		}
	}
</script>

<svelte:head><title>Can't sign in</title></svelte:head>

<section>
	<h1>Can't sign in?</h1>

	{#if stage.kind === 'form' || stage.kind === 'working'}
		<p>
			If you have lost your password and your passkeys, a partner can help you back in. Choose a new
			password, then your partner confirms it is you.
		</p>
		<p class="quiet">
			Your old passkeys will stop working, and any device still signed in will be signed out. You
			can add new passkeys afterwards.
		</p>
		<form onsubmit={start}>
			<wa-input bind:this={emailHost} data-field="recoverEmail" type="email" label="Email" autocomplete="username"
			></wa-input>
			<PasswordField
				bind:value={password}
				field="newPassword"
				label="New password"
				autocomplete="new-password"
				strength
			/>
			<PasswordField
				bind:value={confirm}
				field="confirmPassword"
				label="Confirm new password"
				autocomplete="new-password"
				errors={confirmErrors}
			/>
			{#if formError}<p class="invalid" role="alert">{formError}</p>{/if}
			<wa-button type="submit" variant="brand" disabled={stage.kind === 'working'}>
				{stage.kind === 'working' ? 'Setting up…' : 'Ask my partner'}
			</wa-button>
		</form>
	{:else if stage.kind === 'waiting'}
		<p>
			Now ask your partner to open Bound Up. They will be asked to help you, and shown a code.
		</p>
		<SafetyNumber
			value={stage.code}
			partnerName="your partner"
			instructions="Read this to your partner in person or over a call — not in this app. When it matches theirs and they confirm, you will be signed in here."
		/>
		<p class="quiet" role="status">Waiting for your partner… Keep this page open.</p>
	{:else if stage.kind === 'finishing'}
		<p role="status">Your partner confirmed it is you. Signing you in…</p>
	{:else}
		<p role="status">{stage.message}</p>
		<wa-button
			appearance="outlined"
			onclick={() => {
				stage = { kind: 'form' };
			}}
		>
			Start again
		</wa-button>
	{/if}

	<a class="back" href={resolve('/(public)/login')}>Back to sign in</a>
</section>

<style>
	section {
		max-width: 26rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
		padding: var(--wa-space-l) 0;

		h1 {
			margin: 0;
			font-size: 1.5rem;
		}

		p {
			margin: 0;
		}

		.quiet {
			color: var(--wa-color-text-quiet);
			font-size: 0.9375rem;
		}

		form {
			display: flex;
			flex-direction: column;
			gap: var(--wa-space-m);
		}

		.invalid {
			color: var(--wa-color-text-danger);
		}

		.back {
			align-self: center;
			color: var(--wa-color-text-quiet);
		}
	}
</style>
