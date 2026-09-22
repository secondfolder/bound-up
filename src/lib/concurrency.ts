/**
 * A first-in, first-out queue that runs at most `max` tasks at once.
 *
 * Exists for embed lookups: pasting a block of text with a hundred links in
 * it makes a hundred embeds, and each one asks a provider what its URL is.
 * Letting them all go at once hammers a third party (noembed has no SLA and
 * reddit rate-limits) for previews that only ever appear a few at a time
 * anyway. Order is kept so the links at the top of a paste resolve first.
 *
 * Alias-free and DOM-free so both the browser and the server can use it.
 */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(max: number): Limiter {
	if (!Number.isInteger(max) || max < 1) {
		throw new Error(`createLimiter needs a positive integer, got ${max}`);
	}
	let active = 0;
	const waiting: (() => void)[] = [];

	const next = () => {
		active -= 1;
		waiting.shift()?.();
	};

	return <T>(task: () => Promise<T>): Promise<T> =>
		new Promise<T>((resolve, reject) => {
			const start = () => {
				active += 1;
				// Wrapped so a task that throws synchronously still frees its slot
				// instead of wedging the queue for everything behind it.
				Promise.resolve().then(task).then(resolve, reject).finally(next);
			};
			if (active < max) start();
			else waiting.push(start);
		});
}

/**
 * `Promise.all(items.map(fn))`, but with at most `max` calls in flight.
 *
 * Results come back in input order, like `Promise.all`, and a rejection
 * rejects the whole thing the same way.
 */
export function mapWithConcurrency<T, R>(
	items: readonly T[],
	max: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const limit = createLimiter(max);
	return Promise.all(items.map((item) => limit(() => fn(item))));
}
