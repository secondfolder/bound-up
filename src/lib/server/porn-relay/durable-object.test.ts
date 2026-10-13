import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PornRelay } from './durable-object';
import { isRelayable, MAX_AGE_HEADER } from './hosts';
import { RELAY_LOCATIONS, relayThrough, resetRelay } from './index';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	resetRelay();
});

/**
 * A Durable Object's `storage.sql` over Node's own SQLite, which is
 * synchronous like the real one (libsql, used elsewhere in tests, is not).
 */
function sqlStorage() {
	const db = new DatabaseSync(':memory:');
	return {
		exec: (query: string, ...bindings: unknown[]) => {
			const statement = db.prepare(query);
			const params = bindings as (string | number | null)[];
			let rows: unknown[] = [];
			if (query.trimStart().toUpperCase().startsWith('SELECT')) {
				rows = statement.all(...params);
			} else {
				statement.run(...params);
			}
			// biome-ignore lint/suspicious/noExplicitAny: the fake hands back whatever row type is asked for, as the real one does.
			return { toArray: () => rows as any[] };
		}
	};
}

const SEARCH = 'https://pmvhaven.com/search?q=goon';

function relayRequest(target: string, init?: RequestInit) {
	return new Request(`https://porn-relay.invalid/?${new URLSearchParams({ url: target })}`, init);
}

describe('isRelayable', () => {
	it('allows https pages on a relayed host', () => {
		expect(isRelayable(SEARCH)).toBe(true);
		expect(isRelayable('https://pmvhaven.com/video/68f800cc664a939610468c19')).toBe(true);
	});

	it('refuses anything else, so the relay is not an open proxy', () => {
		for (const target of [
			'http://pmvhaven.com/search',
			'https://evil.pmvhaven.com/',
			'https://pmvhaven.com.evil.example/',
			'https://user:pass@pmvhaven.com/',
			'https://pmvhaven.com:8443/',
			'https://example.com/',
			'not a url'
		]) {
			expect(isRelayable(target), target).toBe(false);
		}
	});
});

describe('PornRelay', () => {
	let relay: PornRelay;
	beforeEach(() => {
		relay = new PornRelay({ storage: { sql: sqlStorage() } });
	});

	it('fetches a relayed page, passing on its status and only the headers callers set', async () => {
		const fetchFn = vi.fn(async () => new Response('refused', { status: 451 }));
		vi.stubGlobal('fetch', fetchFn);
		const response = await relay.fetch(
			relayRequest(SEARCH, {
				headers: { 'user-agent': 'BoundUp/1.0', accept: 'text/html', cookie: 'secret=1' }
			})
		);
		expect(response.status).toBe(451);
		expect(await response.text()).toBe('refused');
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(SEARCH);
		const headers = new Headers(init.headers);
		expect(headers.get('user-agent')).toBe('BoundUp/1.0');
		expect(headers.get('accept')).toBe('text/html');
		expect(headers.get('cookie')).toBeNull();
		expect(headers.get(MAX_AGE_HEADER)).toBeNull();
	});

	it('refuses a host it does not relay, or a method other than GET, without fetching', async () => {
		const fetchFn = vi.fn();
		vi.stubGlobal('fetch', fetchFn);
		expect((await relay.fetch(relayRequest('https://example.com/'))).status).toBe(403);
		expect((await relay.fetch(relayRequest(SEARCH, { method: 'POST' }))).status).toBe(403);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('keeps a page for as long as the caller says, and then fetches it again', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const fetchFn = vi.fn(
			async () => new Response('<html>page</html>', { headers: { 'content-type': 'text/html' } })
		);
		vi.stubGlobal('fetch', fetchFn);
		const cached = () => relayRequest(SEARCH, { headers: { [MAX_AGE_HEADER]: '60' } });

		const first = await relay.fetch(cached());
		expect(first.headers.get('x-relay-cache')).toBe('miss');
		const second = await relay.fetch(cached());
		expect(second.headers.get('x-relay-cache')).toBe('hit');
		expect(await second.text()).toBe('<html>page</html>');
		expect(second.headers.get('content-type')).toBe('text/html');
		expect(fetchFn).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + 61_000);
		await relay.fetch(cached());
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('keeps nothing without a max age, and never a failure', async () => {
		const fetchFn = vi.fn(async () => new Response('nope', { status: 503 }));
		vi.stubGlobal('fetch', fetchFn);
		await relay.fetch(relayRequest(SEARCH));
		await relay.fetch(relayRequest(SEARCH, { headers: { [MAX_AGE_HEADER]: '60' } }));
		await relay.fetch(relayRequest(SEARCH, { headers: { [MAX_AGE_HEADER]: '60' } }));
		expect(fetchFn).toHaveBeenCalledTimes(3);
	});
});

describe('relayThrough', () => {
	/** A namespace whose objects answer by location. */
	function namespace(statusAt: (location: string) => number) {
		const asked: string[] = [];
		return {
			asked,
			ns: {
				idFromName: (name: string) => ({ toString: () => name }),
				get: (id: { toString: () => string }, options?: { locationHint?: string }) => ({
					fetch: () => {
						// The hint and the name agree, so each region is one object.
						asked.push(`${id}@${options?.locationHint}`);
						return Promise.resolve(new Response('', { status: statusAt(id.toString()) }));
					}
				})
			}
		};
	}

	it('moves past a relay that is refused, and sticks with the one that is not', async () => {
		const { ns, asked } = namespace((location) => (location === RELAY_LOCATIONS[0] ? 451 : 200));
		const relayed = relayThrough(ns, vi.fn());
		expect((await relayed(SEARCH)).status).toBe(200);
		expect((await relayed(SEARCH)).status).toBe(200);
		expect(asked).toEqual(
			[RELAY_LOCATIONS[0], RELAY_LOCATIONS[1], RELAY_LOCATIONS[1]].map((l) => `${l}@${l}`)
		);
	});

	it('hands back the refusal when every relay is refused', async () => {
		const { ns, asked } = namespace(() => 451);
		expect((await relayThrough(ns, vi.fn())(SEARCH)).status).toBe(451);
		expect(asked).toEqual(RELAY_LOCATIONS.map((l) => `${l}@${l}`));
	});

	it('sends a host it does not relay straight out', async () => {
		const { ns, asked } = namespace(() => 200);
		const fallback = vi.fn(async () => new Response('direct'));
		expect(await (await relayThrough(ns, fallback)('https://example.com/')).text()).toBe('direct');
		expect(asked).toEqual([]);
	});
});
