import { describe, expect, it } from 'vitest';
import { boxOf, designsWanted, meterOf, parseDesign, slotItems, slotsOf } from './designs';
import { findTags, parseMarkup } from './markup';

const request = {
	kind: 'ration-card',
	description: 'A paper ration card: the holder, a square a day, a stamp.',
	slots: [
		{ name: 'holder', example: 'You' },
		{ name: 'days', example: 'x Mon; Tue; Wed' }
	]
};

const layout = {
	frame: 'paper',
	layout: {
		type: 'stack',
		children: [
			{ type: 'pair', label: 'Holder', slot: 'holder' },
			{ type: 'boxes', slot: 'days', columns: 7 }
		]
	}
};

describe('designed blocks', () => {
	it('keeps a design in the language, drawing only the slots it was given', () => {
		const design = parseDesign(`\`\`\`json\n${JSON.stringify(layout)}\n\`\`\``, request);
		expect(design?.kind).toBe('ration-card');
		expect(design?.slots.map((slot) => slot.name)).toEqual(['holder', 'days']);
	});

	it('refuses anything else: not JSON, unknown parts, a slot it was not given, too big', () => {
		expect(parseDesign('<div>hi</div>', request)).toBeNull();
		expect(
			parseDesign(
				JSON.stringify({ frame: 'paper', layout: { type: 'html', html: '<b>' } }),
				request
			)
		).toBeNull();
		expect(
			parseDesign(
				JSON.stringify({ frame: 'paper', layout: { type: 'list', slot: 'secret' } }),
				request
			)
		).toBeNull();
		const deep = { type: 'stack', children: [] as unknown[] };
		let at = deep;
		for (let index = 0; index < 6; index += 1) {
			const inner = { type: 'stack', children: [] as unknown[] };
			at.children.push(inner);
			at = inner;
		}
		expect(parseDesign(JSON.stringify({ frame: 'card', layout: deep }), request)).toBeNull();
	});

	it('reads slots, list items, punch boxes and meters', () => {
		const [tag] = findTags(
			parseMarkup(
				'<block kind="ration-card" design="A card."><slot name="holder">You</slot><slot name="days">x Mon; Tue</slot></block>',
				{ final: true }
			),
			'block'
		);
		expect(tag && slotsOf(tag)).toEqual({ holder: 'You', days: 'x Mon; Tue' });
		expect(slotItems('x Mon; Tue').map(boxOf)).toEqual([
			{ filled: true, label: 'Mon' },
			{ filled: false, label: 'Tue' }
		]);
		expect(meterOf('7/10')).toEqual({ value: 7, max: 10 });
		expect(meterOf('300', 100)).toEqual({ value: 100, max: 100 });
		expect(tag ? designsWanted([tag], new Set()) : []).toHaveLength(1);
		expect(tag ? designsWanted([tag], new Set(['ration-card'])) : []).toHaveLength(0);
	});
});
