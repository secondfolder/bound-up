import {
	type Axis,
	type Catalogue,
	type CatalogueParagraph,
	type Combo,
	type LintFinding,
	PARAGRAPH_BREAK,
	type RenderedPrompt
} from '$lib/prompt-review';
import { type Builder, baselineCombo, comboLabel } from './axes';
import { lintStructure, lintText } from './lint';
import { promptText, renderPrompt } from './render';

/**
 * Every prompt a builder can send, and the paragraphs they are made of
 * (docs/prompt-review.md).
 *
 * The combinations are the product of the structural axes, each with the
 * descriptive axes at their baseline, plus each descriptive value swept from
 * the baseline combination. Identical renders are one distinct prompt; a
 * paragraph (text between blank lines) is one piece of wording however many
 * prompts it is in, which is what makes the lot reviewable: a few hundred
 * paragraphs rather than thousands of prompts.
 */

/** A short, stable id for a text: cyrb53, so it needs no `node:crypto` and runs anywhere. */
export function textHash(text: string): string {
	let h1 = 0xde_ad_be_ef;
	let h2 = 0x41_c6_ce_57;
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		h1 = Math.imul(h1 ^ code, 2_654_435_761);
		h2 = Math.imul(h2 ^ code, 1_597_334_677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507) ^ Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507) ^ Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
	return (4_294_967_296 * (2_097_151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** The product of some axes' values, every other axis at its baseline. */
export function productOf(builder: Builder, axes: readonly Axis[]): Combo[] {
	let combos: Combo[] = [baselineCombo(builder)];
	for (const entry of axes) {
		combos = combos.flatMap((combo) =>
			entry.values.map((value) => ({ ...combo, [entry.id]: value.id }))
		);
	}
	return combos;
}

export const structuralAxes = (builder: Builder) =>
	builder.axes.filter((entry) => entry.kind === 'structural');

export const descriptiveAxes = (builder: Builder) =>
	builder.axes.filter((entry) => entry.kind === 'descriptive');

/** Each descriptive axis's other values, one at a time, on the baseline combination. */
export function sweeps(builder: Builder): { axis: Axis; value: string; combo: Combo }[] {
	const baseline = baselineCombo(builder);
	return builder.axes.flatMap((entry) =>
		entry.values
			.filter((value) => value.id !== entry.baseline)
			.map((value) => ({
				axis: entry,
				value: value.id,
				combo: { ...baseline, [entry.id]: value.id }
			}))
	);
}

/** A prompt's paragraphs: each message's text between blank lines, with the message's role. */
export function paragraphsOf(prompt: RenderedPrompt): { role: string; text: string }[] {
	return prompt.messages.flatMap((message) =>
		message.content
			.split(PARAGRAPH_BREAK)
			// Untrimmed, so lint still sees a space left at either end.
			.filter((text) => text.trim() !== '')
			.map((text) => ({ role: message.role, text }))
	);
}

export type RenderedCombo = { combo: Combo; prompt: RenderedPrompt; text: string };

/** Every combination the catalogue covers, rendered; the invalid ones counted by reason. */
export function renderAll(builder: Builder): {
	structural: RenderedCombo[];
	swept: (RenderedCombo & { axis: string; value: string })[];
	invalid: Map<string, number>;
} {
	const invalid = new Map<string, number>();
	const render = (combo: Combo): RenderedCombo | null => {
		const result = renderPrompt(builder.id, combo);
		if (!result.ok) {
			invalid.set(result.problem, (invalid.get(result.problem) ?? 0) + 1);
			return null;
		}
		return { combo, prompt: result.prompt, text: promptText(result.prompt) };
	};
	const structural = productOf(builder, structuralAxes(builder)).flatMap(
		(combo) => render(combo) ?? []
	);
	const swept = sweeps(builder)
		.filter(({ axis }) => axis.kind === 'descriptive')
		.flatMap(({ axis, value, combo }) => {
			const rendered = render(combo);
			return rendered ? [{ ...rendered, axis: axis.id, value }] : [];
		});
	return { structural, swept, invalid };
}

/** The values each axis takes across some combinations. */
function valuesSeen(axes: readonly Axis[], combos: readonly Combo[]): Map<string, Set<string>> {
	const seen = new Map(axes.map((entry) => [entry.id, new Set<string>()]));
	for (const combo of combos) {
		for (const entry of axes) {
			seen.get(entry.id)?.add(combo[entry.id] ?? '');
		}
	}
	return seen;
}

export function buildCatalogue(builder: Builder): Catalogue {
	const { structural, swept, invalid } = renderAll(builder);
	const baseline = baselineCombo(builder);
	const baselineRender = renderPrompt(builder.id, baseline);
	if (!baselineRender.ok) {
		throw new Error(
			`The "${builder.id}" baseline is not a valid request (${baselineRender.problem}): change an axis's baseline in axes.ts`
		);
	}

	const sAxes = structuralAxes(builder);
	const dAxes = descriptiveAxes(builder);
	const possible = valuesSeen(
		sAxes,
		structural.map(({ combo }) => combo)
	);

	type Gathered = { text: string; roles: Set<string>; combos: Combo[]; swept: Combo[] };
	const gathered = new Map<string, Gathered>();
	const gather = (rendered: RenderedCombo, from: 'combos' | 'swept') => {
		for (const { role, text } of paragraphsOf(rendered.prompt)) {
			const entry = gathered.get(text) ?? { text, roles: new Set(), combos: [], swept: [] };
			entry.roles.add(role);
			const list = entry[from];
			if (list.at(-1) !== rendered.combo) {
				list.push(rendered.combo);
			}
			gathered.set(text, entry);
		}
	};
	for (const rendered of structural) {
		gather(rendered, 'combos');
	}
	for (const rendered of swept) {
		gather(rendered, 'swept');
	}

	const baselineParagraphs = new Set(paragraphsOf(baselineRender.prompt).map(({ text }) => text));
	const sweptTexts = swept.map((entry) => ({
		...entry,
		texts: new Set(paragraphsOf(entry.prompt).map(({ text }) => text))
	}));
	const sweptPresence = (text: string, axisId: string) =>
		sweptTexts.filter((entry) => entry.axis === axisId && entry.texts.has(text));

	const paragraphs = [...gathered.values()].map((entry): CatalogueParagraph => {
		const conditions: Record<string, string[]> = {};
		if (entry.combos.length > 0) {
			const seen = valuesSeen(sAxes, entry.combos);
			for (const axisEntry of sAxes) {
				const values = seen.get(axisEntry.id) ?? new Set();
				if (values.size < (possible.get(axisEntry.id)?.size ?? 0)) {
					conditions[axisEntry.id] = axisEntry.values
						.map((value) => value.id)
						.filter((id) => values.has(id));
				}
			}
		}
		// A descriptive axis it depends on: present at the baseline but gone
		// for some swept values, or brought in by some.
		for (const axisEntry of dAxes) {
			const present = new Set(sweptPresence(entry.text, axisEntry.id).map((s) => s.value));
			if (baselineParagraphs.has(entry.text)) {
				present.add(axisEntry.baseline);
			}
			if (present.size > 0 && present.size < axisEntry.values.length) {
				conditions[axisEntry.id] = axisEntry.values
					.map((value) => value.id)
					.filter((id) => present.has(id));
			}
		}
		return {
			id: textHash(entry.text),
			text: entry.text,
			roles: [...entry.roles].sort(),
			count: entry.combos.length,
			conditions,
			sweptOnly: entry.combos.length === 0,
			example: entry.combos[0] ?? entry.swept[0] ?? baseline
		};
	});

	const findings = new Map<string, LintFinding & { count: number; example: Combo }>();
	const distinct = new Map<string, RenderedCombo>();
	for (const rendered of [...structural, ...swept]) {
		if (!distinct.has(rendered.text)) {
			distinct.set(rendered.text, rendered);
		}
	}
	const note = (finding: LintFinding, times: number, example: Combo) => {
		const key = `${finding.rule}\u0000${finding.excerpt}`;
		const existing = findings.get(key);
		if (existing) {
			existing.count += times;
		} else {
			findings.set(key, { ...finding, count: times, example });
		}
	};
	for (const paragraph of paragraphs) {
		for (const finding of lintText(paragraph.text)) {
			note(finding, Math.max(paragraph.count, 1), paragraph.example);
		}
	}
	for (const rendered of distinct.values()) {
		for (const finding of lintStructure(rendered.prompt)) {
			note(finding, 1, rendered.combo);
		}
	}

	return {
		builder: {
			id: builder.id,
			label: builder.label,
			description: builder.description,
			axes: builder.axes
		},
		baseline: { combo: baseline, text: promptText(baselineRender.prompt) },
		structuralTotal: structural.length,
		invalid: [...invalid]
			.map(([problem, count]) => ({ problem, count }))
			.sort((a, b) => b.count - a.count || a.problem.localeCompare(b.problem)),
		distinctPrompts: distinct.size,
		// In the order they were first met, which is the order prompts put them in.
		paragraphs,
		lint: [...findings.values()].sort(
			(a, b) => a.rule.localeCompare(b.rule) || a.excerpt.localeCompare(b.excerpt)
		)
	};
}

/** The lines one text adds and drops against another, as a sorted list: what a change does. */
function lineDelta(before: string, after: string): string {
	const counts = new Map<string, number>();
	for (const line of before.split('\n')) {
		counts.set(line, (counts.get(line) ?? 0) - 1);
	}
	for (const line of after.split('\n')) {
		counts.set(line, (counts.get(line) ?? 0) + 1);
	}
	return [...counts]
		.filter(([, n]) => n !== 0)
		.map(([line, n]) => `${n > 0 ? '+' : '-'}${Math.abs(n)} ${line}`)
		.sort((a, b) => a.localeCompare(b))
		.join('\n');
}

/**
 * Where a descriptive axis does not behave like one: for some structural
 * combination, changing it adds or drops other lines than it does from the
 * baseline. Only then would the sweep (`sweeps`) miss a prompt the product
 * of every axis has, so an empty answer is what makes the catalogue
 * complete. A change that does nothing in a combination — a character's
 * dials with no characters — is fine: there is nothing unseen.
 *
 * `every` samples the structural combinations: every one of the replies'
 * 20,000-odd would take minutes. `catalogueGaps` in export.ts is what runs it.
 */
export function interactionProblems(builder: Builder, every = 1): string[] {
	const problems: string[] = [];
	const baseline = baselineCombo(builder);
	const textOf = (combo: Combo) => {
		const result = renderPrompt(builder.id, combo);
		return result.ok ? promptText(result.prompt) : null;
	};
	const baselineText = textOf(baseline);
	if (baselineText === null) {
		return ['the baseline is not a valid request'];
	}
	const combos = productOf(builder, structuralAxes(builder)).filter(
		(_, index) => index % every === 0
	);
	const texts = combos.map((combo) => ({ combo, text: textOf(combo) }));
	for (const axisEntry of descriptiveAxes(builder)) {
		for (const value of axisEntry.values) {
			if (value.id === axisEntry.baseline) {
				continue;
			}
			const sweptText = textOf({ ...baseline, [axisEntry.id]: value.id });
			if (sweptText === null) {
				problems.push(`${axisEntry.id}=${value.id} is not a valid request from the baseline`);
				continue;
			}
			const expected = lineDelta(baselineText, sweptText);
			for (const { combo, text } of texts) {
				if (text === null) {
					continue;
				}
				const changed = textOf({ ...combo, [axisEntry.id]: value.id });
				const delta = changed === null ? null : lineDelta(text, changed);
				if (delta !== '' && delta !== expected) {
					problems.push(
						`${axisEntry.id}=${value.id} changes other lines at ${comboLabel(builder, combo)} than at the baseline`
					);
					break;
				}
			}
		}
	}
	return problems;
}

/** What a review reads in full, and the paragraphs it reads in context instead. */
export type ReviewSelection = {
	whole: (RenderedCombo & { adds: number })[];
	/** Paragraphs in none of the whole prompts, each with the prompt it is shown from. */
	inContext: { text: string; from: RenderedCombo }[];
};

/**
 * What a review reads (`scripts/prompts-review.ts`; docs/prompt-review.md,
 * "Reviewing with Claude"), without reading thousands of prompts that are
 * mostly the same words.
 *
 * A paragraph reads differently beside what surrounds it, so some prompts are
 * read whole, as the model sees them: the baseline, then whichever prompt adds
 * the most paragraphs and structural axis values not yet seen (greedy set
 * cover), while each adds at least `minGain` and there are fewer than
 * `limit`. Past that each prompt adds a paragraph or two that only one
 * combination has — the reply's long tail is a couple of hundred of them —
 * so those paragraphs are shown in context instead, from one prompt that has
 * them (`paragraphContext`).
 *
 * Only structural axes count: a descriptive value changes a line or two,
 * which axes.md and paragraphs.md show already.
 */
export function reviewSelection(
	builder: Builder,
	{ limit = 12, minGain = 2 }: { limit?: number; minGain?: number } = {}
): ReviewSelection {
	const { structural } = renderAll(builder);
	const candidates = structural.map((rendered) => ({
		rendered,
		paragraphs: new Set(paragraphsOf(rendered.prompt).map(({ text }) => text)),
		covers: new Set([
			...paragraphsOf(rendered.prompt).map(({ text }) => `¶${text}`),
			...structuralAxes(builder).map((entry) => `${entry.id}=${rendered.combo[entry.id]}`)
		])
	}));
	const uncovered = new Set(candidates.flatMap(({ covers }) => [...covers]));
	const gainOf = (candidate: (typeof candidates)[number]) => {
		let gain = 0;
		for (const item of candidate.covers) {
			if (uncovered.has(item)) {
				gain += 1;
			}
		}
		return gain;
	};
	const whole: ReviewSelection['whole'] = [];
	const take = (candidate: (typeof candidates)[number]) => {
		whole.push({ ...candidate.rendered, adds: gainOf(candidate) });
		for (const item of candidate.covers) {
			uncovered.delete(item);
		}
	};
	const baseline = baselineCombo(builder);
	const first = candidates.find(({ rendered }) =>
		builder.axes.every((entry) => rendered.combo[entry.id] === baseline[entry.id])
	);
	if (first) {
		take(first);
	}
	while (whole.length < limit) {
		let best: (typeof candidates)[number] | undefined;
		let bestGain = minGain - 1;
		for (const candidate of candidates) {
			const gain = gainOf(candidate);
			if (gain > bestGain) {
				best = candidate;
				bestGain = gain;
			}
		}
		if (!best) {
			break;
		}
		take(best);
	}
	const read = new Set(whole.flatMap(({ prompt }) => paragraphsOf(prompt).map(({ text }) => text)));
	const inContext = new Map<string, RenderedCombo>();
	for (const candidate of candidates) {
		for (const text of candidate.paragraphs) {
			if (!(read.has(text) || inContext.has(text))) {
				inContext.set(text, candidate.rendered);
			}
		}
	}
	return { whole, inContext: [...inContext].map(([text, from]) => ({ text, from })) };
}

/**
 * A paragraph as it sits in a prompt: the heading of the section it is in,
 * and the paragraph either side of it, so it can be judged where it is.
 */
export function paragraphContext(prompt: RenderedPrompt, text: string): string | null {
	for (const message of prompt.messages) {
		const paragraphs = message.content.split(PARAGRAPH_BREAK).filter((part) => part.trim() !== '');
		const index = paragraphs.indexOf(text);
		if (index === -1) {
			continue;
		}
		const heading = paragraphs
			.slice(0, index)
			.reverse()
			.find((part) => part.startsWith('#'))
			?.split('\n')[0];
		const before = paragraphs[index - 1];
		const after = paragraphs[index + 1];
		return [
			`[${message.role} message${heading ? `, under "${heading}"` : ''}]`,
			...(before !== undefined && !before.startsWith('#') ? [`…\n${before}`] : []),
			`>>>>\n${text}\n<<<<`,
			...(after === undefined ? [] : [`${after}\n…`])
		].join('\n\n');
	}
	return null;
}
