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
		usage: { promptTokens: 10, completionTokens: 10, cost: 0.001 },
		latencyMs: 5
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
		const run = await runBrief(training, { model: 'stub', seed: 'test', passages: 2, complete });
		expect(run.error).toBeUndefined();
		expect(sent.map((entry) => entry.step)).toEqual(['reading', 'build', 'passage 2', 'passage 3']);
		expect(run.picked).toMatch(/Weekly reports|A choir mistress/);
		expect(run.build?.elements.map((element) => element.id)).toEqual(['ines', 'you']);
		expect(run.passages).toHaveLength(3);
		expect(run.cost).toBeCloseTo(0.004);
		// The passage prompt carries the chosen capabilities' blocks, and only those.
		const passageSystem = sent[2]?.messages[0]?.content ?? '';
		expect(passageSystem).toContain('Stats.');
		expect(passageSystem).toContain('Blocks.');
		expect(passageSystem).not.toContain('Choices.');
	});

	it('flags what is off: here, a spread far narrower than an open brief needs', async () => {
		if (!training) {
			throw new Error('the training brief is missing from the bench set');
		}
		const { complete } = stub();
		const run = await runBrief(training, { model: 'stub', seed: 'test', passages: 1, complete });
		const spread = run.checks.find((check) => check.id === 'spread-fits-brief');
		expect(spread).toMatchObject({ ok: false });
		expect(run.checks.find((check) => check.id === 'passage 1: only enabled tags')?.ok).toBe(true);
	});

	it('records a failure on the run instead of throwing', async () => {
		if (!training) {
			throw new Error('the training brief is missing from the bench set');
		}
		const run = await runBrief(training, {
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
			model: 'stub',
			seed: 'same',
			passages: 0,
			complete: stub().complete
		});
		const second = await runBrief(training, {
			model: 'stub',
			seed: 'same',
			passages: 0,
			complete: stub().complete
		});
		expect(second.nudges).toEqual(first.nudges);
		expect(second.picked).toBe(first.picked);
	});
});
