import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetTunnel, STICKY_MS, type TunnelService, tunnelThrough } from './tunnel';

afterEach(() => resetTunnel());

const SEARCH = 'https://api.redgifs.com/v2/gifs/search?tags=Sissy';

/** A tunnel answering `status`, or throwing, and the bindings that hold it. */
function tunnel(answer: number | 'throws' = 200) {
	const service = {
		fetch: vi.fn((_input: string) =>
			answer === 'throws'
				? Promise.reject(new Error('darcy is off'))
				: Promise.resolve(new Response('tunnel', { status: answer }))
		)
	} satisfies TunnelService;
	return { service, bindings: (name: string) => (name === 'TUNNEL_REDGIFS' ? service : undefined) };
}

const answering = (status: number | 'throws') =>
	vi.fn(() =>
		status === 'throws'
			? Promise.reject(new Error('down'))
			: Promise.resolve(new Response('primary', { status }))
	);

describe('tunnelThrough', () => {
	it('leaves a request the usual route answers alone', async () => {
		const { service, bindings } = tunnel();
		const primary = answering(200);
		const response = await tunnelThrough(bindings, primary)(SEARCH);
		expect(await response.text()).toBe('primary');
		expect(service.fetch).not.toHaveBeenCalled();
	});

	it('retries a refusal through the tunnel, and keeps the host there for a while', async () => {
		let clock = 0;
		const { service, bindings } = tunnel();
		const primary = answering(429);
		const fetchFn = tunnelThrough(bindings, primary, () => clock);

		expect(await (await fetchFn(SEARCH)).text()).toBe('tunnel');
		// Straight to the tunnel now: a Redgifs token only works from the
		// address that fetched it, so its token and searches share a route.
		expect(await (await fetchFn('https://api.redgifs.com/v2/auth/temporary')).text()).toBe(
			'tunnel'
		);
		expect(primary).toHaveBeenCalledTimes(1);

		clock = STICKY_MS + 1;
		await fetchFn(SEARCH);
		expect(primary).toHaveBeenCalledTimes(2);
		expect(service.fetch).toHaveBeenCalledTimes(3);
	});

	it('falls back on 403 and 451 and on a thrown fetch, but not on other failures', async () => {
		for (const status of [403, 451, 'throws'] as const) {
			resetTunnel();
			const { bindings } = tunnel();
			expect(await (await tunnelThrough(bindings, answering(status))(SEARCH)).text()).toBe(
				'tunnel'
			);
		}
		resetTunnel();
		const { service, bindings } = tunnel();
		expect((await tunnelThrough(bindings, answering(503))(SEARCH)).status).toBe(503);
		expect(service.fetch).not.toHaveBeenCalled();
	});

	it("answers with the usual route's refusal when the tunnel is down too", async () => {
		const { bindings } = tunnel('throws');
		const response = await tunnelThrough(bindings, answering(429))(SEARCH);
		expect(response.status).toBe(429);
	});

	it('goes back to the usual route when the tunnel fails a host it was holding', async () => {
		const service = { fetch: vi.fn(() => Promise.resolve(new Response('tunnel'))) };
		const primary = answering(429);
		const fetchFn = tunnelThrough(() => service, primary);
		await fetchFn(SEARCH);
		service.fetch.mockImplementation(() => Promise.reject(new Error('down')));
		expect((await fetchFn(SEARCH)).status).toBe(429);
		expect(primary).toHaveBeenCalledTimes(2);
	});

	it('never sends a host without a tunnel, or without a binding, through one', async () => {
		const { service, bindings } = tunnel();
		const primary = answering(429);
		expect((await tunnelThrough(bindings, primary)('https://www.reddit.com/r/x/.rss')).status).toBe(
			429
		);
		// A tunnelled host whose binding is missing (a preview without it, say).
		expect((await tunnelThrough(() => undefined, primary)(SEARCH)).status).toBe(429);
		expect(service.fetch).not.toHaveBeenCalled();
	});
});
