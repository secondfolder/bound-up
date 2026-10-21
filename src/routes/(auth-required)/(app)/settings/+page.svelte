<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import DebugInfo from '$lib/components/DebugInfo.svelte';
	import { lock } from '$lib/crypto/session.svelte';
	import { submitDebugToggle } from '$lib/debug-toggle';
	import { hasFeature } from '$lib/features';
	import { disablePush } from '$lib/push-client';
	import { reportRequestFailure } from '$lib/request-failure.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Server load data is the single source of truth for auth state — see the
	// note in src/routes/+layout.svelte.
	const user = $derived(page.data.user);
	// Display only: the action checks the feature again on the server.
	const debugAvailable = $derived(hasFeature(page.data.features ?? [], 'debugMode'));
	const debugOn = $derived(page.data.debug ?? false);

	/**
	 * Whether the "Debug tools" row has just appeared because the switch was
	 * turned on, so it can pulse once and show where it went. Not on a page
	 * that opens with debug mode already on: a pulse on every visit is noise.
	 * A plain variable, not state: it only remembers the last value seen.
	 */
	let debugWasOn: boolean | undefined;
	let debugArrived = $state(false);
	$effect(() => {
		if (debugWasOn === false && debugOn) {
			debugArrived = true;
		}
		debugWasOn = debugOn;
	});
</script>

<section>
	<h1>Settings</h1>

	{#if user}
		<div class="account">
			<span class="eyebrow">Signed in as</span>
			<span class="name">{user.name}</span>
			<span class="email">{user.email}</span>
		</div>
	{/if}

	<ul>
		<li>
			<a href={resolve('/(auth-required)/(app)/settings/account')}>
				<span>Account</span>
				<wa-icon name="chevron-right" variant="solid"></wa-icon>
			</a>
		</li>
		<li>
			<a href={resolve('/(auth-required)/(app)/settings/security')}>
				<span>Security</span>
				<wa-icon name="chevron-right" variant="solid"></wa-icon>
			</a>
		</li>
		<li>
			<a href={resolve('/(auth-required)/(app)/settings/partners')}>
				<span>Partners</span>
				<wa-icon name="chevron-right" variant="solid"></wa-icon>
			</a>
		</li>
		<li>
			<a href={resolve('/(auth-required)/(app)/settings/notifications')}>
				<span>Notifications</span>
				<wa-icon name="chevron-right" variant="solid"></wa-icon>
			</a>
		</li>
		<!-- Display only: the admin pages check the role again on the server. -->
		{#if page.data.isAdmin}
			<li>
				<a href={resolve('/(auth-required)/(app)/admin')}>
					<span>Admin</span>
					<wa-icon name="chevron-right" variant="solid"></wa-icon>
				</a>
			</li>
		{/if}
		<!-- Display only, like the switch below: the debug pages check the feature again. -->
		{#if debugOn}
			<li class:arrived={debugArrived}>
				<a href={resolve('/(auth-required)/(app)/debug')}>
					<span>Debug tools</span>
					<wa-icon name="chevron-right" variant="solid"></wa-icon>
				</a>
			</li>
		{/if}
	</ul>

	{#if debugAvailable}
		<!-- Submitted as soon as the switch moves: there is nothing else on the
		     form to wait for. The hidden field says which way, so the post does
		     not depend on the switch's own form value. -->
		<form
			class="debug"
			method="POST"
			action="?/debug"
			use:enhance={submitDebugToggle}
		>
			<input type="hidden" name="on" value={String(!debugOn)} />
			<wa-switch
				checked={debugOn}
				onchange={(event: Event) => (event.currentTarget as HTMLElement).closest('form')?.requestSubmit()}
				>Debug mode on this device</wa-switch
			>
		</form>
		{#if debugOn && user}
			<DebugInfo
				version={data.appVersion}
				userId={user.id}
				accountTimezone={user.timezone}
				features={page.data.features ?? []}
			/>
		{/if}
	{/if}

	{#if user}
		<!-- At the end of the page, as a settings screen conventionally has it.
		     It used to sit in the signed-in card at the top, where a red button
		     was the second thing on the screen, above everything people come
		     here for.

		     Forgets this device's copy of the message key before the session
		     goes: signing out used to leave it in IndexedDB, readable by whoever
		     signed in next on the same browser profile. Stops its push
		     notifications too, while the session can still say which device
		     to drop, since they name a partner on the lock screen. Then
		     enhance's default goto + invalidateAll for the redirect. -->
		<form
			class="sign-out"
			method="POST"
			action="/logout"
			use:enhance={async () => {
				await disablePush();
				await lock(user.id);
				return async ({ result, update }) => {
					if (result.type === 'error') {
						reportRequestFailure(result);
						return;
					}
					await update();
				};
			}}
		>
			<wa-button type="submit" appearance="outlined" variant="danger">Log out</wa-button>
		</form>
	{/if}

	<p class="version">Version {data.appVersion}</p>
</section>

<style>
	section {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		padding: var(--wa-space-l) var(--page-gutter);

		h1 {
			margin-top: 0;
		}

		.account {
			display: flex;
			flex-direction: column;
			gap: 0.125rem;
			padding: 0.875rem 1rem;
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-l);
			background: var(--wa-color-surface-raised);
			margin-bottom: var(--wa-space-l);

			.eyebrow {
				font-size: var(--wa-font-size-s);
				color: var(--wa-color-text-quiet);
			}

			.name {
				font-weight: var(--wa-font-weight-semibold, 600);
			}

			/* A long address breaks rather than widening the card; break-word
			   still prefers the hyphens and dots in it. */
			.email {
				color: var(--wa-color-text-quiet);
				overflow-wrap: break-word;
			}
		}

		ul {
			padding: 0;
			margin: 0;

			li {
				list-style-type: none;
				border-bottom: 1px solid var(--wa-color-surface-border);

				a {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 1rem;
					/* Padded and pulled back out by the same amount, so the hover
					   wash has some room around the text while the text itself
					   stays on the page's edge. */
					padding: 0.75rem 0.5rem;
					margin-inline: -0.5rem;
					border-radius: var(--wa-border-radius-m);
					text-decoration: none;
					color: inherit;

					&:hover,
					&:focus-visible {
						background: var(--wa-color-surface-raised);
					}
				}
			}

			@media (prefers-reduced-motion: no-preference) {
				a {
					transition: background-color var(--wa-transition-fast);

					wa-icon {
						transition: translate var(--wa-transition-fast);
					}

					&:hover wa-icon {
						translate: 2px 0;
					}
				}

				/* One amber pulse where the debug tools have just appeared. */
				li.arrived a {
					animation: arrived 1.2s ease-out;
				}
			}
		}

		/* Label on the left and switch on the right, like every other row's
		   affordance. The text stays inside the switch, so the whole row is
		   still its label and its click target. */
		.debug {
			padding: 0.75rem 0;
			border-bottom: 1px solid var(--wa-color-surface-border);

			wa-switch {
				display: flex;

				&::part(base) {
					flex: 1 1 auto;
					flex-direction: row-reverse;
					justify-content: space-between;
					gap: 1rem;
				}

				&::part(label) {
					margin-inline-start: 0;
				}
			}
		}

		.sign-out {
			display: flex;
			flex-direction: column;
			margin-top: var(--wa-space-xl);
		}

		.version {
			margin: var(--wa-space-l) 0 0;
			text-align: center;
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}
	}

	@keyframes arrived {
		from {
			background: var(--wa-color-brand-fill-normal);
		}
	}
</style>
