import { z } from 'zod';
import { fromBase64Url, toBase64Url } from '../encryption';
import {
	type Answer,
	type CustomKink,
	DETAIL_KEYS,
	DETAIL_MAX,
	type Detail,
	emptyList,
	LEVELS,
	type Level,
	type ListPayload,
	MAX_CUSTOM_DESCRIPTION_LENGTH,
	MAX_CUSTOM_NAME_LENGTH,
	MAX_NOTE_LENGTH,
	newCustomKey,
	type Side
} from './answers';
import { kinkById, SHARE_IDS } from './catalog';

/**
 * A kink list as a link: `/kink-list/shared#k1.<data>`. See docs/kink-list.md,
 * "Sharing".
 *
 * The answers ride in the URL's fragment, which a browser never sends to a
 * server, so a shared list is never seen by this one, or written to a log on
 * the way. `<data>` is the list, compacted to share-ids.json's numbering and
 * short keys, deflated and base64url'd.
 *
 * - **`k1`** is the format. A change to the shape gets `k2`, and readers keep
 *   reading every format ever written, as they do for sealed records.
 * - **Kinks are numbered by `share-ids.json`**, which is append-only, so a link
 *   made today still decodes after kinks are added. A number this build does
 *   not know is dropped rather than failing the whole link.
 * - **Only answers travel**, with their notes when the person chooses, plus
 *   custom kinks and categories limited wholesale (which change what other
 *   kinks show). Quick-fill skips, the filters and your side stay on the device.
 *
 * Decoding treats the link as untrusted input: it is parsed with Zod, never
 * cast.
 */

export const SHARE_PREFIX = 'k1.';

const LEADING_HASH = /^#/;

const level = z
	.number()
	.int()
	.min(0)
	.max(LEVELS.length - 1);
const step = z.number().int().min(0).max(DETAIL_MAX);
/** Fantasy and doing as levels, then experience as a step, in order; `null` for unset. */
const detail = z.tuple([level.nullable(), level.nullable(), step.nullable()]);
const side = z.object({ l: level.optional(), d: detail.optional() });
const shared = z.object({
	l: level.optional(),
	a: side.optional(),
	b: side.optional(),
	d: detail.optional(),
	n: z.string().max(MAX_NOTE_LENGTH).optional()
});

const shareSchema = z.object({
	/** Answers by share-ids.json number. */
	a: z.record(z.string().regex(/^\d+$/), shared).optional(),
	/** Custom kinks: name, category id, optional description, and their answer. */
	c: z
		.array(
			z.tuple([
				z.string().min(1).max(MAX_CUSTOM_NAME_LENGTH),
				z.string(),
				z.string().max(MAX_CUSTOM_DESCRIPTION_LENGTH),
				shared
			])
		)
		.max(200)
		.optional(),
	/** Categories limited wholesale, by share-ids.json number. */
	t: z.array(z.number().int().nonnegative()).optional(),
	/** The name the list is shared under, if any. */
	w: z.string().max(60).optional()
});
type Shared = z.output<typeof shared>;

const INDEX = new Map(SHARE_IDS.map((id, index) => [id, index]));

function packDetail(value: Detail | undefined): z.output<typeof detail> | undefined {
	if (!value || DETAIL_KEYS.every((key) => value[key] === undefined)) {
		return undefined;
	}
	return [
		packLevel(value.fantasy) ?? null,
		packLevel(value.doing) ?? null,
		value.experience ?? null
	];
}

function unpackDetail(value: z.output<typeof detail> | undefined): Detail | undefined {
	if (!value) {
		return undefined;
	}
	const [fantasy, doing, experience] = value;
	return {
		fantasy: fantasy === null ? undefined : LEVELS[fantasy],
		doing: doing === null ? undefined : LEVELS[doing],
		experience: experience ?? undefined
	};
}

function packLevel(value: Level | undefined): number | undefined {
	return value === undefined ? undefined : LEVELS.indexOf(value);
}

function packSide(value: Side | undefined): z.output<typeof side> | undefined {
	if (!value || (value.level === undefined && !packDetail(value.detail))) {
		return undefined;
	}
	return { l: packLevel(value.level), d: packDetail(value.detail) };
}

function pack(answer: Answer, withNotes: boolean): Shared | null {
	const packed: Shared = {
		l: packLevel(answer.level),
		a: packSide(answer.sides?.a),
		b: packSide(answer.sides?.b),
		d: packDetail(answer.detail),
		n: withNotes && answer.note ? answer.note : undefined
	};
	const kept = Object.fromEntries(
		Object.entries(packed).filter(([, value]) => value !== undefined)
	) as Shared;
	return Object.keys(kept).length > 0 ? kept : null;
}

function unpackSide(value: z.output<typeof side> | undefined): Side | undefined {
	if (!value) {
		return undefined;
	}
	return {
		level: value.l === undefined ? undefined : LEVELS[value.l],
		detail: unpackDetail(value.d)
	};
}

function unpack(value: Shared): Answer {
	const a = unpackSide(value.a);
	const b = unpackSide(value.b);
	return {
		level: value.l === undefined ? undefined : LEVELS[value.l],
		sides: a || b ? { a, b } : undefined,
		detail: unpackDetail(value.d),
		note: value.n,
		// A shared list is a snapshot: merging it anywhere loses to any answer
		// made since, which is what "the list I already have" should mean.
		at: 0
	};
}

async function transform(
	bytes: Uint8Array<ArrayBuffer>,
	stream: CompressionStream | DecompressionStream
) {
	const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
	return new Uint8Array(await response.arrayBuffer());
}

/** The link's fragment, without the `#`, for a list. */
export async function encodeShareLink(
	list: ListPayload,
	options: { withNotes: boolean; name?: string }
): Promise<string> {
	const answers: Record<string, Shared> = {};
	const custom: z.output<typeof shareSchema>['c'] = [];
	for (const [key, answer] of Object.entries(list.answers)) {
		const index = INDEX.get(key);
		const packed = pack(answer, options.withNotes);
		if (index !== undefined && packed) {
			answers[String(index)] = packed;
		}
	}
	for (const [key, kink] of Object.entries(list.custom) as [string, CustomKink][]) {
		const answer = list.answers[key];
		const packed = answer ? pack(answer, options.withNotes) : null;
		if (!kink.removed && packed) {
			custom.push([kink.name, kink.categoryId, kink.description ?? '', packed]);
		}
	}
	const limits = Object.entries(list.triage)
		.filter(([, entry]) => entry.value === 'limit')
		.map(([id]) => INDEX.get(id))
		.filter((index): index is number => index !== undefined);
	const body: z.input<typeof shareSchema> = {
		a: answers,
		...(custom.length > 0 ? { c: custom } : {}),
		...(limits.length > 0 ? { t: limits } : {}),
		...(options.name?.trim() ? { w: options.name.trim().slice(0, 60) } : {})
	};
	const bytes = new TextEncoder().encode(JSON.stringify(body));
	return SHARE_PREFIX + toBase64Url(await transform(bytes, new CompressionStream('deflate-raw')));
}

export type SharedList = { list: ListPayload; name?: string };

/** The list a link's fragment carries, or null for anything that is not one. */
export async function decodeShareLink(fragment: string): Promise<SharedList | null> {
	const data = fragment.replace(LEADING_HASH, '');
	if (!data.startsWith(SHARE_PREFIX)) {
		return null;
	}
	let parsed: z.output<typeof shareSchema>;
	try {
		const inflated = await transform(
			fromBase64Url(data.slice(SHARE_PREFIX.length)),
			new DecompressionStream('deflate-raw')
		);
		const result = shareSchema.safeParse(JSON.parse(new TextDecoder().decode(inflated)));
		if (!result.success) {
			return null;
		}
		parsed = result.data;
	} catch {
		return null;
	}
	const list = emptyList();
	for (const [index, value] of Object.entries(parsed.a ?? {})) {
		const id = SHARE_IDS[Number(index)];
		if (id && kinkById(id)) {
			list.answers[id] = unpack(value);
		}
	}
	for (const [name, categoryId, description, value] of parsed.c ?? []) {
		const category = kinkById(categoryId);
		if (!category || category.parent !== undefined) {
			continue;
		}
		const key = newCustomKey();
		list.custom[key] = { name, categoryId, description: description || undefined, at: 0 };
		list.answers[key] = unpack(value);
	}
	for (const index of parsed.t ?? []) {
		const id = SHARE_IDS[index];
		if (id && kinkById(id)?.parent === undefined) {
			list.triage[id] = { value: 'limit', at: 0 };
		}
	}
	return { list, name: parsed.w };
}
