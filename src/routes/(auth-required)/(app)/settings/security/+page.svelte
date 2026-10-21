<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AddPasskeyFlow from '$lib/components/AddPasskeyFlow.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import PasswordField from '$lib/components/PasswordField.svelte';
	import SavedNote from '$lib/components/SavedNote.svelte';
	import ThisDevice from '$lib/components/ThisDevice.svelte';
	import { WEBCRYPTO_UNAVAILABLE, webCryptoAvailable } from '$lib/crypto/kdf';
	import { buildPasswordChange } from '$lib/crypto/setup';
	import { MIN_PASSWORD_LENGTH, scorePassword } from '$lib/password-strength';
	import { NETWORK_FAILURE, tryFetch } from '$lib/request-failure.svelte';
	import { superForm } from '$lib/superform';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = resolve('/(auth-required)/(app)/settings');
	let ready = $state(false);

	const user = $derived(page.data.user as { id: string; email: string });
	const wraps = $derived(data.bundle.wraps);

	// Matches the login/signup readiness marker. Without it, a fast fill can land
	// before `use:changeForm.enhance`, and hydration then writes the empty local
	// password state back over what the DOM briefly held.
	onMount(() => {
		ready = true;
	});

	let busy = $state(false);
	let message: string | null = $state(null);

	let oldPassword = $state('');
	let newPassword = $state('');
	let newConfirm = $state('');
	let changeError: string[] | undefined = $state(undefined);
	let changeConfirmError: string[] | undefined = $state(undefined);

	let addPasskeyFlow = $state<AddPasskeyFlow | undefined>(undefined);

	/**
	 * The passkeys the page opened with. One that is not among them was added
	 * here, and slides in so the person sees where it went; the ones already
	 * there do not animate on every visit. Captured once on purpose.
	 */
	// svelte-ignore state_referenced_locally
	const passkeysOnArrival = new Set(data.passkeys.map((passkey) => passkey.id));

	/**
	 * Solid only once the form could go through (AGENTS.md's save-button rule),
	 * by the same checks `onSubmit` makes on the device. An empty form is not a
	 * call to act. The current password can only be checked by trying it.
	 */
	const canChange = $derived(
		oldPassword.length > 0 && scorePassword(newPassword).acceptable && newPassword === newConfirm
	);
	// From a change that went through until the next keystroke.
	let passwordChanged = $state(false);
	$effect(() => {
		if (oldPassword || newPassword || newConfirm) {
			passwordChanged = false;
		}
	});

	/**
	 * Opens the add-passkey flow, which asks for the password first — the only
	 * way to the identity the new passkey is sealed to. See `AddPasskeyFlow`.
	 */
	function addPasskey() {
		message = null;
		addPasskeyFlow?.start();
	}

	/**
	 * Removes a passkey and the wrap sealed to it, together — through the app's
	 * own endpoint rather than Better Auth's, which knows nothing about wraps
	 * and would leave this one in every bundle.
	 */
	async function remove(id: string) {
		const response = await tryFetch(`/api/keys/passkey/${encodeURIComponent(id)}`, {
			method: 'DELETE'
		});
		if (!response?.ok) {
			message = response ? 'Could not remove passkey' : NETWORK_FAILURE;
			return;
		}
		await invalidateAll();
	}

	// svelte-ignore state_referenced_locally
	// Captures the load's initial `data.changeForm` on purpose: `superForm`
	// registers its lifecycle once, and re-running it on every `invalidate()`
	// would reset the form. `resetForm: false` keeps a failed submit populated.
	const changeForm = superForm(data.changeForm, {
		id: 'change',
		resetForm: false,
		async onSubmit({ formData, cancel }) {
			changeError = undefined;
			changeConfirmError = undefined;

			if (!webCryptoAvailable()) {
				cancel();
				changeError = [WEBCRYPTO_UNAVAILABLE];
				return;
			}

			const strength = scorePassword(newPassword);
			if (!strength.acceptable) {
				cancel();
				changeConfirmError = [strength.hint ?? `Use at least ${MIN_PASSWORD_LENGTH} characters`];
				return;
			}
			if (newPassword !== newConfirm) {
				cancel();
				changeConfirmError = ["Passwords don't match"];
				return;
			}

			try {
				const built = await buildPasswordChange({
					email: user.email,
					oldPassword,
					newPassword,
					recipient: data.bundle.recipient,
					wraps
				}).catch((error) => {
					console.error(error);
					return null;
				});

				// Checked on the device, by opening the stored wrap with it — a wrong
				// current password fails before anything is sent.
				if (!built) {
					cancel();
					changeError = ['That password is not right'];
					return;
				}

				formData.set('currentAuthSecret', built.currentAuthSecret);
				formData.set('newAuthSecret', built.newAuthSecret);
				formData.set('wrapParams', built.wrapParams);
				formData.set('wrapBlob', built.wrapBlob);
			} catch (error) {
				console.error(error);
				cancel();
				changeError = ['Your browser could not prepare the password change'];
			}
		},
		async onUpdated({ form }) {
			if (!form.valid) {
				return;
			}
			oldPassword = '';
			newPassword = '';
			newConfirm = '';
			passwordChanged = true;
			await invalidateAll();
		}
	});
	const changeErrors = changeForm.errors;
</script>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to settings"
		backText="Settings"
		title="Security"
		description="Your passkeys, your password, and this device."
	/>

	<div class="content">
		<!-- One group per subject, each with its own small gaps, so a heading
		     sits with what it heads. As a flat run of siblings, a heading's own
		     bottom margin plus the column's gap put it nearer the section above
		     than its own paragraph. -->
		<div class="group">
			<h2>Passkeys</h2>
			<p>
				Passkeys let you sign in with your device instead of a password. A passkey is tied to the
				domain you registered it on.
			</p>

			{#if data.passkeys.length === 0}
				<p class="quiet">You have no passkeys yet.</p>
			{:else}
				<ul class="passkeys">
					{#each data.passkeys as passkey (passkey.id)}
						<li class:arrived={!passkeysOnArrival.has(passkey.id)}>
							<div class="what">
								{passkey.name ?? 'Unnamed passkey'}
								<small>
									{passkey.provider
										? `${passkey.provider.name} · `
										: ''}{passkey.deviceType}{passkey.backedUp ? ' · synced' : ''}
								</small>
							</div>
							<wa-button appearance="plain" onclick={() => remove(passkey.id)}>Remove</wa-button>
						</li>
					{/each}
				</ul>
			{/if}

			<!-- Outlined: adding one is an option, not the thing this page is
			     waiting on. `disabled={busy}`, not `disabled={busy || undefined}`:
			     once Web Awesome upgrades the element Svelte assigns to the
			     `disabled` property, this alpha coerces `undefined` to true and
			     leaves the button permanently disabled. -->
			<wa-button appearance="outlined" onclick={addPasskey} disabled={busy}>
				<wa-icon slot="start" name="plus" variant="solid"></wa-icon>
				Add a passkey
			</wa-button>
			<AddPasskeyFlow
				bind:this={addPasskeyFlow}
				{user}
				recipient={data.bundle.recipient}
				wraps={data.bundle.wraps}
			/>
			{#if message}<p class="invalid">{message}</p>{/if}
		</div>

		<div class="group">
			<h2>Password</h2>
			<p>Change the password you sign in with.</p>
			<form
				method="POST"
				action="?/changePassword"
				use:changeForm.enhance
				data-ready={ready ? 'true' : undefined}
			>
				<PasswordField
					bind:value={oldPassword}
					field="oldPassword"
					label="Current password"
					autocomplete="current-password"
					errors={changeError ?? $changeErrors.currentAuthSecret}
				/>
				<PasswordField
					bind:value={newPassword}
					field="newPassword"
					label="New password"
					autocomplete="new-password"
					strength
				/>
				<PasswordField
					bind:value={newConfirm}
					field="newConfirm"
					label="Confirm new password"
					autocomplete="new-password"
					errors={changeConfirmError}
				/>
				<input type="hidden" name="currentAuthSecret" value="" />
				<input type="hidden" name="newAuthSecret" value="" />
				<input type="hidden" name="wrapParams" value="" />
				<input type="hidden" name="wrapBlob" value="" />
				<div class="actions">
					<wa-button
						type="submit"
						appearance={canChange ? 'accent' : 'outlined'}
						variant={canChange ? 'brand' : undefined}
					>
						Change password
					</wa-button>
					{#if passwordChanged}<SavedNote>Password changed</SavedNote>{/if}
				</div>
				{#if $changeErrors._errors}<span class="invalid">{$changeErrors._errors}</span>{/if}
			</form>
		</div>

		<div class="group">
			<h2>This device</h2>
			<ThisDevice />
		</div>
	</div>
</section>

<style>
	section {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		width: 100%;
		padding-bottom: var(--wa-space-l);

		.content {
			display: flex;
			flex-direction: column;
			padding: var(--wa-space-l) var(--page-gutter);
		}

		.group {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: var(--wa-space-s);
			padding-block: var(--wa-space-l);
			border-top: 1px solid var(--wa-color-surface-border);

			&:first-child {
				padding-top: 0;
				border-top: 0;
			}

			/* Lists, forms and messages take the column; buttons keep their own
			   width (below). */
			> :not(wa-button) {
				align-self: stretch;
			}
		}

		p {
			margin: 0;
		}

		.quiet {
			color: var(--wa-color-text-quiet);
		}

		h2 {
			font-size: var(--wa-font-size-l);
			margin: 0;
		}

		small {
			color: var(--wa-color-text-quiet);
		}

		form {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			margin-top: var(--wa-space-xs);
		}

		.actions {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.75rem;
		}

		/* Full width on a phone, where it is a thumb's target; their own width
		   on anything wider, where a 600px bar shouted. */
		@media (width < 40rem) {
			.group > wa-button {
				align-self: stretch;
			}

			.actions wa-button {
				flex: 1 1 100%;
			}
		}

		.what {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}

		.passkeys {
			padding: 0;
			margin: 0;

			li {
				list-style-type: none;
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 1rem;
				padding: 0.5rem 0;
				border-bottom: 1px solid var(--wa-color-surface-border);

				small {
					display: block;
				}
			}

			@media (prefers-reduced-motion: no-preference) {
				li.arrived {
					animation: passkey-arrived 0.9s ease-out;
				}
			}
		}

		.invalid {
			color: var(--wa-color-text-danger);
		}
	}

	/* A new passkey slides in and its row glows amber for a moment. */
	@keyframes passkey-arrived {
		from {
			opacity: 0;
			translate: 0 -0.5rem;
			background: var(--wa-color-brand-fill-normal);
		}
		40% {
			opacity: 1;
			translate: 0;
		}
	}
</style>
