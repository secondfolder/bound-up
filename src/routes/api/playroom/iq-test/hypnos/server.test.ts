import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearHypnoIndex } from '$lib/server/playroom-hypno';
import { fakeEvent } from '$lib/testing/events';
import { GET } from './+server';

afterEach(() => clearHypnoIndex());

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const FILES = [
	{ n: 1, name: 'Bimbo Drone', fileType: 'loop', triggers: ['Good girl'] },
	{ n: 2, name: 'Pink Song', fileType: 'music', triggers: [] },
	{ n: 3, name: 'Quiet Sub', fileType: 'subliminal', triggers: ['Bambi sleep'] },
	{ n: 4, name: 'Big Session', fileType: 'full session', triggers: [] }
].map(({ n, name, fileType, triggers }) => ({
	uuid: UUID(n),
	name,
	duration: 60_000,
	fileType,
	audioURL: `https://cdn.bambicloud.com/${UUID(n)}.mp3`,
	author: { username: 'a' },
	triggers: triggers.map((trigger) => ({ name: trigger }))
}));

const fetchFn = vi.fn(() =>
	Promise.resolve(
		Response.json({ files: FILES, totalItems: FILES.length, pageSize: 50, pageOffset: 0 })
	)
);

async function get(query: string) {
	const response = await GET(
		fakeEvent({ user: null, path: `/api/playroom/iq-test/hypnos?${query}`, fetch: fetchFn })
	);
	return { response, body: await response.json() };
}

describe('GET /api/playroom/iq-test/hypnos', () => {
	it('is public, and searches within the given categories', async () => {
		const { response, body } = await get('categories=loop,subliminal');
		expect(response.status).toBe(200);
		expect(body.files.map((f: { name: string }) => f.name)).toEqual(['Bimbo Drone', 'Quiet Sub']);
		expect(body.total).toBe(2);
		expect(response.headers.get('cache-control')).toBe('public, max-age=300');
	});

	it('picks one at random from the matches, uncached, avoiding the one excluded', async () => {
		for (let i = 0; i < 10; i += 1) {
			const { response, body } = await get(
				`categories=loop,subliminal&random=1&exclude=${UUID(1)}`
			);
			expect(body.files).toHaveLength(1);
			expect(body.files[0].name).toBe('Quiet Sub');
			expect(response.headers.get('cache-control')).toBe('no-store');
		}
	});

	it('ignores unknown categories, and filters by query and trigger', async () => {
		expect((await get('categories=evil,music')).body.total).toBe(1);
		expect((await get('q=drone')).body.total).toBe(1);
		expect((await get('trigger=Bambi%20sleep')).body.files[0].name).toBe('Quiet Sub');
	});

	it('caps the page of results, and carries the facets for the drawer', async () => {
		const { body } = await get('limit=2');
		expect(body.files).toHaveLength(2);
		expect(body.total).toBe(4);
		expect(body.triggers).toContainEqual({ name: 'Good girl', count: 1 });
		expect(body.categories).toContainEqual({ id: 'loop', count: 1 });
		expect((await get('limit=500')).body.files.length).toBeLessThanOrEqual(50);
	});

	it('answers nothing to play, rather than an error, with bambicloud down', async () => {
		clearHypnoIndex();
		const down = vi.fn(() => Promise.reject(new TypeError('down')));
		const response = await GET(
			fakeEvent({ user: null, path: '/api/playroom/iq-test/hypnos?random=1', fetch: down })
		);
		expect(response.status).toBe(200);
		expect((await response.json()).files).toEqual([]);
	});
});
