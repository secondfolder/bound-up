import { describe, expect, it } from 'vitest';
import { type Answer, emptyList, type ListPayload } from './answers';
import {
	answerTarget,
	differences,
	effectiveList,
	emptyPartnerPayload,
	mergePartnerPayloads,
	type PartnerPayload,
	resolvedFor,
	sideFromControl
} from './partner';

const at = 3;

function solo(answers: Record<string, Answer>, fields: Partial<ListPayload> = {}): ListPayload {
	return { ...emptyList(), answers, ...fields };
}

function copy(fields: Partial<PartnerPayload> = {}): PartnerPayload {
	return { ...emptyPartnerPayload(), ...fields };
}

describe('a partner copy', () => {
	it('follows your own list, except where it overrides an answer', () => {
		const own = solo({ spanking: { level: 'like', at }, caning: { level: 'limit', at } });
		const partner = copy({ overrides: { spanking: { level: 'love', at } } });
		const effective = effectiveList(own, partner);
		expect(effective.answers.spanking?.level).toBe('love');
		expect(effective.answers.caning?.level).toBe('limit');
	});

	it('ignores an override taken back', () => {
		const own = solo({ spanking: { level: 'like', at } });
		const partner = copy({ overrides: { spanking: { at: 9 } } });
		expect(effectiveList(own, partner).answers.spanking?.level).toBe('like');
		expect(differences(own, partner)).toEqual([]);
	});

	it('shows the partner neither what is held back nor quick-fill skips, and keeps wholesale limits', () => {
		const own = solo(
			{
				spanking: { level: 'like', at },
				caning: { level: 'limit', at },
				kissing: { level: 'love', at }
			},
			{
				triage: { extreme: { value: 'limit', at }, media: { value: 'skip', at } },
				skipped: { tickling: { skipped: true, at } }
			}
		);
		const partner = copy({
			heldBack: {
				caning: { held: true, at },
				kissing: { held: true, at },
				spanking: { held: false, at }
			}
		});
		const resolved = resolvedFor(own, partner);
		expect(Object.keys(resolved.answers)).toEqual(['spanking']);
		expect(resolved.triage).toEqual({ extreme: { value: 'limit', at } });
	});

	it('sends an answer your own list lacks to your own list, and the rest to an override', () => {
		const own = solo({ spanking: { level: 'like', at }, flogging: { note: 'Ask first', at } });
		expect(answerTarget(own, 'caning')).toBe('own');
		expect(answerTarget(own, 'spanking')).toBe('override');
		// A note alone is an answer of your own list's, so it is kept apart too.
		expect(answerTarget(own, 'flogging')).toBe('override');
	});

	it('lists what differs, with both answers', () => {
		const own = solo({ spanking: { level: 'like', at } });
		const partner = copy({ overrides: { spanking: { level: 'love', at } } });
		expect(differences(own, partner)).toEqual([
			{ key: 'spanking', own: { level: 'like', at }, override: { level: 'love', at } }
		]);
	});

	it('merges two copies per kink, keeping whichever changed last', () => {
		const a = copy({
			overrides: { spanking: { level: 'love', at: 1 } },
			blind: { on: true, at: 5 }
		});
		const b = copy({
			overrides: { spanking: { level: 'like', at: 2 }, caning: { level: 'curious', at: 1 } },
			heldBack: { flogging: { held: true, at: 1 } },
			blind: { on: false, at: 3 }
		});
		const merged = mergePartnerPayloads(a, b);
		expect(merged.overrides.spanking?.level).toBe('like');
		expect(merged.overrides.caning?.level).toBe('curious');
		expect(merged.heldBack.flogging?.held).toBe(true);
		expect(merged.blind.on).toBe(true);
	});
});

describe('sideFromControl', () => {
	it('starts whoever holds control on the dom side, the other on the sub side', () => {
		expect(sideFromControl('me')).toBe('dom');
		expect(sideFromControl('them')).toBe('sub');
		expect(sideFromControl('mix')).toBe('both');
	});
});
