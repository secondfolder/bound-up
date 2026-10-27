/**
 * Bringing a kink list kept on this device into the account, once someone
 * signs in or up. See docs/kink-list.md, "Without an account".
 *
 * BROWSER ONLY, and loaded by the app shell through `await import()` only when
 * a device list exists, so the shell carries none of the sealing for everyone
 * else.
 *
 * The device's answers are merged into the account's list per kink, newest
 * first, and the device copy is removed only after the merged list is saved:
 * a failure leaves it where it was, to try again on the next load.
 */

import { tryFetch } from '../request-failure.svelte';
import type { KinkListView } from '../types';
import { AccountKinkList } from './account-store.svelte';
import { adopted } from './adopted.svelte';
import { answeredCount } from './answers';
import { kinkListPath } from './api';
import { clearDeviceList, readDeviceList } from './device-store.svelte';

let running: Promise<void> | null = null;

/** `soloSpaceId` is the signed-in person's own space, where their list is saved. */
export function adoptDeviceList(soloSpaceId: string): Promise<void> {
	running ??= adopt(soloSpaceId).finally(() => {
		running = null;
	});
	return running;
}

async function adopt(soloSpaceId: string): Promise<void> {
	const device = readDeviceList();
	if (!device) {
		return;
	}
	const count = answeredCount(device);
	const response = await tryFetch(kinkListPath(soloSpaceId));
	if (!response?.ok) {
		return;
	}
	const { list: view } = (await response.json()) as { list: KinkListView | null };
	const store = new AccountKinkList(soloSpaceId, view);
	await store.open();
	if (store.state !== 'ready') {
		// A list this device cannot open is not overwritten; the device copy waits.
		return;
	}
	store.adopt(device);
	await store.flush();
	if (store.save.status === 'saved' && !store.unsaved) {
		clearDeviceList();
		adopted.count = count;
	}
}
