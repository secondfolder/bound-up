/**
 * Lets work finish after the response has gone.
 *
 * On Workers that is `ctx.waitUntil`, which keeps the invocation alive for up
 * to 30 seconds without holding the request open on a round trip to Apple's
 * push service or a mail provider. The Node builds have no such limit: the
 * promise simply runs.
 *
 * The task must not reject — `sendPush` never does, and `sendInBackground` in
 * `./mail` catches for itself — or it becomes an unhandled rejection.
 */
export function inBackground(platform: App.Platform | undefined, task: Promise<unknown>): void {
	platform?.ctx?.waitUntil(task);
}
