import { describe, expect, it } from 'vitest';
import type { Completion } from '../openrouter';
import type { ModelMessage } from '../prompts/core';
import { BENCH_BRIEFS } from './briefs';
import { runBrief } from './run';

const READING = `<musts>
- A training dynamic.
</musts>
<research needed="no"/>
<spread n="2">Narrow, for the test.</spread>
<directions>
<direction p="0.6">Weekly reports.</direction>
<direction p="0.4">A choir mistress.</direction>
</directions>`;

const BUILD = `<title>Week by week</title>
<telling>Reports on the user.</telling>
<presentation view="scroll" theme="paper">Documents.</presentation>
<capabilities>stats, blocks</capabilities>
<elements>
<character id="ines" name="Ines Varga"><manner>Clipped.</manner></character>
<you><stat name="composure" kind="meter" value="20">Rises when still.</stat></you>
</elements>
<passage>
<block kind="report" title="Week 1">Posture: poor. <set you.composure="+5">Held still.</set></block>
<after>
{"next": "Week 2."}
</after>
</passage>`;

const PASSAGE = `<block kind="report" title="Week 2">Better.</block>
<after>
{"next": "Week 3."}
</after>`;

function reply(text: string): Completion {
	return {
		text,
		provider: 'Stub',
		finishReason: 'stop',
		usage: { promptTokens: 10, cachedTokens: 0, completionTokens: 10, cost: 0.001 },
		latencyMs: 5,
		firstTokenMs: 3
	};
}

function stub() {
	const sent: { step: string; messages: readonly ModelMessage[] }[] = [];
	const complete = (messages: readonly ModelMessage[], step: string): Promise<Completion> => {
		sent.push({ step, messages });
		if (step === 'reading') {
			return Promise.resolve(reply(READING));
		}
		return Promise.resolve(reply(step === 'build' ? BUILD : PASSAGE));
	};
	return { sent, complete };
}

const training = BENCH_BRIEFS.find((brief) => brief.id === 'training');

describe('runBrief', () => {
	it('runs reading, pick, build and passages, keeping every prompt', async () => {
		if (!training) {
			throw new Error('the training brief is missing from the bench set');
		}
		const { sent, complete } = stub();
		const run = await runBrief(training, {
			label: 'test',
			model: 'stub',
			seed: 'test',
			passages: 2,
			complete
		});
		expect(run.error).toBeUndefined();
		expect(sent.map((entry) => entry.step)).toEqual(['reading', 'build', 'passage 2', 'passage 3']);
		expect(run.picked).toMatch(/Weekly reports|A choir mistress/);
		expect(run.build?.elements.map((element) => element.id)).toEqual(['ines', 'you']);
		expect(run.passages).toHaveLength(3);
		expect(run.cost).toBeCloseTo(0.004);
		// Every capability is offered to every passage, but voice, which is
		// only for a user who is listening.
		const passageSystem = sent[2]?.messages[0]?.content ?? '';
		expect(passageSystem).toContain('Stats.');
		expect(passageSystem).toContain('Choices.');
		expect(passageSystem).not.toContain('Voice.');
	});

	it('flags what is off: here, a spread far narrower than an open brief needs', async () => {
		if (!training) {
			throw new Error('the training brief is missing from the bench set');
		}
		const { complete } = stub();
		const run = await runBrief(training, {
			label: 'test',
			model: 'stub',
			seed: 'test',
			passages: 1,
			complete
		});
		const spread = run.checks.find((check) => check.id === 'spread-fits-brief');
		expect(spread).toMatchObject({ ok: false });
		expect(run.checks.find((check) => check.id === 'passage 1: only enabled tags')?.ok).toBe(true);
	});

	it('records a failure on the run instead of throwing', async () => {
		if (!training) {
			throw new Error('the training brief is missing from the bench set');
		}
		const run = await runBrief(training, {
			label: 'test',
			model: 'stub',
			seed: 'test',
			passages: 1,
			complete: () => Promise.reject(new Error('OpenRouter 402: out of credit'))
		});
		expect(run.error).toBe('OpenRouter 402: out of credit');
		expect(run.passages).toEqual([]);
	});

	it('draws the same nudges and pick for the same seed', async () => {
		if (!training) {
			throw new Error('the training brief is missing from the bench set');
		}
		const first = await runBrief(training, {
			label: 'test',
			model: 'stub',
			seed: 'same',
			passages: 0,
			complete: stub().complete
		});
		const second = await runBrief(training, {
			label: 'test',
			model: 'stub',
			seed: 'same',
			passages: 0,
			complete: stub().complete
		});
		expect(second.nudges).toEqual(first.nudges);
		expect(second.picked).toBe(first.picked);
	});
});

describe('the variety fingerprint', () => {
	it('is taken from a cheap model after the run, and a bad one is dropped', async () => {
		if (!training) {
			throw new Error('the training brief is missing from the bench set');
		}
		const json =
			'Here: {"setting": "a restaurant after close", "power": "she teaches, he obeys", "form": "prose", "userRole": "apprentice", "hook": "blind tasting", "opening": "three glasses"}';
		const run = await runBrief(training, {
			label: 'test',
			model: 'stub',
			seed: 'test',
			passages: 0,
			complete: stub().complete,
			fingerprint: () => Promise.resolve(reply(json))
		});
		expect(run.fingerprint?.setting).toBe('a restaurant after close');
		expect(run.steps.at(-1)?.step).toBe('fingerprint');
		const bad = await runBrief(training, {
			label: 'test',
			model: 'stub',
			seed: 'test',
			passages: 0,
			complete: stub().complete,
			fingerprint: () => Promise.resolve(reply('not json'))
		});
		expect(bad.fingerprint).toBeNull();
	});

	it('lets a simulated player take the turns, seeing only the words', async () => {
		if (!training) {
			throw new Error('the training brief is missing from the bench set');
		}
		const sent: { step: string; messages: readonly ModelMessage[] }[] = [];
		const run = await runBrief(training, {
			label: 'test',
			model: 'stub',
			seed: 'test',
			passages: 2,
			player: { persona: 'terse' },
			complete: (messages, step) => {
				sent.push({ step, messages });
				if (step.startsWith('player')) {
					return Promise.resolve(reply(step === 'player 2' ? 'kneel' : 'CONTINUE'));
				}
				return stub().complete(messages, step);
			}
		});
		expect(run.error).toBeUndefined();
		expect(sent.map((entry) => entry.step)).toEqual([
			'reading',
			'build',
			'player 2',
			'passage 2',
			'player 3',
			'passage 3'
		]);
		expect(run.turns).toEqual([{ kind: 'words', text: 'kneel' }, { kind: 'continue' }]);
		// The player sees the words, never the markup or the footer.
		const seen = sent.find((entry) => entry.step === 'player 2')?.messages.at(-1)?.content ?? '';
		expect(seen).toContain('Posture: poor.');
		expect(seen).not.toContain('<after>');
		expect(seen).not.toContain('<block');
		// And the passage after it answers the player's turn.
		const asked = sent.find((entry) => entry.step === 'passage 2')?.messages.at(-1)?.content ?? '';
		expect(asked).toContain('kneel');
	});
});
