/**
 * Holding a response back until a fixed time has passed since it started.
 *
 * For actions whose work differs with something the caller must not learn.
 * Sign-up is the one: an address that already has an account skips the
 * account and key writes a new one makes, so it answered measurably faster —
 * enough to tell, by timing alone, which addresses have accounts, though the
 * page that follows is identical. Waiting both out to the same floor hides
 * that, as long as the floor sits above the slower path; Better Auth does the
 * same for `/send-verification-email` with its own 500ms.
 *
 * Waiting is not CPU time on Workers, so the floor costs only latency.
 */

/**
 * How long every sign-up that reaches Better Auth takes, at least. Above the
 * slower path — a new account's hash, inserts and key batch — so that one for
 * an address that already has an account, which skips the writes, cannot be
 * told apart by how fast it answers.
 *
 * Here rather than in the sign-up route: a `+page.server.ts` may export only
 * the names SvelteKit knows, and refuses to load with any other.
 */
export const SIGN_UP_RESPONSE_FLOOR_MS = 1500;

/** A point to measure from: when the work whose length must not show began. */
export function startTimer(): number {
	return performance.now();
}

/** Resolves once `floorMs` have passed since `startedAt`, at once if they already have. */
export function holdUntilFloor(startedAt: number, floorMs: number): Promise<void> {
	const remaining = startedAt + floorMs - performance.now();
	if (remaining <= 0) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		setTimeout(resolve, remaining);
	});
}
