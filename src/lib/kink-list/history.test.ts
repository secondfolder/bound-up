import { describe, expect, it } from 'vitest';
import { type Answer, emptyList, type ListPayload } from './answers';
import { catalog, sidesOf } from './catalog';
import { changeCount, changesBetween, kinkTimeline } from './history';

function list(answers: Record<string, Omit<Answer, 'at'>>): ListPayload {
	return {
		...emptyList(),
		answers: Object.fromEntries(Object.entries(answers).map(([key, a]) => [key, { ...a, at: 1 }]))
	};
}

const plain = catalog.items.find((item) => item.parent !== null && !sidesOf(item));
const sided = catalog.items.find((item) => item.parent !== null && sidesOf(item));
if (!(plain && sided)) {
	throw new Error('The catalogue needs a kink with sides and one without');
}

describe('changesBetween', () => {
	it('groups level moves by direction, with limits on their own', () => {
		const [one, two, three, four, five] = catalog.items
			.filter((item) => item.parent !== null && !sidesOf(item))
			.map((item) => item.id);
		if (!(one && two && three && four && five)) {
			throw new Error('Not enough kinks');
		}
		const changes = changesBetween(
			list({
				[one]: { level: 'curious' },
				[two]: { level: 'love' },
				[three]: { level: 'like' },
				[four]: { level: 'limit' }
			}),
			list({
				[one]: { level: 'love' },
				[two]: { level: 'dont-mind' },
				[three]: { level: 'limit' },
				[four]: { level: 'curious' },
				[five]: { level: 'like' }
			})
		);
		expect(changes['more-into'].map((change) => change.key)).toEqual([one, five].sort());
		expect(changes['less-into']).toEqual([
			{ key: two, part: 'whole', from: 'love', to: 'dont-mind' }
		]);
		expect(changes['new-limits']).toEqual([
			{ key: three, part: 'whole', from: 'like', to: 'limit' }
		]);
		expect(changes['limits-dropped']).toEqual([
			{ key: four, part: 'whole', from: 'limit', to: 'curious' }
		]);
	});

	it('compares each side of a role pair on its own', () => {
		const changes = changesBetween(
			list({ [sided.id]: { sides: { a: { level: 'curious' }, b: { level: 'like' } } } }),
			list({ [sided.id]: { sides: { a: { level: 'love' }, b: { level: 'like' } } } })
		);
		expect(changes['more-into']).toEqual([
			{ key: sided.id, part: 'a', from: 'curious', to: 'love' }
		]);
		expect(changeCount(changes)).toBe(1);
	});

	it('notices more experience and a changed note, and ignores when an answer was saved', () => {
		const before = list({
			[plain.id]: { level: 'like', detail: { experience: 1 }, note: 'slowly' }
		});
		const after = list({
			[plain.id]: { level: 'like', detail: { experience: 3 }, note: 'slowly, with a safeword' }
		});
		const changes = changesBetween(before, after);
		expect(changes['more-experience']).toEqual([{ key: plain.id, part: 'whole' }]);
		expect(changes.notes).toEqual([{ key: plain.id, part: 'whole' }]);
		expect(
			changeCount(
				changesBetween(before, {
					...before,
					answers: { [plain.id]: { ...before.answers[plain.id], at: 99 } }
				})
			)
		).toBe(0);
	});

	it('finds nothing between a list and itself', () => {
		const same = list({ [plain.id]: { level: 'love' } });
		expect(changeCount(changesBetween(same, same))).toBe(0);
	});
});

describe('kinkTimeline', () => {
	it('keeps the first point and every change, and skips versions where it stood still', () => {
		const lists = [
			{ at: 1, list: list({}) },
			{ at: 2, list: list({ [plain.id]: { level: 'curious' } }) },
			{ at: 3, list: list({ [plain.id]: { level: 'curious' } }) },
			{ at: 4, list: list({ [plain.id]: { level: 'love' } }) }
		];
		expect(kinkTimeline(lists, plain.id).map((point) => [point.at, point.answer?.level])).toEqual([
			[1, undefined],
			[2, 'curious'],
			[4, 'love']
		]);
	});
});
