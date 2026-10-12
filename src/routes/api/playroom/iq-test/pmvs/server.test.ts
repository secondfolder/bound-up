import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPmvIndex } from '$lib/server/playroom-pmv';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { GET } from './+server';
import { GET as GET_ONE } from './[id]/+server';

afterEach(() => clearPmvIndex());

const BUCKET = 'https://pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net';
const id = (n: number) => String(n).padStart(24, '0');

/** One search result whose file has to be looked up, and that lookup's page. */
const SEARCH = `<script id="__NUXT_DATA__">${JSON.stringify([
	{ _id: 1, title: 2, hlsMasterPlaylistUrl: 3, hasVoiceOver: 4 },
	id(1),
	'Gooning encouragement',
	`${BUCKET}/${'f'.repeat(24)}/master.m3u8`,
	true
])}</script>`;
const MP4 = `${BUCKET}/${'f'.repeat(24)}/encouragement.mp4`;
const VIDEO = `<script id="__NUXT_DATA__">${JSON.stringify([{ _id: 1, videoUrl: 2 }, id(1), MP4])}</script>`;

function pmvhaven() {
	return vi.fn(
		async (input: RequestInfo | URL) =>
			new Response(String(input).includes('/video/') ? VIDEO : SEARCH)
	);
}

describe('GET /api/playroom/iq-test/pmvs', () => {
	it("picks one at random from the vibe's videos, with its file looked up", async () => {
		const fetchFn = pmvhaven();
		const response = await GET(
			fakeEvent({
				user: null,
				path: '/api/playroom/iq-test/pmvs?vibe=gooner&random=1',
				fetch: fetchFn
			})
		);
		const body = (await response.json()) as { files: { uuid: string; mediaUrl: string }[] };
		expect(body.files).toEqual([expect.objectContaining({ uuid: id(1), mediaUrl: MP4 })]);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('refuses an unknown vibe, so it cannot be pointed at anything else', async () => {
		const fetchFn = pmvhaven();
		const outcome = await runAndCatch(() =>
			GET(
				fakeEvent({ user: null, path: '/api/playroom/iq-test/pmvs?vibe=https://x', fetch: fetchFn })
			)
		);
		expect(outcome).toMatchObject({ type: 'error', status: 400 });
		expect(fetchFn).not.toHaveBeenCalled();
	});
});

describe('GET /api/playroom/iq-test/pmvs/[id]', () => {
	it("looks up the file of a video in the vibe's index", async () => {
		const response = await GET_ONE(
			fakeEvent({
				user: null,
				path: `/api/playroom/iq-test/pmvs/${id(1)}?vibe=gooner`,
				params: { id: id(1) },
				fetch: pmvhaven()
			})
		);
		expect(await response.json()).toMatchObject({ uuid: id(1), mediaUrl: MP4 });
	});

	it('never looks up an id that is not in the index', async () => {
		const fetchFn = pmvhaven();
		const outcome = await runAndCatch(() =>
			GET_ONE(
				fakeEvent({
					user: null,
					path: `/api/playroom/iq-test/pmvs/${id(2)}?vibe=gooner`,
					params: { id: id(2) },
					fetch: fetchFn
				})
			)
		);
		expect(outcome).toMatchObject({ type: 'error', status: 404 });
		expect(fetchFn.mock.calls.some(([url]) => String(url).includes('/video/'))).toBe(false);
	});
});
