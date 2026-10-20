import { describe, expect, it } from 'vitest';
import { toBase64Url } from '../encryption';
import { type Answer, emptyList, LEVELS, type ListPayload } from './answers';
import { catalog, sidesOf } from './catalog';
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
			spanking: {
				level: 'like',
				note: 'Over the knee',
				detail: { fantasy: 'love', doing: 'like' },
				at
			},
			kissing: {
				sides: { a: { level: 'love' }, b: { level: 'limit', detail: { experience: 0 } } },
				at
			}
		};
		const { list: decoded } = await roundTrip(list({ answers }));
		expect(decoded.answers.spanking).toMatchObject({
			level: 'like',
			note: 'Over the knee',
			detail: { fantasy: 'love', doing: 'like' }
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

	it('carry wholesale limits and a name, but not quick-fill skips', async () => {
		const { list: decoded, name } = await roundTrip(
			list({
				answers: { kissing: { level: 'love', at } },
				triage: { extreme: { value: 'limit', at }, media: { value: 'skip', at } },
				skipped: { tickling: { skipped: true, at } }
			}),
			true,
			'Ada'
		);
		expect(name).toBe('Ada');
		expect(decoded.answers.kissing?.level).toBe('love');
		expect(decoded.triage).toEqual({ extreme: { value: 'limit', at: 0 } });
		expect(decoded.skipped).toEqual({});
	});

	it('stay short enough to paste, even for a list answered all the way through', async () => {
		// Varied answers, each side of a role pair its own: a repeating pattern
		// deflates far better than anyone's real list, and made the bound meaningless.
		let seed = 7;
		const level = () => {
			seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
			return LEVELS[seed % LEVELS.length];
		};
		const answers = Object.fromEntries(
			catalog.items
				.filter((item) => item.parent !== undefined)
				.map((item) => [
					item.id,
					(sidesOf(item)
						? { sides: { a: { level: level() }, b: { level: level() } }, at }
						: { level: level(), at }) as Answer
				])
		);
		const fragment = await encodeShareLink(list({ answers }), { withNotes: true });
		expect(fragment.length).toBeLessThan(3000);
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
