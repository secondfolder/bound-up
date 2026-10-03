import type { RealtimeNamespace } from './binding';
import type { Notifier, Watcher } from './index';

/**
 * The production notifier: a Durable Object per partnership.
 *
 * This is the *worker* side — it talks to the object over `fetch`. The object
 * itself is `./durable-object.ts`, which nothing here imports: its only importer
 * is the export `sveltekit-cloudflare-do` appends to the generated worker, so
 * the SvelteKit bundle never pulls the class in.
 *
 * The URL is a fiction. A Durable Object stub's `fetch` never makes a network
 * request; the host is ignored and only the path is read by the object's own
 * `fetch`. `https://realtime.invalid` makes that unmistakable — the `.invalid`
 * TLD is reserved precisely so it can never resolve, so nobody later mistakes
 * this for a service being called over the wire.
 */
const ROOM_ORIGIN = 'https://realtime.invalid';

export function createDurableObjectNotifier(namespace: RealtimeNamespace): Notifier {
	const room = (partnershipId: string) => namespace.get(namespace.idFromName(partnershipId));

	return {
		async publish(partnershipId, event) {
			try {
				const response = await room(partnershipId).fetch(`${ROOM_ORIGIN}/publish`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(event)
				});
				const { watching } = (await response.json()) as { watching: Watcher[] };
				return watching;
			} catch (error) {
				// Swallowed on purpose, and this is the whole reason `publish` is
				// declared as never throwing: the write this follows has already
				// committed. Turning a fan-out failure into a 500 would make the
				// client retry a send that actually succeeded, and the worst case
				// here is that the other device notices on its next navigation.
				console.error('could not publish a realtime event', error);
				return [];
			}
		},

		async stream(partnershipId, watcher) {
			const url = new URL(`${ROOM_ORIGIN}/subscribe`);
			url.searchParams.set('user', watcher.userId);
			if (watcher.deviceId) {
				url.searchParams.set('device', watcher.deviceId);
			}
			const response = await room(partnershipId).fetch(url.toString());
			// Rewrapped, because a stub's Response has immutable headers, and
			// SvelteKit appends `Set-Cookie` to whatever an endpoint returns whenever
			// the request set a cookie — a Better Auth session refresh, say. Returned
			// as-is, that threw "Can't modify immutable headers" and the feed 500'd.
			// The body is passed through rather than read, so it still streams:
			// buffering it here would hold the whole stream in the worker.
			return new Response(response.body, response);
		}
	};
}
