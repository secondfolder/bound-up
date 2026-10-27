import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `$lib/navigation` never lets a refresh drop a navigation: SvelteKit's own
 * `invalidate` abandons one already under way (a link tapped while a save was
 * answering went nowhere), so these wait for it first. The router is replaced
 * by a navigation whose `complete` the test settles by hand.
 */

const kit = vi.hoisted(() => ({
	invalidate: vi.fn(async (_resource: unknown) => undefined),
	invalidateAll: vi.fn(async () => undefined)
}));
const state = vi.hoisted(() => ({
	navigating: { complete: null as Promise<void> | null }
}));

vi.mock('$app/navigation', () => kit);
vi.mock('$app/state', () => state);

const { invalidate, invalidateAll } = await import('./navigation');

/** A navigation under way, as `navigating` shows it, settled by the test. */
function startNavigation() {
	let land: () => void = () => undefined;
	let abandon: () => void = () => undefined;
	const complete = new Promise<void>((resolve, reject) => {
		land = resolve;
		abandon = () => reject(new Error('navigation aborted'));
	});
	state.navigating.complete = complete;
	return {
		land: () => {
			// SvelteKit fulfils, then clears `navigating`, in the same turn.
			land();
			state.navigating.complete = null;
		},
		// An abandoned navigation stays in `navigating` until the next one.
		abandon
	};
}

/** Lets every promise chain that can move, move. */
async function flush() {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

describe('$lib/navigation', () => {
	beforeEach(() => {
		kit.invalidate.mockClear();
		kit.invalidateAll.mockClear();
		state.navigating.complete = null;
	});

	it('refreshes straight away when nothing is navigating', async () => {
		await invalidate('app:context');
		await invalidateAll();

		expect(kit.invalidate).toHaveBeenCalledWith('app:context');
		expect(kit.invalidateAll).toHaveBeenCalledOnce();
	});

	it('waits for a navigation under way, then refreshes the page it landed on', async () => {
		const navigation = startNavigation();

		const refreshing = invalidateAll();
		const refreshingOne = invalidate('app:context');
		await flush();
		expect(kit.invalidateAll).not.toHaveBeenCalled();
		expect(kit.invalidate).not.toHaveBeenCalled();

		navigation.land();
		await Promise.all([refreshing, refreshingOne]);
		expect(kit.invalidateAll).toHaveBeenCalledOnce();
		expect(kit.invalidate).toHaveBeenCalledWith('app:context');
	});

	it('waits for a navigation that replaced the one it was waiting on', async () => {
		const first = startNavigation();
		const refreshing = invalidateAll();
		await flush();

		const second = startNavigation();
		first.abandon();
		await flush();
		expect(kit.invalidateAll).not.toHaveBeenCalled();

		second.land();
		await refreshing;
		expect(kit.invalidateAll).toHaveBeenCalledOnce();
	});

	it('refreshes after a navigation that was abandoned and left behind', async () => {
		const navigation = startNavigation();
		const refreshing = invalidateAll();
		await flush();

		// Still in `navigating`, already rejected: waited on once, not forever.
		navigation.abandon();
		await refreshing;
		expect(kit.invalidateAll).toHaveBeenCalledOnce();
	});
});
