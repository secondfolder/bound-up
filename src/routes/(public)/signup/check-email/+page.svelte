<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import AuthBox from '$lib/components/AuthBox.svelte';
	import AuthPage from '$lib/components/AuthPage.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import { RESEND_COOLDOWN_SECONDS, resendAction } from '$lib/email-verification';
	import { resendVerificationFormSchema } from '$lib/schemas/resendVerificationForm';
	import { superForm } from '$lib/superform';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let ready = $state(false);

	/**
	 * When another link may be asked for, as a clock time, and the clock.
	 *
	 * The button waits out a minute after each link — the one sign-up just
	 * sent, and every resend — because the server refuses a second link to one
	 * address within the minute anyway (`VERIFICATION_EMAIL_PER_ADDRESS`), and
	 * a button that is plainly counting down beats one that answers "too many
	 * attempts". A refusal the page did not expect, from another tab say,
	 * resets it to the wait the server gave.
	 */
	let availableAt = $state(0);
	let now = $state(Date.now());
	const secondsLeft = $derived(Math.max(0, Math.ceil((availableAt - now) / 1000)));

	function waitFor(seconds: number) {
		now = Date.now();
		availableAt = now + seconds * 1000;
	}

	onMount(() => {
		// svelte-ignore state_referenced_locally
		// The load's value for this arrival; later waits come from the form.
		waitFor(data.cooldownSeconds);
		ready = true;
	});

	// Ticks only while there is something to count, so an idle page runs no
	// timer at all.
	$effect(() => {
		if (secondsLeft === 0) {
			return;
		}
		const tick = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(tick);
	});

	// svelte-ignore state_referenced_locally
	// Captures the load's initial `data` on purpose: `superForm` registers its
	// lifecycle once, and re-running it on every `invalidate()` would reset the
	// form. `resetForm: false` keeps the address in the box for another try.
	const superform = superForm(data.resendForm, {
		resetForm: false,
		onResult({ result }) {
			if (result.type === 'success') {
				waitFor(RESEND_COOLDOWN_SECONDS);
			} else if (result.type === 'failure' && typeof result.data?.retryAfterSeconds === 'number') {
				waitFor(result.data.retryAfterSeconds);
			}
		}
	});
	const { errors, form, message, submitting } = superform;
	// The save-button convention: solid once there is an address to send to.
	// By hand, as on the login form, because no client validators run here.
	const canResend = $derived(resendVerificationFormSchema.shape.email.safeParse($form.email).success);

	// svelte-ignore state_referenced_locally
	// Static for this render, like `loginHref` below.
	const action = resendAction(data.redirectTo);

	// svelte-ignore state_referenced_locally
	// A static property of this render, like the cross-links on /login and
	// /signup. `redirectTo` was validated by `safeRedirect` in the load.
	const loginHref = data.redirectTo
		? `${resolve('/login')}?redirectTo=${encodeURIComponent(data.redirectTo)}`
		: resolve('/login');
</script>

<svelte:head><title>Check your email</title></svelte:head>

<AuthPage title="Check your email">
	<AuthBox busy={$submitting} busyLabel="Sending a new link">
		<!-- An envelope that bobs twice as the page arrives: the one thing to
		     do next is somewhere else, and this points at it. -->
		<wa-icon class="envelope" name="envelope" variant="solid" aria-hidden="true"></wa-icon>
		<p>
			{#if data.email}
				We've sent a link to <strong>{data.email}</strong>.
			{:else}
				We've sent a link to the address you signed up with.
			{/if}
			Open it to confirm the address is yours, then log in.
		</p>
		<p class="quiet">
			It can take a minute or two to arrive. Not there? Check your Junk or Spam folder. The link works
			for 24 hours.
		</p>

		<form method="POST" {action} use:superform.enhance data-ready={ready ? 'true' : undefined}>
			<InputField {superform} field="email" title="Email" type="email" autocomplete="username" />
			<wa-button
				type="submit"
				variant="brand"
				appearance={canResend ? 'accent' : 'outlined'}
				disabled={$submitting || secondsLeft > 0}
			>
				{secondsLeft > 0 ? `Send a new link in ${secondsLeft}s` : 'Send a new link'}
			</wa-button>
			<!-- A wait is shown by the countdown above, not repeated as an error. -->
			{#if $errors._errors && secondsLeft === 0}<span class="invalid" role="alert">{$errors._errors}</span>{/if}
			{#if $message}<p role="status">{$message}</p>{/if}
		</form>
	</AuthBox>

	<!-- Not plain "Log in", for the reason the sign-up page gives: no two links
	     on a page share an accessible name. -->
	<a class="cross-link" href={loginHref}>Confirmed it? Log in</a>
</AuthPage>

<style>
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

	.cross-link {
		align-self: center;
		color: var(--wa-color-text-quiet);
	}

	.envelope {
		align-self: center;
		font-size: 2rem;
		color: var(--accent-color);
	}

	@media (prefers-reduced-motion: no-preference) {
		.envelope {
			animation: bob 1.2s ease-in-out 0.2s 2;
		}
	}

	@keyframes bob {
		0%,
		100% {
			translate: 0 0;
		}
		50% {
			translate: 0 -6px;
		}
	}
</style>
