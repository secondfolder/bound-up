<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { lock } from '$lib/crypto/session.svelte';
	import { disablePush } from '$lib/push-client';
	import { reportRequestFailure } from '$lib/request-failure.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Server load data is the single source of truth for auth state — see the
	// note in src/routes/+layout.svelte.
	const user = $derived(page.data.user);
</script>

<section>
	<h1>Settings</h1>

	{#if user}
		<div class="account">
			<div class="account-row">
				<div class="account-copy">
					<span class="eyebrow">Signed in as</span>
					<span class="name">{user.name}</span>
					<span class="email">{user.email}</span>
				</div>

				<!-- Forgets this device's copy of the message key before the session
				     goes: signing out used to leave it in IndexedDB, readable by whoever
				     signed in next on the same browser profile. Stops its push
				     notifications too, while the session can still say which device
				     to drop, since they name a partner on the lock screen. Then
				     enhance's default goto + invalidateAll for the redirect. -->
				<form
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
			</div>
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
	</ul>

	<p class="version">Version {data.appVersion}</p>
</section>

<style>
	section {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--wa-space-l);

		h1 {
			margin-top: 0;
		}

		.account {
			padding: 0.875rem 1rem;
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-l);
			background: var(--wa-color-surface-raised);
			margin-bottom: var(--wa-space-l);

			.account-row {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
			}

			.account-copy {
				display: flex;
				flex-direction: column;
				gap: 0.125rem;
				min-width: 0;
			}

			.eyebrow {
				font-size: var(--wa-font-size-s);
				color: var(--wa-color-text-quiet);
			}

			.name {
				font-weight: var(--wa-font-weight-semibold, 600);
			}

			.email {
				color: var(--wa-color-text-quiet);
			}

			form {
				margin-left: auto;
			}
		}

		ul {
			padding: 0;
			margin: 0;

			li {
				list-style-type: none;
				border-bottom: 1px solid var(--wa-color-surface-border);
				margin: 0;

				a {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 1rem;
					padding: 0.75rem 0;
					text-decoration: none;
					color: inherit;
				}
			}
		}

		.version {
			margin: var(--wa-space-xl) 0 0;
			text-align: center;
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}
	}
</style>
