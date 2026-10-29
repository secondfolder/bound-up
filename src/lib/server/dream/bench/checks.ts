/**
 * The bench's automatic checks: free, run on every bench run, and meant to
 * narrow down what a person reads (docs/dreams.md, "Quality tools"). A check
 * that fails says what it saw, never just "failed".
 *
 * Alias-free, for the bench.
 */

import type { Build } from '../../../dream/build';
import { allowedTags } from '../../../dream/capabilities';
import { parseFooter } from '../../../dream/footer';
import { findTag, findTags, parseMarkup, plainText, tagNames } from '../../../dream/markup';
import type { BriefReading } from '../../../dream/reading';
import {
	CLICHES,
	countOccurrences,
	OVERUSED_NAMES,
	repeatedPhrases
} from '../../../dream/repetition';
import type { BenchBrief } from './briefs';

const WHITESPACE = /\s+/;

export type CheckResult = { id: string; ok: boolean; detail: string };

/**
 * How long until the first words of each step may take before the bench
 * flags it: the plan's targets (docs/dreams.md, "Evaluation"). The bench
 * streams, so this is what a user would wait before seeing anything.
 */
export const TIME_TARGETS_MS = { reading: 6000, build: 12_000, passage: 3000 } as const;

export type CheckInput = {
	brief: BenchBrief;
	reading: BriefReading;
	build: Build | null;
	/** Every passage's source, the opening first. */
	passages: readonly string[];
	timings: { reading: number; build: number; passages: readonly number[] };
};

function inRange(value: number, [min, max]: readonly [number, number]): boolean {
	return value >= min && value <= max;
}

function readingChecks({ brief, reading }: CheckInput): CheckResult[] {
	const results: CheckResult[] = [
		{
			id: 'spread-fits-brief',
			ok: inRange(reading.spread.n, brief.expect.spread),
			detail: `spread ${reading.spread.n}, expected ${brief.expect.spread.join('–')}: ${reading.spread.reason || '(no reason given)'}`
		},
		{
			id: 'directions-match-spread',
			ok: reading.directions.length === reading.spread.n,
			detail: `${reading.directions.length} directions for a spread of ${reading.spread.n}`
		},
		{
			id: 'musts-written',
			ok: reading.musts.length > 0,
			detail: reading.musts.join(' | ') || '(none)'
		}
	];
	const wantsUser = brief.expect.pickByUser ?? false;
	results.push({
		id: 'pick-by',
		ok: (reading.pick.by === 'user') === wantsUser,
		detail: `pick by ${reading.pick.by}, expected ${wantsUser ? 'user' : 'code'}`
	});
	return results;
}

function buildChecks({ brief, build }: CheckInput): CheckResult[] {
	if (!build) {
		return [{ id: 'build-parsed', ok: false, detail: 'no build' }];
	}
	const words = build.telling.split(WHITESPACE).filter(Boolean).length;
	return [
		{
			id: 'build-parsed',
			ok: Boolean(build.title && build.telling),
			detail: build.title || '(no title)'
		},
		{
			id: 'structure-fits-brief',
			ok: inRange(build.elements.length, brief.expect.elements),
			detail: `${build.elements.length} elements (${build.elements.map((element) => `${element.type}:${element.name}`).join(', ') || 'none'}), expected ${brief.expect.elements.join('–')}; capabilities: ${build.capabilities.join(', ') || 'none'}`
		},
		{ id: 'telling-length', ok: words <= 300, detail: `${words} words of telling notes` },
		{
			id: 'opening-written',
			ok: Boolean(build.passage),
			detail: build.passage ? 'yes' : 'no <passage>'
		}
	];
}

function passageChecks(build: Build | null, source: string, index: number): CheckResult[] {
	const nodes = parseMarkup(source, { final: true });
	const allowed = allowedTags(build?.capabilities ?? []);
	const unknown = [...tagNames(nodes)].filter((name) => !allowed.has(name));
	const footerTag = findTag(nodes, 'after');
	const footer = footerTag ? parseFooter(plainText(footerTag.children)) : null;
	const asks = findTags(nodes, 'ask').length;
	const bareSets = findTags(nodes, 'set').filter((tag) => tag.children.length === 0).length;
	const label = `passage ${index + 1}`;
	return [
		{
			id: `${label}: only enabled tags`,
			ok: unknown.length === 0,
			detail: unknown.length > 0 ? `not enabled: ${unknown.join(', ')}` : 'ok'
		},
		{
			id: `${label}: footer with next`,
			ok: Boolean(footer?.entries.some((entry) => entry.kind === 'next')),
			detail: footer ? `${footer.entries.length} lines, ${footer.dropped} dropped` : 'no footer'
		},
		{ id: `${label}: at most one question`, ok: asks <= 1, detail: `${asks} questions` },
		{
			id: `${label}: stat changes earned in the text`,
			ok: bareSets === 0,
			detail: bareSets ? `${bareSets} bare <set/> (fine only where no phrase fits)` : 'ok'
		}
	];
}

function proseChecks({ brief, passages }: CheckInput): CheckResult[] {
	const prose = passages.map((source) => plainText(parseMarkup(source, { final: true })));
	const all = prose.join('\n');
	const names = countOccurrences(all, OVERUSED_NAMES);
	const cliches = countOccurrences(all, CLICHES);
	const results: CheckResult[] = [
		{ id: 'no overused names', ok: Object.keys(names).length === 0, detail: JSON.stringify(names) },
		{ id: 'no clichés', ok: Object.keys(cliches).length === 0, detail: JSON.stringify(cliches) }
	];
	// An exact brief may be nothing but repetition, so only the others are checked for it.
	if (!brief.tags.includes('exact')) {
		const repeated = repeatedPhrases(prose).filter((entry) => entry.count >= 3);
		results.push({
			id: 'little repetition',
			ok: repeated.length === 0,
			detail: repeated.map((entry) => `"${entry.phrase}" ×${entry.count}`).join(', ') || 'ok'
		});
	}
	// Counted in the opening only: a Continue after it may rightly carry on.
	const opening = (prose[0] ?? '').toLowerCase();
	for (const [word, expected] of Object.entries(brief.expect.wordCounts ?? {})) {
		const found = (opening.match(new RegExp(`\\b${word}\\b`, 'g')) ?? []).length;
		results.push({
			id: `must: "${word}" ×${expected} in the opening`,
			ok: found === expected,
			detail: `${found}`
		});
	}
	return results;
}

function timingChecks({ timings }: CheckInput): CheckResult[] {
	const slowest = Math.max(0, ...timings.passages);
	return [
		{
			id: 'reading: first words',
			ok: timings.reading <= TIME_TARGETS_MS.reading,
			detail: `${timings.reading} ms`
		},
		{
			id: 'build: first words',
			ok: timings.build <= TIME_TARGETS_MS.build,
			detail: `${timings.build} ms`
		},
		{
			id: 'passage: first words',
			ok: slowest <= TIME_TARGETS_MS.passage,
			detail: `slowest ${slowest} ms`
		}
	];
}

export function runChecks(input: CheckInput): CheckResult[] {
	return [
		...readingChecks(input),
		...buildChecks(input),
		...input.passages.flatMap((source, index) => passageChecks(input.build, source, index)),
		...proseChecks(input),
		...timingChecks(input)
	];
}
