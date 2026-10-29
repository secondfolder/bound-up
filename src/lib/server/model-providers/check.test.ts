import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompletionRequest } from '$lib/server/dream/openrouter';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { checkModel } from './check';
import { PROBES } from './probes';
import { loadProviderStates, recordOutcome, routeFor, setOverride } from './store';

/**
 * The adult-content check and routing (docs/server-settings.md, "Adult
 * content by provider"), against a stand-in for OpenRouter whose providers
 * stop at different levels.
 */

let harness: TestDb;
const NOW = new Date('2026-10-30T12:00:00Z');
const KEY = { model: 'z-ai/glm-5.2', kind: 'language' as const };
const PROSE =
	'They close the door behind them, and the rest of the evening is theirs alone, slowly.';

/** Which probe level each stand-in provider stops at: 5 passes everything. */
const STOPS_AT: Record<string, number> = {
	'open/fp8': 5,
	'prude/fp4': 2,
	'filter/bf16': 1,
	'down/fp8': 0
};

function levelOf(request: CompletionRequest): number {
	const asked = request.messages.at(-1)?.content ?? '';
	return Number(Object.entries(PROBES).find(([, text]) => text === asked)?.[0] ?? 0);
}

function stubComplete(request: CompletionRequest) {
	const provider = request.providers?.[0] ?? '';
	const stop = STOPS_AT[provider] ?? 0;
	if (stop === 0) {
		return Promise.reject(new Error('OpenRouter 503: provider unavailable'));
	}
	const refused = levelOf(request) >= stop;
	return Promise.resolve({
		text: refused ? "I'm sorry, but I can't write that." : PROSE,
		provider,
		finishReason: provider === 'filter/bf16' && refused ? 'content_filter' : 'stop',
		usage: { promptTokens: 1, completionTokens: 1, cost: 0 },
		latencyMs: 1,
		firstTokenMs: null
	});
}

beforeEach(async () => {
	harness = await createTestDb();
});

afterEach(() => harness.close());

function check() {
	return checkModel({
		db: harness.db,
		apiKey: 'test',
		baseUrl: 'https://openrouter.test',
		model: 'z-ai/glm-5.2@preset/nsfw-compatible',
		kind: 'language',
		endpoints: () => Promise.resolve(Object.keys(STOPS_AT)),
		complete: stubComplete,
		now: () => NOW
	});
}

describe('checkModel', () => {
	it('stores the highest level each endpoint passed, under the model as listed', async () => {
		await check();
		const states = await loadProviderStates(harness.db, KEY);
		expect(Object.fromEntries(states.map((state) => [state.provider, state.levelPassed]))).toEqual({
			'open/fp8': 4,
			'prude/fp4': 1,
			'filter/bf16': 0,
			// Unreachable before any verdict: unknown, not zero.
			'down/fp8': null
		});
		expect(states.map((state) => state.provider)).toEqual([
			'open/fp8',
			'prude/fp4',
			'filter/bf16',
			'down/fp8'
		]);
	});

	it('pins each probe to one endpoint and stops climbing at the first refusal', async () => {
		const results = await check();
		const prude = results.find((result) => result.provider === 'prude/fp4');
		expect(prude?.outcomes).toEqual(['complied', 'refused']);
	});
});

describe('routing', () => {
	it('routes by level, follows overrides, and skips a provider backing off', async () => {
		await check();
		expect(await routeFor(harness.db, KEY, 1, NOW)).toEqual(['open/fp8', 'prude/fp4']);
		expect(await routeFor(harness.db, KEY, 4, NOW)).toEqual(['open/fp8']);

		await setOverride(harness.db, KEY, 'filter/bf16', 'always');
		expect(await routeFor(harness.db, KEY, 4, NOW)).toEqual(['open/fp8', 'filter/bf16']);

		await recordOutcome(harness.db, KEY, 'open/fp8', 'refused', NOW, 'refused');
		expect(await routeFor(harness.db, KEY, 4, NOW)).toEqual(['filter/bf16']);
		const later = new Date(NOW.getTime() + 11 * 60_000);
		expect(await routeFor(harness.db, KEY, 4, later)).toEqual(['open/fp8', 'filter/bf16']);
	});

	it('keeps an override and health when a provider is checked again', async () => {
		await check();
		await setOverride(harness.db, KEY, 'open/fp8', 'never');
		await recordOutcome(harness.db, KEY, 'prude/fp4', 'refused', NOW);
		await check();
		const states = await loadProviderStates(harness.db, KEY);
		expect(states.find((state) => state.provider === 'open/fp8')?.override).toBe('never');
		expect(states.find((state) => state.provider === 'prude/fp4')?.health.refusalsInRow).toBe(1);
	});
});
