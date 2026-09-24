<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { currentKeyring, initialiseKeyring, lock, resetKeyring } from '$lib/crypto/session.svelte';
	import { rememberSignInEmail } from '$lib/sign-in-again';
	import StoragePersistenceDialog from './StoragePersistenceDialog.svelte';

	/**
	 * Makes sure this device holds the key to the user's messages, once.
	 *
	 * Mounted in the app shell rather than on the messaging pages, because the
	 * answer is needed before the user gets there. There is no unlock screen:
	 * signing in is what unlocks (see `session.svelte.ts`), so a device that
	 * finds itself without the key — most often because the browser cleared its
	 * storage — signs out and sends the user to sign in again. To them that is
	 * just being asked to sign in, which is the one thing they already know how
	 * to do; the login page says nothing about keys or messages.
	 *
	 * Every screen, not only messaging, is sent back. The guides and partner
	 * screens need no key, but "signed in, except for some features" is exactly
	 * the half-state this replaced.
	 */
	let { user = null }: { user?: { id: string; email: string } | null } = $props();
	const keyring = $derived(currentKeyring());

	let lastUserId: string | null = null;
	let signingOut = false;

	onMount(() => {
		void refresh();
	});

	$effect(() => {
		// A different account in the same tab must not inherit the previous one's
		// keyring — it would fail to unwrap, but it would fail confusingly.
		if (user?.id !== lastUserId) {
			void refresh();
			return;
		}

		// `unknown` means nobody has worked out where this device stands.
		// `initialiseKeyring` returns early unless the status is `unknown`, so
		// this cannot loop.
		if (keyring.status === 'unknown') {
			void refresh();
			return;
		}

		// A sign-in that just handed over its secret and still did not unlock is
		// a bug (`signInFailed`), and sending the user round again would hide it
		// in a loop. It is logged by `initialiseKeyring` and left there.
		if (keyring.status === 'locked' && !keyring.signInFailed && user) {
			void signInAgain(user);
		}
	});

	async function refresh() {
		const current = user;
		lastUserId = current?.id ?? null;
		if (!current) {
			resetKeyring();
			return;
		}
		try {
			await initialiseKeyring(current);
		} catch (error) {
			// A failed bundle fetch leaves the keyring 'unknown', which renders a
			// placeholder on the screens that need keys — better than a scary
			// banner for what is usually a dropped connection.
			console.error('could not work out encryption state', error);
		}
	}

	async function signInAgain(current: { id: string; email: string }) {
		if (signingOut) {
			return;
		}
		signingOut = true;
		// Kept on the device, not put in the URL, so the address does not end up
		// in access logs; the login page pre-fills it so a password manager or
		// passkey autofill matches the right account.
		rememberSignInEmail(current.email);
		// `lock` leaves the keyring `signed-out`, which this gate does not react
		// to — so nothing here starts working the state out again, and racing
		// the navigation below with a second one, while the session goes.
		await lock(current.id);
		await authClient.signOut();

		const back = `${page.url.pathname}${page.url.search}`;
		const query = new URLSearchParams({ redirectTo: back, reason: 'device' });
		// A runtime query string on a resolved route: the login load validates
		// `redirectTo` with `safeRedirect`, and `reason` only ever changes what
		// happens after the sign-in, never what the page shows.
		// biome-ignore lint/plugin: see above — a resolved route plus a validated query.
		await goto(`${resolve('/(public)/login')}?${query}`, { invalidateAll: true });
		signingOut = false;
	}
</script>

{#if user}
	<StoragePersistenceDialog />
{/if}
