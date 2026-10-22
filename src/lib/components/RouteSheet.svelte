<script lang="ts">
	import type { Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';

	/**
	 * A page that is a sheet over its list: `/home/tasks/add` is the task list
	 * with the add form open over it, and reloading it, or opening it from a
	 * link, shows exactly that. The list is the route's `+layout.svelte`, so it
	 * stays put underneath; this is the child route's whole page. See
	 * docs/dialogs.md, "Sheets with their own URL".
	 *
	 * Closing goes back to the list. When the list is the page before this in
	 * history — it was opened from the list — that is `history.back()`, so Back
	 * after closing does not reopen it. When it was opened directly, there is no
	 * list behind it to go back to, so `leave` replaces this entry with the list.
	 */
	let {
		label,
		listHref,
		leave,
		width = '40rem',
		lightDismiss = false,
		children
	}: {
		label: string;
		/** The list this sheet sits over, as `resolve()` gives it. */
		listHref: string;
		/** Goes to the list in this entry's place: a `goto(…, { replaceState: true })`. */
		leave: () => void;
		width?: string;
		/**
		 * Off by default: most of these hold a form, and a stray tap outside
		 * would throw away what was typed.
		 */
		lightDismiss?: boolean;
		children: Snippet;
	} = $props();

	let dialog: ResponsiveDialog | undefined = $state();
	let fromList = false;

	afterNavigate(({ from, type }) => {
		fromList =
			type !== 'enter' &&
			from !== null &&
			from.url.pathname === new URL(listHref, location.href).pathname;
	});

	/** Closes it, with its animation, and then goes back to the list. */
	export function close() {
		dialog?.close();
	}

	function onclose() {
		if (fromList) {
			history.back();
		} else {
			leave();
		}
	}
</script>

<ResponsiveDialog bind:this={dialog} {label} {width} {lightDismiss} {onclose}>
	{@render children()}
</ResponsiveDialog>
