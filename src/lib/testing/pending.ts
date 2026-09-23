/**
 * A promise that never settles: a request left in flight for the whole test.
 *
 * For asserting on what a component shows *while* it waits — a stubbed
 * `fetch` that returns this holds the component in its loading state for as
 * long as the test needs to look at it.
 */
export function pending<T = never>(): Promise<T> {
	return new Promise<T>(() => {
		// Deliberately neither resolved nor rejected.
	});
}
