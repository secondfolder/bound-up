/**
 * The setup page's steps (docs/dreams.md, "The setup page"): the steps the
 * daydream was really set up by, in the order they were taken. Each request
 * to the model is a step, and what it looked up while it worked (pages read,
 * searches) is under it; a pick and an answer are steps too. Reading the
 * brief again after an answer, or building again after a change, is another
 * step, not the old one done over.
 *
 * Three parts make the list: the trail kept with the setup (done), the
 * request being made now (active), and what is still to come, from where
 * the setup has got to (waiting, or waiting on the user).
 *
 * Pure and alias-free.
 */

import type { DreamSetup, DreamTrailStep } from '../sealed-kinds/dreams';
import { asksForResearch } from './links';
import { setupStep } from './setup-flow';

/**
 * `yours` is waiting on the user (a question, choosing an idea), marked
 * differently from `active`, which is the model at work.
 */
export type StepStatus = 'done' | 'active' | 'yours' | 'waiting';

export type SetupStepKind = DreamTrailStep['kind'] | 'ask';

export type Lookup = NonNullable<DreamTrailStep['lookups']>[number];

export type SetupProgressStep = {
	/** The step's own id, which keys its transcript in debug mode. */
	id: string;
	kind: SetupStepKind;
	label: string;
	status: StepStatus;
	/** Whether its results are the ones in force: the latest of its kind. */
	current: boolean;
	lookups: Lookup[];
};

/** How this server researches a brief: the story model itself, a research model, or not at all. */
export type ResearchMode = 'self' | 'model' | 'none';

/** The request being made now. */
export type LiveStep = { id: string; kind: 'research' | 'read' | 'build' };

export type ProgressInput = {
	setup: DreamSetup;
	/** Steps taken on this page and not yet kept with the setup (a research step before its reading). */
	pending?: readonly DreamTrailStep[];
	live: LiveStep | null;
	/** Pages read and searches made by the request being made now. */
	lookups?: readonly Lookup[];
	research: ResearchMode;
};

/**
 * The trail of a setup made before there was one, as far as it can be told
 * from what was kept: its reading, the pick, the build.
 */
export function trailOf(setup: DreamSetup): DreamTrailStep[] {
	if (setup.trail) {
		return setup.trail;
	}
	const steps: DreamTrailStep[] = [];
	if (setup.reading) {
		steps.push({ id: 'read', kind: 'read', lookups: setup.reading.lookups ?? [] });
		if (setup.reading.answer !== null) {
			steps.push({ id: 'answer', kind: 'answer' });
		}
	}
	if (setup.chosen) {
		steps.push({ id: 'pick', kind: 'pick', by: setup.chosen.by });
	}
	if (setup.build) {
		steps.push({ id: 'build', kind: 'build' });
	}
	return steps;
}

function doneLabel(step: DreamTrailStep, again: boolean): string {
	switch (step.kind) {
		case 'research':
			return again ? 'Looking things up again' : 'Looking things up';
		case 'read':
			return again ? 'Analysing it again' : 'Analysing what you asked for';
		case 'answer':
			return 'You answered';
		case 'pick':
			return step.by === 'user' ? 'You chose an idea' : 'Picked one';
		default:
			return again ? 'Building it again' : 'Building it and writing the opening';
	}
}

export function setupProgress(input: ProgressInput): SetupProgressStep[] {
	const { setup, live } = input;
	const done = [...trailOf(setup), ...(input.pending ?? [])];
	const seen = new Map<string, number>();
	const steps: SetupProgressStep[] = done.map((step, index) => {
		const count = seen.get(step.kind) ?? 0;
		seen.set(step.kind, count + 1);
		const later = done.slice(index + 1).some((other) => other.kind === step.kind);
		return {
			id: step.id,
			kind: step.kind,
			label: doneLabel(step, count > 0),
			status: 'done',
			current: !later && live?.kind !== step.kind,
			lookups: step.lookups ?? []
		};
	});
	const again = (kind: DreamTrailStep['kind']) => (seen.get(kind) ?? 0) > 0;

	// Kept with the setup a moment before it stops being the live one: once.
	if (live && !done.some((step) => step.id === live.id)) {
		steps.push({
			id: live.id,
			kind: live.kind,
			label: doneLabel({ id: live.id, kind: live.kind }, again(live.kind)),
			status: 'active',
			current: true,
			lookups: [...(input.lookups ?? [])]
		});
	}

	// What is still to come, from where the setup has got to.
	const at = setupStep(setup);
	const waiting = (
		id: string,
		kind: SetupStepKind,
		label: string,
		status: StepStatus = 'waiting'
	) => steps.push({ id, kind, label, status, current: false, lookups: [] });
	const reading = live?.kind === 'research' || live?.kind === 'read';
	if (!setup.reading) {
		if (
			!live &&
			input.research === 'model' &&
			asksForResearch(setup.brief) &&
			!done.some((entry) => entry.kind === 'research')
		) {
			waiting('next-research', 'research', 'Looking things up');
		}
		if (live?.kind !== 'read') {
			waiting('next-read', 'read', 'Analysing what you asked for');
		}
	}
	if (setup.reading?.ask && setup.reading.answer === null && !reading) {
		waiting('next-ask', 'ask', 'A question for you', at === 'ask' ? 'yours' : 'waiting');
	}
	if (!setup.chosen) {
		const byUser = at === 'pick';
		waiting(
			'next-pick',
			'pick',
			byUser ? 'Choose an idea' : 'Picking one',
			byUser ? 'yours' : 'waiting'
		);
	}
	if (!setup.build && live?.kind !== 'build') {
		waiting('next-build', 'build', 'Building it and writing the opening');
	}
	return steps;
}
