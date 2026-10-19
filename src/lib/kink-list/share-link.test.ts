import { describe, expect, it } from 'vitest';
import { toBase64Url } from '../encryption';
import { type Answer, emptyList, type ListPayload, newCustomKey } from './answers';
import { catalog } from './catalog';
import { decodeShareLink, encodeShareLink, SHARE_PREFIX } from './share-link';

const at = 5;

function list(fields: Partial<ListPayload> = {}): ListPayload {
	return { ...emptyList(), ...fields };
}

async function roundTrip(source: ListPayload, withNotes = true, name?: string) {
	const fragment = await encodeShareLink(source, { withNotes, name });
	if (!fragment.startsWith(SHARE_PREFIX)) {
		throw new Error(`not a k1 link: ${fragment.slice(0, 10)}`);
	}
	const decoded = await decodeShareLink(`#${fragment}`);
	if (!decoded) {
		throw new Error('did not decode');
	}
	return decoded;
}

describe('share links', () => {
	it('carry levels, sides, the detailed answer and notes', async () => {
		const answers: Record<string, Answer> = {
			spanking: { level: 'like', note: 'Over the knee', detail: { fantasy: 4, doing: 2 }, at },
			kissing: {
				sides: { a: { level: 'love' }, b: { level: 'limit', detail: { experience: 0 } } },
				at
			}
		};
		const { list: decoded } = await roundTrip(list({ answers }));
		expect(decoded.answers.spanking).toMatchObject({
			level: 'like',
			note: 'Over the knee',
			detail: { fantasy: 4, doing: 2 }
		});
		expect(decoded.answers.kissing?.sides?.a?.level).toBe('love');
		expect(decoded.answers.kissing?.sides?.b).toMatchObject({
			level: 'limit',
			detail: { experience: 0 }
		});
	});

	it('leave notes out when asked to', async () => {
		const answers: Record<string, Answer> = { spanking: { level: 'like', note: 'Secret', at } };
		const { list: decoded } = await roundTrip(list({ answers }), false);
		expect(decoded.answers.spanking?.note).toBeUndefined();
		expect(decoded.answers.spanking?.level).toBe('like');
	});

	it('carry custom kinks, wholesale limits and a name, but not quick-fill skips', async () => {
		const key = newCustomKey();
		const { list: decoded, name } = await roundTrip(
			list({
				answers: { [key]: { level: 'love', at } },
				custom: { [key]: { name: 'Being read to', categoryId: 'intimacy', at } },
				triage: { extreme: { value: 'limit', at }, media: { value: 'skip', at } },
				skipped: { tickling: { skipped: true, at } }
			}),
			true,
			'Ada'
		);
		expect(name).toBe('Ada');
		const [newKey, kink] = Object.entries(decoded.custom)[0] ?? [];
		expect(kink).toMatchObject({ name: 'Being read to', categoryId: 'intimacy' });
		expect(newKey && decoded.answers[newKey]?.level).toBe('love');
		expect(decoded.triage).toEqual({ extreme: { value: 'limit', at: 0 } });
		expect(decoded.skipped).toEqual({});
	});

	it('stay short enough to paste, even for a list answered all the way through', async () => {
		const answers = Object.fromEntries(
			catalog.items.map((item, index) => [
				item.id,
				{ level: index % 2 ? 'like' : 'limit', at } as Answer
			])
		);
		const fragment = await encodeShareLink(list({ answers }), { withNotes: true });
		expect(fragment.length).toBeLessThan(4000);
	});

	it('refuse anything that is not one, rather than throwing', async () => {
		expect(await decodeShareLink('#nothing')).toBeNull();
		expect(await decodeShareLink(`#${SHARE_PREFIX}not-deflate`)).toBeNull();
		const notAList = toBase64Url(new TextEncoder().encode('{"a":5}'));
		expect(await decodeShareLink(`#${SHARE_PREFIX}${notAList}`)).toBeNull();
	});

	it('drop a kink number this build does not know, keeping the rest', async () => {
		const body = JSON.stringify({ a: { '0': { l: 5 }, '999999': { l: 6 } } });
		const stream = new Blob([new TextEncoder().encode(body)])
			.stream()
			.pipeThrough(new CompressionStream('deflate-raw'));
		const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
		const decoded = await decodeShareLink(`#${SHARE_PREFIX}${toBase64Url(bytes)}`);
		expect(Object.keys(decoded?.list.answers ?? {})).toHaveLength(1);
	});
});
