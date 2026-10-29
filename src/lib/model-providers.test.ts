import { describe, expect, it } from 'vitest';
import {
	backoffUntil,
	classifyReply,
	eligibleProviders,
	HEALTHY,
	nextHealth,
	type ProviderState
} from './model-providers';

const NOW = new Date('2026-10-30T12:00:00Z');
const minutes = (date: Date | null): number =>
	date ? Math.round((date.getTime() - NOW.getTime()) / 60_000) : 0;

describe('classifyReply', () => {
	it('tells a written reply from a refusal, a filter and an empty one', () => {
		const prose = 'She pulls you closer and the rest of the room falls away, slowly.';
		expect(classifyReply(prose, 'stop')).toBe('complied');
		expect(classifyReply("I'm sorry, but I can't write that.", 'stop')).toBe('refused');
		expect(classifyReply('I cannot help with this request.', 'stop')).toBe('refused');
		expect(classifyReply(prose, 'content_filter')).toBe('filtered');
		expect(classifyReply('', 'stop')).toBe('filtered');
	});

	it('does not mistake a character apologising for a refusal later in the text', () => {
		expect(
			classifyReply('She laughs. "I’m sorry," she says, not sorry at all, and kisses you.', 'stop')
		).toBe('complied');
	});
});

describe('nextHealth', () => {
	it('backs off longer with each refusal in a row, up to a day', () => {
		let health = HEALTHY;
		const waits: number[] = [];
		for (let count = 0; count < 8; count += 1) {
			health = nextHealth(health, 'refused', NOW);
			waits.push(minutes(health.refusalBackoffUntil));
		}
		expect(waits).toEqual([10, 30, 90, 270, 810, 1440, 1440, 1440]);
	});

	it('clears refusals only after three successes in a row', () => {
		let health = nextHealth(nextHealth(HEALTHY, 'refused', NOW), 'refused', NOW);
		health = nextHealth(health, 'complied', NOW);
		health = nextHealth(health, 'complied', NOW);
		expect(health.refusalsInRow).toBe(2);
		health = nextHealth(health, 'complied', NOW);
		expect(health).toMatchObject({ refusalsInRow: 0, refusalBackoffUntil: null });
	});

	it('keeps errors on a separate, shorter back-off', () => {
		const health = nextHealth(HEALTHY, 'error', NOW, 'http 502');
		expect(minutes(health.errorBackoffUntil)).toBe(1);
		expect(health).toMatchObject({ refusalsInRow: 0, lastReason: 'http 502' });
	});
});

function state(provider: string, overrides: Partial<ProviderState> = {}): ProviderState {
	return {
		provider,
		levelPassed: 4,
		checkedAt: NOW,
		override: 'auto',
		health: HEALTHY,
		order: 0,
		...overrides
	};
}

describe('eligibleProviders', () => {
	it('routes to providers that passed the level, cheapest first, skipping any backing off', () => {
		const states = [
			state('c', { order: 2 }),
			state('a', { order: 0, levelPassed: 2 }),
			state('b', { order: 1, health: nextHealth(HEALTHY, 'refused', NOW) }),
			state('d', { order: 3, levelPassed: null })
		];
		expect(eligibleProviders(states, 2, NOW)).toEqual(['a', 'c']);
		expect(eligibleProviders(states, 3, NOW)).toEqual(['c']);
		// Ten minutes on, b's back-off is over.
		expect(eligibleProviders(states, 3, new Date(NOW.getTime() + 11 * 60_000))).toEqual(['b', 'c']);
	});

	it('follows the admin over the checks either way', () => {
		const states = [
			state('a', { override: 'never' }),
			state('b', { levelPassed: 0, override: 'always', order: 1 })
		];
		expect(eligibleProviders(states, 4, NOW)).toEqual(['b']);
	});

	it('reports when a provider is usable again', () => {
		expect(backoffUntil(HEALTHY, NOW)).toBeNull();
		const health = nextHealth(HEALTHY, 'refused', NOW);
		expect(minutes(backoffUntil(health, NOW))).toBe(10);
	});
});
