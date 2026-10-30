/**
 * The setup page's steps (docs/dreams.md, "The setup page"): what is being
 * done, in the order it is really done, with each one's status, worked out
 * from the setup as kept and the reply streaming in.
 *
 * - **Looking things up**, only for a brief with links or one that asks for
 *   research, on a server that can (`research`). It comes first however it is
 *   done: a separate research model runs before the reading, and a story
 *   model with tools calls them before it writes a word.
 * - **Reading what you asked for**: the musts.
 * - **Thinking of directions**: the spread and the directions.
 * - **A question**, only when step 1 asked one.
 * - **Picking one**, or **Choose an idea** when the brief asked to choose.
 * - **Building it**: title, notes, cast, how it is shown.
 * - **Writing the opening**: the build's `<passage>`, in the same reply.
 *
 * Within one streamed reply a step is done as its tag closes, so each turns
 * done as the model moves on, not all at once at the end.
 *
 * Pure and alias-free.
 */

import type { DreamSetup } from '../sealed-kinds/dreams';
import { asksForResearch } from './links';
import { setupStep } from './setup-flow';

export type StepStatus = 'done' | 'active' | 'waiting';

export type SetupStepKey =
	| 'research'
	| 'read'
	| 'directions'
	| 'ask'
	| 'pick'
	| 'build'
	| 'opening';

export type SetupProgressStep = { key: SetupStepKey; label: string; status: StepStatus };

/** How this server researches a brief: the story model itself, a research model, or not at all. */
export type ResearchMode = 'self' | 'model' | 'none';

export type ProgressInput = {
	setup: DreamSetup;
	streaming: { what: 'read' | 'build' | 'passage'; text: string } | null;
	research: ResearchMode;
	/** Pages read and searches made so far for this reading. */
	lookups: number;
	/** Whether a separate research step has sent what it found. */
	researched: boolean;
};

const MUSTS_CLOSED = /<\/musts>/;
const DIRECTIONS_CLOSED = /<\/directions>/;
const PASSAGE_OPENED = /<passage\b/;
const SPREAD = /<spread\s+n="(?<n>\d+)"/;

function statusOf(done: boolean, active: boolean): StepStatus {
	if (done) {
		return 'done';
	}
	return active ? 'active' : 'waiting';
}

export function setupProgress(input: ProgressInput): SetupProgressStep[] {
	const { setup, streaming } = input;
	const { reading } = setup;
	const readingText = streaming?.what === 'read' ? streaming.text : null;
	const buildText = streaming?.what === 'build' ? streaming.text : null;
	const step = setupStep(setup);
	const steps: SetupProgressStep[] = [];

	const looksUp =
		input.lookups > 0 ||
		Boolean(reading?.research.needed && reading.research.text) ||
		(input.research !== 'none' && asksForResearch(setup.brief));
	if (looksUp) {
		// Done once the reading's own words start (the tools come first) or a
		// separate step has reported, or once the reading is kept.
		const done =
			readingText === null
				? reading !== null
				: readingText.trim() !== '' || (input.research === 'model' && input.researched);
		steps.push({
			key: 'research',
			label: 'Looking things up',
			status: statusOf(done, readingText !== null)
		});
	}

	const mustsDone = reading !== null && readingText === null;
	const readDone = mustsDone || (readingText !== null && MUSTS_CLOSED.test(readingText));
	const readingStarted = readingText !== null && (readingText.trim() !== '' || !looksUp);
	steps.push({
		key: 'read',
		label: 'Reading what you asked for',
		status: statusOf(readDone, readingStarted)
	});

	const spread = readingText?.match(SPREAD)?.groups?.n;
	const directionsDone = mustsDone || (readingText !== null && DIRECTIONS_CLOSED.test(readingText));
	steps.push({
		key: 'directions',
		label: spread ? `Thinking of ${spread} directions` : 'Thinking of directions',
		status: statusOf(directionsDone, readDone)
	});

	if (reading?.ask && readingText === null) {
		steps.push({
			key: 'ask',
			label: 'A question for you',
			status: statusOf(reading.answer !== null, step === 'ask')
		});
	}

	const byUser = reading?.pick.by === 'user';
	steps.push({
		key: 'pick',
		label: byUser && !setup.chosen ? 'Choose an idea' : 'Picking one',
		status: statusOf(setup.chosen !== null, step === 'pick')
	});

	const built = setup.build !== null && buildText === null;
	const opened = buildText !== null && PASSAGE_OPENED.test(buildText);
	steps.push({
		key: 'build',
		label: 'Building it',
		status: statusOf(built || opened, buildText !== null)
	});
	steps.push({
		key: 'opening',
		label: 'Writing the opening',
		status: statusOf(built, opened)
	});
	return steps;
}
