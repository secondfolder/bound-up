import { emptyList, type ListPayload, listPayloadSchema } from './answers';
import { DEVICE_LIST_KEY } from './device-key';
import { KinkListStore, type SaveState } from './store.svelte';

/**
 * A kink list kept on this device, for someone signed out. The same payload
 * an account seals, in `localStorage` as it is: there is no key to seal it
 * with until there is an account. Signing in moves it into the account
 * (docs/kink-list.md, "Without an account").
 */

/**
 * The list kept on this device, or null when there is none. Anything that
 * does not parse counts as none — storage another build or an extension
 * wrote is not worth an error screen — and so does a browser that refuses
 * storage altogether (a private window, blocked site data).
 */
export function readDeviceList(): ListPayload | null {
	try {
		const raw = localStorage.getItem(DEVICE_LIST_KEY);
		if (!raw) {
			return null;
		}
		const parsed = listPayloadSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export function clearDeviceList(): void {
	try {
		localStorage.removeItem(DEVICE_LIST_KEY);
	} catch {
		// Nothing to clear if the browser will not let us look.
	}
}

export class DeviceKinkList extends KinkListStore {
	readonly kind = 'device';

	/** Reads the device's list. Call in the browser, after hydration. */
	open(): void {
		this.list = readDeviceList() ?? emptyList();
		this.state = 'ready';
	}

	// The base class calls this on the instance; a device list needs nothing of it.
	// biome-ignore lint/nursery/useThisInClassMethods: an override of the abstract persist.
	protected persist(list: ListPayload): Promise<SaveState> {
		try {
			localStorage.setItem(DEVICE_LIST_KEY, JSON.stringify(list));
			return Promise.resolve({ status: 'saved' });
		} catch {
			return Promise.resolve({
				status: 'failed',
				error:
					"This browser isn't letting the list be saved. A private window, or blocked site data, does that."
			});
		}
	}
}
