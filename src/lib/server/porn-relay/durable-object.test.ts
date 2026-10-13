import { afterEach, describe, expect, it, vi } from 'vitest';
import { PornRelay } from './durable-object';
import { isRelayable } from './hosts';

afterEach(() => vi.unstubAllGlobals());

const relay = (target: string, init?: RequestInit) =>
	new PornRelay().fetch(
		new Request(`https://porn-relay.invalid/?${new URLSearchParams({ url: target })}`, init)
	);

describe('isRelayable', () => {
	it('allows https pages on a relayed host', () => {
		expect(isRelayable('https://pmvhaven.com/search?q=goon')).toBe(true);
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
	it('fetches a relayed page, passing on its status and only the headers callers set', async () => {
		const fetchFn = vi.fn(async () => new Response('refused', { status: 451 }));
		vi.stubGlobal('fetch', fetchFn);
		const response = await relay('https://pmvhaven.com/search?q=goon', {
			headers: { 'user-agent': 'BoundUp/1.0', accept: 'text/html', cookie: 'secret=1' }
		});
		expect(response.status).toBe(451);
		expect(await response.text()).toBe('refused');
		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://pmvhaven.com/search?q=goon');
		const headers = new Headers(init.headers);
		expect(headers.get('user-agent')).toBe('BoundUp/1.0');
		expect(headers.get('accept')).toBe('text/html');
		expect(headers.get('cookie')).toBeNull();
	});

	it('refuses a host it does not relay, or a method other than GET, without fetching', async () => {
		const fetchFn = vi.fn();
		vi.stubGlobal('fetch', fetchFn);
		expect((await relay('https://example.com/')).status).toBe(403);
		expect((await relay('https://pmvhaven.com/', { method: 'POST' })).status).toBe(403);
		expect(fetchFn).not.toHaveBeenCalled();
	});
});
