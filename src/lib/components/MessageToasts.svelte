<script lang="ts">
	import { resolve } from '$app/paths';

	/**
	 * In-app notices for messages in *other* threads, shown on a thread page.
	 *
	 * A device with a thread open is watching the partnership, so the server
	 * sends it no push notification (docs/notifications.md); this is what tells
	 * it instead. A tap goes where a notification's tap goes — the board with
	 * `?thread=`, whose load opens a thread read before and rings one never
	 * opened — so the two cannot drift apart.
	 *
	 * The items are made by hand rather than rendered from Svelte state,
	 * because a `wa-toast-item` removes itself from the DOM when it hides, and
	 * Svelte would later try to remove a node that is already gone. The text is
	 * set with `textContent`, never as HTML: the partner's name is whatever
	 * somebody typed.
	 */

	let { partnershipId, partnerName }: { partnershipId: string; partnerName: string } = $props();

	/** Long enough to read and reach for; it pauses while hovered or focused. */
	const TOAST_DURATION_MS = 8000;

	type ToastItem = HTMLElement & {
		variant: string;
		size: string;
		duration: number;
		hide: () => Promise<void>;
	};

	let toaster = $state<HTMLElement>();
	/**
	 * The one notice showing, if any. One at a time, the newest replacing the
	 * last: two would both be links named "New message from Sam" going to
	 * different threads, and two links on a page must not share a name.
	 */
	let shown: { threadId: string; item: ToastItem; visible: boolean } | null = null;

	/** Tells the viewer a message arrived in `threadId`. */
	export function show(threadId: string) {
		if (!toaster) {
			return;
		}
		if (shown) {
			dismiss(shown.threadId);
		}

		const item = document.createElement('wa-toast-item') as ToastItem;
		item.variant = 'brand';
		item.size = 's';
		item.duration = TOAST_DURATION_MS;

		const link = document.createElement('a');
		link.href = `${resolve('/(auth-required)/(app)/partner/[id]/messages', { id: partnershipId })}?thread=${encodeURIComponent(threadId)}`;
		link.textContent = `New message from ${partnerName}`;
		link.dataset.testid = 'message-toast';
		link.addEventListener('click', () => dismiss(threadId));
		item.append(link);

		const entry = { threadId, item, visible: false };
		item.addEventListener('wa-after-show', () => {
			entry.visible = true;
		});
		item.addEventListener('wa-after-hide', () => {
			if (shown === entry) {
				shown = null;
			}
		});
		shown = entry;
		toaster.append(item);
	}

	/** Takes the notice away if it is about `threadId`. */
	export function dismiss(threadId: string) {
		if (shown?.threadId !== threadId) {
			return;
		}
		const { item, visible } = shown;
		shown = null;
		// `hide()` on an item still showing throws inside Web Awesome and leaves
		// it on screen — a second message arriving straight after the first does
		// exactly that — so one that has not finished appearing is just removed.
		if (visible) {
			void item.hide();
		} else {
			item.remove();
		}
	}
</script>

<wa-toast bind:this={toaster} placement="top-center"></wa-toast>

<style>
	/* The whole notice is the link, so it reads as one thing to tap. */
	wa-toast :global(a) {
		display: block;
		color: inherit;
		text-decoration: none;
		font-weight: var(--wa-font-weight-semibold);
	}
</style>
