<script lang="ts">
	import { onMount } from 'svelte';
	import { updated } from '$app/state';

	/**
	 * Says a new version has been deployed, and offers to load it.
	 *
	 * A home-screen web app on iOS is resumed rather than relaunched, so it can
	 * run the build it was opened on for days, and in standalone mode there is
	 * no reload button and no pull-to-refresh to get out of it. SvelteKit polls
	 * `version.json` (`kit.version` in svelte.config.js) and, once it changes,
	 * makes the next link click a full page load; this covers the time before
	 * that click. Rendered once, by the root layout, so it is on every page.
	 *
	 * It never reloads by itself, because that could throw away a half-filled
	 * form. And it does not time out: an update that is missed stays missed,
	 * so the toast stays until it is taken or closed (`duration = 0`).
	 *
	 * The item is made by hand rather than rendered from Svelte state, for the
	 * reason `MessageToasts.svelte` gives: a `wa-toast-item` removes itself from
	 * the DOM when it is closed, under Svelte's feet.
	 */

	type ToastItem = HTMLElement & { variant: string; size: string; duration: number };

	let toaster = $state<HTMLElement>();
	let shown = false;

	$effect(() => {
		if (!(updated.current && toaster) || shown) {
			return;
		}
		shown = true;

		const item = document.createElement('wa-toast-item') as ToastItem;
		item.variant = 'brand';
		item.size = 's';
		item.duration = 0;
		item.dataset.testid = 'update-available';

		const body = document.createElement('div');
		body.className = 'update-body';
		const text = document.createElement('span');
		text.textContent = 'A new version of Bound Up is available.';
		const reload = document.createElement('wa-button');
		reload.setAttribute('size', 's');
		reload.setAttribute('variant', 'brand');
		reload.textContent = 'Reload';
		reload.addEventListener('click', () => location.reload());
		body.append(text, reload);
		item.append(body);

		toaster.append(item);
	});

	onMount(() => {
		/**
		 * The poll is a timer, and iOS barely runs timers for an app it has
		 * suspended, so coming back to the foreground is when to look. Any
		 * resume counts: `visibilitychange` fires for a home-screen app brought
		 * back from the switcher as well as for a browser tab.
		 */
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				void updated.check();
			}
		};
		/**
		 * A lazily loaded module that no longer exists — the composer's editor,
		 * the encryption library — is the other sign of a stale build, since a
		 * deploy replaces the hashed chunks. Navigation already recovers from
		 * this by itself (SvelteKit checks for an update and loads the page in
		 * full); for any other import it fails where it was made, and this puts
		 * the way out in front of the person. Not `preventDefault()`ed, so the
		 * failure is still reported where it happened.
		 */
		const onPreloadError = () => {
			void updated.check();
		};
		document.addEventListener('visibilitychange', onVisible);
		addEventListener('vite:preloadError', onPreloadError);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			removeEventListener('vite:preloadError', onPreloadError);
		};
	});
</script>

<!-- At the top, like every other notice: the bottom belongs to the app nav. -->
<wa-toast bind:this={toaster} placement="top-center"></wa-toast>

<style>
	wa-toast :global(.update-body) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-s);
	}
</style>
