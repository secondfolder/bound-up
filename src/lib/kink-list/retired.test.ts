import { describe, expect, it, vi } from 'vitest';
import {
	RETIRED_CATEGORY,
	RETIRED_CATEGORY_KINKS,
	RETIRED_KINK,
	RETIRED_ON
} from '$lib/testing/retired-kink';
import { toBase64Url } from '../encryption';
import {
	type Answer,
	answeredCount,
	emptyList,
	type ListPayload,
	listPayloadSchema,
	normaliseAnswers
} from './answers';
import {
	categories,
	childrenOf,
	isRetired,
	kinkById,
	kinkByShare,
	liveKinkById,
	relatedKinks,
	searchKinks
} from './catalog';
import { deckReview } from './deck';
import { changesBetween } from './history';
import { exportCsv, exportJson, importCsv, importList, readExportJson } from './import/files';
import { differences, emptyPartnerPayload, resolvedFor } from './partner';
import { decodeShareLink, encodeShareLink, SHARE_PREFIX } from './share-link';

// One real kink retired, in this file only: see $lib/testing/retired-kink.
vi.mock('./catalog.json', async (original) =>
	(await import('$lib/testing/retired-kink')).withRetiredKink(await original())
);

const at = 4;

/** A role kink's answer, with each side different, so losing a side shows. */
const twoSided: Answer = { sides: { a: { level: 'love' }, b: { level: 'limit' } }, at };

function list(answers: Record<string, Answer>, fields: Partial<ListPayload> = {}): ListPayload {
	return { ...emptyList(), answers, ...fields };
}

function retired() {
	const item = kinkById(RETIRED_KINK);
	if (!(item?.parent && isRetired(item))) {
		throw new Error(`"${RETIRED_KINK}" should be retired by the mock`);
	}
	return { item, parent: item.parent };
}

describe('a retired kink', () => {
	it('stays in the catalogue by id, and nowhere a list is browsed or searched', () => {
		const { item, parent } = retired();
		expect(item.retiredOn).toBe(RETIRED_ON);
		expect(liveKinkById(RETIRED_KINK)).toBeUndefined();
		expect(kinkByShare(item.share)).toBeUndefined();
		expect(childrenOf(parent).map((child) => child.id)).not.toContain(RETIRED_KINK);
		expect(searchKinks(item.name).map((found) => found.id)).not.toContain(RETIRED_KINK);
		for (const category of item.alsoUnder ?? []) {
			expect(relatedKinks(category).map((found) => found.id)).not.toContain(RETIRED_KINK);
		}
	});

	it('keeps both sides of its answer, which an unknown id would lose', () => {
		const answers = normaliseAnswers({ [RETIRED_KINK]: twoSided });
		expect(answers[RETIRED_KINK]?.sides).toEqual(twoSided.sides);
		const parsed = listPayloadSchema.parse(list({ [RETIRED_KINK]: twoSided }));
		expect(parsed.answers[RETIRED_KINK]?.sides).toEqual(twoSided.sides);
	});

	it('is not counted as answered, or offered in the quick-fill review', () => {
		const answered = list(
			{ [RETIRED_KINK]: twoSided, spanking: { level: 'limit', at } },
			{ skipped: { [RETIRED_KINK]: { skipped: true, at } } }
		);
		expect(answeredCount(answered)).toBe(1);
		const review = deckReview(answered);
		expect(review.limits).toEqual(['spanking']);
		expect(review.skipped).toEqual([]);
	});

	it('is left out of a share link, and dropped from an old one that has it', async () => {
		const fragment = await encodeShareLink(
			list({ [RETIRED_KINK]: twoSided, spanking: { level: 'like', at } }),
			{ withNotes: true }
		);
		const decoded = await decodeShareLink(`#${fragment}`);
		expect(Object.keys(decoded?.list.answers ?? {})).toEqual(['spanking']);

		// A link made before it was retired, carrying its number.
		const { item } = retired();
		const body = new TextEncoder().encode(JSON.stringify({ a: { [item.share]: { l: 6 } } }));
		const deflated = new Uint8Array(
			await new Response(
				new Blob([body]).stream().pipeThrough(new CompressionStream('deflate-raw'))
			).arrayBuffer()
		);
		const old = await decodeShareLink(`#${SHARE_PREFIX}${toBase64Url(deflated)}`);
		expect(old?.list.answers).toEqual({});
	});

	it('is left out of both exports', () => {
		const answered = list(
			{ [RETIRED_KINK]: { level: 'love', note: 'Retired', at }, spanking: { level: 'like', at } },
			{ skipped: { [RETIRED_KINK]: { skipped: true, at } } }
		);
		const json = readExportJson(exportJson(answered));
		expect(Object.keys(json?.answers ?? {})).toEqual(['spanking']);
		expect(json?.skipped).toEqual({});
		expect(exportCsv(answered)).not.toContain(RETIRED_KINK);
	});

	it('is listed as not matching in an old export, rather than written where nothing shows it', () => {
		const { item } = retired();
		const fromJson = importList(list({ [RETIRED_KINK]: twoSided }), 'an export');
		expect(fromJson.answers).toEqual({});
		expect(fromJson.unmatched).toMatchObject([
			{ name: item.name, answer: { sides: twoSided.sides } }
		]);

		// Our own CSV, from before it was retired: written for a live kink and relabelled.
		const csv = exportCsv(list({ spanking: { level: 'like', at } })).replaceAll(
			'spanking',
			RETIRED_KINK
		);
		const fromCsv = importCsv(csv);
		expect(fromCsv?.answers).toEqual({});
		expect(fromCsv?.unmatched).toHaveLength(1);
	});

	it('is never sent to a partner, or listed as answered just for them', () => {
		const own = list({ [RETIRED_KINK]: twoSided, spanking: { level: 'like', at } });
		const partner = {
			...emptyPartnerPayload(),
			overrides: { [RETIRED_KINK]: { level: 'like', at } as Answer }
		};
		expect(Object.keys(resolvedFor(own, partner).answers)).toEqual(['spanking']);
		expect(differences(own, partner)).toEqual([]);
	});

	it('shows in history for changes before it was retired, and not after', () => {
		const before = list({});
		const after = list({ [RETIRED_KINK]: twoSided });
		const earlier = new Date(`${RETIRED_ON}T00:00:00`);
		earlier.setDate(earlier.getDate() - 3);
		const changed = changesBetween(before, after, earlier);
		expect(changed['more-into'].map((change) => change.key)).toContain(RETIRED_KINK);
		expect(changed['new-limits'].map((change) => change.key)).toContain(RETIRED_KINK);

		const since = new Date(`${RETIRED_ON}T09:00:00`);
		const later = changesBetween(before, after, since);
		expect(later['more-into']).toEqual([]);
		expect(later['new-limits']).toEqual([]);
	});
});

describe('a retired category', () => {
	it('is gone from the list with every kink in it', () => {
		expect(categories().map((category) => category.id)).not.toContain(RETIRED_CATEGORY);
		expect(kinkById(RETIRED_CATEGORY)?.retiredOn).toBe(RETIRED_ON);
		for (const id of RETIRED_CATEGORY_KINKS) {
			expect(liveKinkById(id)).toBeUndefined();
		}
	});

	it('takes its answers out of counts and its wholesale limit out of share links', async () => {
		const [kink = ''] = RETIRED_CATEGORY_KINKS;
		const answered = list(
			{ [kink]: { level: 'love', at }, spanking: { level: 'like', at } },
			{ triage: { [RETIRED_CATEGORY]: { value: 'limit', at }, extreme: { value: 'limit', at } } }
		);
		expect(answeredCount(answered)).toBe(1);
		expect(deckReview(answered).limitCategories).toEqual(['extreme']);
		const decoded = await decodeShareLink(
			`#${await encodeShareLink(answered, { withNotes: true })}`
		);
		expect(Object.keys(decoded?.list.answers ?? {})).toEqual(['spanking']);
		expect(Object.keys(decoded?.list.triage ?? {})).toEqual(['extreme']);
	});
});
