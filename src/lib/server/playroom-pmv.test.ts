import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HypnoFile } from '$lib/playroom/iq-test/hypno';
import { PMV_QUERIES } from '$lib/playroom/iq-test/pmv';
import { clearPmvIndex, PMV_TTL_MS, pmvIndex, withMedia } from './playroom-pmv';

afterEach(() => clearPmvIndex());

const BUCKET = 'https://pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net';

/** A search page with one result per id, as a flat Nuxt payload. */
function searchPage(ids: string[]): string {
	const payload: unknown[] = [];
	for (const id of ids) {
		const base = payload.length;
		payload.push(
			{ _id: base + 1, title: base + 2, hlsMasterPlaylistUrl: base + 3 },
			id,
			`Video ${id}`,
			`${BUCKET}/${'f'.repeat(24)}/master.m3u8`
		);
	}
	return `<script id="__NUXT_DATA__">${JSON.stringify(payload)}</script>`;
}

const id = (n: number) => String(n).padStart(24, '0');

describe('pmvIndex', () => {
	it("builds a vibe's index from its searches, once, without duplicates", async () => {
		const fetchFn = vi.fn(async () => new Response(searchPage([id(1), id(2)])));
		const files = await pmvIndex('gooner', fetchFn, 0);
		expect(files.map((file) => file.uuid)).toEqual([id(1), id(2)]);
		expect(fetchFn).toHaveBeenCalledTimes(PMV_QUERIES.gooner.length);

		await pmvIndex('gooner', fetchFn, 1000);
		expect(fetchFn).toHaveBeenCalledTimes(PMV_QUERIES.gooner.length);
		await pmvIndex('gooner', fetchFn, PMV_TTL_MS + 1);
		expect(fetchFn).toHaveBeenCalledTimes(PMV_QUERIES.gooner.length * 2);
	});

	it('serves the last good index when PMVHaven fails', async () => {
		await pmvIndex(
			'denial',
			vi.fn(async () => new Response(searchPage([id(3)]))),
			0
		);
		const failing = vi.fn(async () => new Response('', { status: 503 }));
		const files = await pmvIndex('denial', failing, PMV_TTL_MS + 1);
		expect(files.map((file) => file.uuid)).toEqual([id(3)]);
	});
});

describe('withMedia', () => {
	const file: HypnoFile = {
		source: 'pmvhaven',
		pageUrl: `https://pmvhaven.com/video/${id(1)}`,
		uuid: id(1),
		name: 'x',
		author: '',
		durationMs: 0,
		fileType: 'pmv',
		triggers: [],
		description: '',
		warnings: [],
		mediaUrl: '',
		plays: 0
	};
	const mp4 = `${BUCKET}/${'f'.repeat(24)}/x.mp4`;
	const videoPage = `<script id="__NUXT_DATA__">${JSON.stringify([{ _id: 1, videoUrl: 2 }, id(1), mp4])}</script>`;

	it("reads a file from the video's page, once", async () => {
		const fetchFn = vi.fn(async () => new Response(videoPage));
		expect((await withMedia(file, fetchFn))?.mediaUrl).toBe(mp4);
		expect((await withMedia(file, fetchFn))?.mediaUrl).toBe(mp4);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(fetchFn).toHaveBeenCalledWith(`https://pmvhaven.com/video/${id(1)}`, expect.anything());
	});

	it('leaves a file it already has alone, and gives up on a page without one', async () => {
		const fetchFn = vi.fn(async () => new Response('<html></html>'));
		expect(await withMedia({ ...file, mediaUrl: mp4 }, fetchFn)).toMatchObject({ mediaUrl: mp4 });
		expect(fetchFn).not.toHaveBeenCalled();
		expect(await withMedia(file, fetchFn)).toBeNull();
	});
});
