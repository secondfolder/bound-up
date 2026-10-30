/**
 * Where a daydream's setup has got to, and what each step changes
 * (docs/dreams.md, "The setup page"). The setup is saved after each finished
 * step, so a reload asks `setupStep` and carries on from there; a step that
 * was streaming when the page went runs again.
 *
 * Pure and alias-free.
 */

import {
	type DreamSetup,
	type DreamSetupBuild,
	type DreamSetupReading,
	MAX_AMENDMENTS
} from '../sealed-kinds/dreams';
import { type DreamElement, serializeElements } from './elements';
import { escapeMarkup } from './markup';
import { drawNudges, type Nudge } from './nudges';
import { pickDirection } from './pick';
import { type Random, seededRandom } from './random';
import type { BriefReading } from './reading';

export type SetupStep =
	/** Step 1 has not been read yet, or must be read again. */
	| 'read'
	/** Step 1 asked a question the user has not answered. */
	| 'ask'
	/** The brief asked the user to choose the direction. */
	| 'pick'
	/** A direction is chosen; the build and opening are next. */
	| 'build'
	| 'ready';

export function setupStep(setup: DreamSetup): SetupStep {
	if (!setup.reading) {
		return 'read';
	}
	if (setup.reading.ask && setup.reading.answer === null) {
		return 'ask';
	}
	if (!setup.chosen) {
		return setup.reading.pick.by === 'user' ? 'pick' : 'build';
	}
	return setup.build ? 'ready' : 'build';
}

/** A new daydream from a brief: nothing read yet. */
export function newSetup(brief: string, preferences: DreamSetup['preferences'] = []): DreamSetup {
	return { brief, amendments: [], reading: null, chosen: null, build: null, preferences };
}

/**
 * Step 1's reply, kept. An answer given to an earlier question is carried
 * over, so it is still known once the question has been dealt with.
 */
export function withReading(
	setup: DreamSetup,
	reading: BriefReading,
	lookups: NonNullable<DreamSetupReading['lookups']> = []
): DreamSetup {
	const answer = setup.reading?.answer ?? null;
	return {
		...setup,
		reading: {
			musts: reading.musts,
			research: reading.research,
			spread: reading.spread,
			directions: reading.directions,
			pick: reading.pick,
			// Once answered, the question shown stays the one that was answered,
			// even if the model asks something again.
			ask: answer === null ? reading.ask : (setup.reading?.ask ?? null),
			answer,
			lookups: lookups.slice(0, 24)
		}
	};
}

/** The user's answer: step 1 is read again with it. */
export function withAnswer(setup: DreamSetup, answer: string): DreamSetup {
	if (!setup.reading) {
		return setup;
	}
	return { ...setup, reading: { ...setup.reading, answer }, chosen: null, build: null };
}

/**
 * The direction code picks, leaning towards the less likely (`pickDirection`),
 * with the nudges for the build drawn from the same seed, so a bench run can
 * repeat it exactly. `exclude` leaves out ideas already tried ("Try another
 * idea"); with none left, nothing changes.
 */
export function codePick(
	setup: DreamSetup,
	seed: number,
	exclude: ReadonlySet<string> = new Set()
): DreamSetup {
	const { reading } = setup;
	if (!reading) {
		return setup;
	}
	const random = seededRandom(seed);
	const direction = pickDirection(reading.directions, reading.spread.n, random, exclude);
	return direction ? choose({ ...setup, build: null }, direction.id, 'code', seed, random) : setup;
}

/** The user choosing a direction: the build starts again from it. */
export function userPick(setup: DreamSetup, directionId: string, seed: number): DreamSetup {
	if (!setup.reading?.directions.some((direction) => direction.id === directionId)) {
		return setup;
	}
	return choose({ ...setup, build: null }, directionId, 'user', seed, seededRandom(seed));
}

function choose(
	setup: DreamSetup,
	directionId: string,
	by: 'code' | 'user',
	seed: number,
	random: Random
): DreamSetup {
	const nudges: Nudge[] = drawNudges(random);
	return { ...setup, chosen: { directionId, by, nudges, seed } };
}

/**
 * A change asked for while it is set up. Before a direction is chosen,
 * step 1 reads the brief again with it; after, the build runs again from the
 * previous build plus the change, keeping the reading and the direction.
 */
export function withAmendment(setup: DreamSetup, amendment: string): DreamSetup {
	// The record holds so many; past that, the oldest go, as the latest win anyway.
	const amendments = [...setup.amendments, amendment].slice(-MAX_AMENDMENTS);
	if (!setup.chosen) {
		return { ...setup, amendments, reading: null };
	}
	return { ...setup, amendments, build: null };
}

/** The chosen direction's words, or null. */
export function chosenDirection(setup: DreamSetup): string | null {
	const id = setup.chosen?.directionId;
	return setup.reading?.directions.find((direction) => direction.id === id)?.text ?? null;
}

/**
 * A build written back as the tags the model wrote it in, without its
 * passage: what the build is asked to change when the user asks for a change.
 */
export function serializeBuild(build: DreamSetupBuild): string {
	return [
		`<title>${escapeMarkup(build.title)}</title>`,
		`<heat level="${build.heat}"/>`,
		`<telling>\n${escapeMarkup(build.telling)}\n</telling>`,
		`<presentation view="${build.presentation.view}">${escapeMarkup(build.presentation.notes)}</presentation>`,
		`<elements>\n${serializeElements(build.elements)}\n</elements>`
	].join('\n\n');
}

const MAX_EDIT_WORDS = 160;

function clip(text: string): string {
	return text.length > MAX_EDIT_WORDS ? `${text.slice(0, MAX_EDIT_WORDS)}…` : text;
}

/** What changed in an element, worded for the build: null when nothing did. */
export function describeElementChange(before: DreamElement, after: DreamElement): string | null {
	const changes: string[] = [];
	if (before.name !== after.name) {
		changes.push(`${before.name} is now called ${after.name}`);
	}
	if ((before.short ?? '') !== (after.short ?? '') && after.short) {
		changes.push(`${after.name} is called ${after.short} for short`);
	}
	for (const field of after.fields) {
		const was = before.fields.find((entry) => entry.name === field.name);
		if (was?.text !== field.text) {
			changes.push(
				`${after.name}'s ${field.name.replaceAll('-', ' ')} is now: "${clip(field.text)}"`
			);
		}
	}
	for (const field of before.fields) {
		if (!after.fields.some((entry) => entry.name === field.name)) {
			changes.push(`${after.name} no longer has a ${field.name.replaceAll('-', ' ')}`);
		}
	}
	return changes.length > 0 ? changes.join('; ').slice(0, 400) : null;
}

/**
 * An element changed by hand on the setup page (docs/dreams.md, "Changing
 * what was made"): kept in the build at once, and noted, so Update can have
 * the build follow it everywhere else it matters.
 */
export function withElementChange(setup: DreamSetup, changed: DreamElement): DreamSetup {
	const { build } = setup;
	const before = build?.elements.find((element) => element.id === changed.id);
	if (!(build && before)) {
		return setup;
	}
	const change = describeElementChange(before, changed);
	if (!change) {
		return setup;
	}
	return {
		...setup,
		build: {
			...build,
			elements: build.elements.map((element) => (element.id === changed.id ? changed : element))
		},
		pendingEdits: [...(setup.pendingEdits ?? []), change].slice(-24),
		editedFrom: [...(setup.editedFrom ?? []), before].slice(-24)
	};
}

/**
 * Undoes a change made by hand (docs/dreams.md, "Changing what was made"):
 * the element goes back to how it was before it. A later change to the
 * same element was made on top of this one, so it goes too.
 */
export function withoutEdit(setup: DreamSetup, index: number): DreamSetup {
	const edits = setup.pendingEdits ?? [];
	const before = setup.editedFrom?.[index];
	if (!(setup.build && before && index < edits.length)) {
		return setup;
	}
	const keep = edits
		.map((_, at) => at)
		.filter((at) => at < index || setup.editedFrom?.[at]?.id !== before.id);
	return {
		...setup,
		build: {
			...setup.build,
			elements: setup.build.elements.map((element) => (element.id === before.id ? before : element))
		},
		pendingEdits: keep.map((at) => edits[at] ?? '').filter(Boolean),
		editedFrom: keep.map((at) => setup.editedFrom?.[at]).filter((entry) => entry !== undefined)
	};
}

/**
 * Update: the changes made by hand go to the build as one change asked for,
 * which rebuilds from the build as changed, keeping what was changed and
 * following it through everything else (the telling notes, the others, the
 * opening).
 */
export function withEditsApplied(setup: DreamSetup): DreamSetup {
	const edits = setup.pendingEdits ?? [];
	if (edits.length === 0) {
		return setup;
	}
	const amendment = `I changed these by hand. Keep them exactly, and change anything else they affect: ${edits.join('; ')}`;
	const { pendingEdits: _done, editedFrom: _from, ...rest } = setup;
	return withAmendment(rest, amendment.slice(0, 500));
}
