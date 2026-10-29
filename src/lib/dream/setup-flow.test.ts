import { describe, expect, it } from 'vitest';
import type { DreamSetupBuild } from '../sealed-kinds/dreams';
import { parseBuild } from './build';
import type { BriefReading } from './reading';
import {
	chosenDirection,
	codePick,
	newSetup,
	serializeBuild,
	setupStep,
	userPick,
	withAmendment,
	withAnswer,
	withReading
} from './setup-flow';

const reading = (overrides: Partial<BriefReading> = {}): BriefReading => ({
	musts: ['a training dynamic'],
	research: { needed: false, text: '' },
	spread: { n: 4, reason: '' },
	directions: [
		{ id: 'd1', p: 0.6, text: 'Live-in apprenticeship.' },
		{ id: 'd2', p: 0.1, text: 'Weekly reports.' }
	],
	pick: { by: 'code', reason: '' },
	ask: null,
	rest: [],
	...overrides
});

const build: DreamSetupBuild = {
	title: 'Week by Week',
	heat: 'steamy',
	telling: 'Reports, never scenes.',
	presentation: { view: 'scroll', theme: 'clinical', notes: 'Typed.' },
	capabilities: ['stats'],
	elements: []
};

describe('the setup’s steps', () => {
	it('reads, picks in code, builds, and is ready', () => {
		let setup = newSetup('a training dynamic');
		expect(setupStep(setup)).toBe('read');
		setup = withReading(setup, reading());
		expect(setupStep(setup)).toBe('build');
		setup = codePick(setup, 7);
		expect(setup.chosen?.by).toBe('code');
		expect(setup.chosen?.nudges.length).toBeGreaterThan(1);
		expect(['Live-in apprenticeship.', 'Weekly reports.']).toContain(chosenDirection(setup));
		expect(setupStep({ ...setup, build })).toBe('ready');
	});

	it('picks the same way from the same seed', () => {
		const setup = withReading(newSetup('x'), reading());
		expect(codePick(setup, 99)).toEqual(codePick(setup, 99));
	});

	it('waits on the user when the brief asked to choose, and never picks for them', () => {
		const setup = withReading(newSetup('x'), reading({ pick: { by: 'user', reason: 'asked' } }));
		expect(setupStep(setup)).toBe('pick');
		const chosen = userPick(setup, 'd2', 1);
		expect(chosen.chosen).toMatchObject({ directionId: 'd2', by: 'user' });
		expect(userPick(setup, 'd9', 1)).toBe(setup);
	});

	it('waits for an answer, then reads again keeping it', () => {
		const ask = {
			id: 'q1',
			text: 'Who trains whom?',
			options: ['You', 'Them'],
			keep: 'story' as const
		};
		let setup = withReading(newSetup('x'), reading({ ask }));
		expect(setupStep(setup)).toBe('ask');
		setup = withAnswer(setup, 'Them');
		expect(setup.reading?.answer).toBe('Them');
		// Read again: a new question is not asked over the answered one.
		setup = withReading(setup, reading({ ask: { ...ask, id: 'q2', text: 'Again?' } }));
		expect(setup.reading?.answer).toBe('Them');
		expect(setup.reading?.ask?.id).toBe('q1');
		expect(setupStep(setup)).toBe('build');
	});

	it('reads again for a change before a direction is chosen, and builds again after', () => {
		const read = withReading(newSetup('x'), reading());
		const early = withAmendment(read, 'less plot');
		expect(early.reading).toBeNull();
		expect(early.amendments).toEqual(['less plot']);
		const built = { ...codePick(read, 3), build };
		const late = withAmendment(built, 'set it in winter');
		expect(late.build).toBeNull();
		expect(late.chosen).toEqual(built.chosen);
		expect(setupStep(late)).toBe('build');
	});
});

describe('serializeBuild', () => {
	it('writes a build back so it reads the same', () => {
		const again = parseBuild(serializeBuild(build));
		expect(again).toMatchObject({
			title: build.title,
			heat: build.heat,
			telling: build.telling,
			presentation: build.presentation,
			capabilities: build.capabilities
		});
	});
});
