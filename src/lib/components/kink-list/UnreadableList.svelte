<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { lock } from '$lib/crypto/session.svelte';
	import { ACCOUNT_LIST_UNREADABLE, type AccountKinkList } from '$lib/kink-list/account-store.svelte';
	import { rememberSignInEmail } from '$lib/sign-in-again';

	/**
	 * What shows instead of a list this device cannot open, with a way out
	 * for each likely cause, mildest first: reload (a dropped connection while
	 * the vaults were worked out), sign in again (this device's keys are not
	 * the ones the list is sealed with), and, last, start a new list. Starting
	 * over keeps the one it replaces as a version (`startOver`), so even that
	 * loses nothing a later fix could not bring back.
	 *
	 * Why it would not open is in the console, and on screen in debug mode
	 * (docs/debug-mode.md) — paths, codes and types, never anything from the list.
	 *
	 * TODO: once there is a way to send feedback from the app, offer "Report
	 * this" here, with `store.failure` attached, so a broken list reaches
	 * whoever can fix it without the person having to describe it.
	 */
	let { store }: { store: AccountKinkList } = $props();

	const user = $derived(page.data.user as { id: string; email: string } | null | undefined);
	let confirming = $state(false);
	let busy = $state(false);

	async function signInAgain() {
		if (!user || busy) {
			return;
		}
		busy = true;
		rememberSignInEmail(user.email);
		await lock(user.id);
		await authClient.signOut();
		const query = new URLSearchParams({
			redirectTo: `${page.url.pathname}${page.url.search}`,
			reason: 'device'
		});
		// A resolved route plus a query the login load validates (`safeRedirect`),
		// as in EncryptionGate.
		// biome-ignore lint/plugin: see above — a resolved route plus a validated query.
		await goto(`${resolve('/(public)/login')}?${query}`, { invalidateAll: true });
		busy = false;
	}

	async function startOver() {
		busy = true;
		await store.startOver();
		busy = false;
		confirming = false;
	}
</script>

<div class="unreadable">
	<h1>Kink list</h1>
	<p>{ACCOUNT_LIST_UNREADABLE}</p>
	<div class="ways">
		<wa-button appearance="outlined" onclick={() => location.reload()}>Reload</wa-button>
		{#if user}
			<wa-button appearance="outlined" disabled={busy} onclick={signInAgain}>
				Sign out and back in
			</wa-button>
		{/if}
	</div>

	{#if confirming}
		<div class="confirm">
			<p>
				Your list will start empty here and on your other devices. The one that won't open is kept
				in your list's history, so it can still be brought back if it can be opened later.
			</p>
			<div class="ways">
				<wa-button variant="danger" appearance="accent" disabled={busy} onclick={startOver}>
					Start a new list
				</wa-button>
				<wa-button
					appearance="outlined"
					onclick={() => {
						confirming = false;
					}}>Keep waiting</wa-button
				>
			</div>
		</div>
	{:else}
		<p class="quiet">
			Still stuck?
			<button
				type="button"
				class="link"
				onclick={() => {
					confirming = true;
				}}>Start a new list</button
			>
		</p>
	{/if}

	{#if page.data.debug && store.failure}
		<details class="debug">
			<summary>Why it won't open</summary>
			<pre>{JSON.stringify(store.failure, null, 2)}</pre>
		</details>
	{/if}
</div>

<style>
	.unreadable {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		text-align: center;

		p {
			margin: 0;
		}
	}

	.ways {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}

	.confirm {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-inline-size: 32rem;
	}

	.quiet {
		color: var(--wa-color-text-quiet);
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--wa-color-brand-on-quiet);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.debug {
		align-self: stretch;
		text-align: start;

		pre {
			overflow-x: auto;
			font-size: 0.8125rem;
		}
	}
</style>
