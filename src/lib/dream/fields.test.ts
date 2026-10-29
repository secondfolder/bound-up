import { describe, expect, it } from 'vitest';
import { fieldKey, passageBlocks, passageCycles, turnInputs } from './fields';
import { parseMarkup } from './markup';

const PASSAGE = `Pick <cycle id="pen" label="the pen">blue|black|red</cycle>.
<block kind="contract" title="Terms">
<field id="c1" type="initial">You will kneel.</field>
<field id="c2" type="choice" label="Weekends"><option>Yes</option><option>No</option></field>
<field id="sig" type="sign">Sign here</field>
</block>
<texts><say who="you">ok</say></texts>
<block kind="lines"><field type="tap-count" target="20">I will not be late.</field></block>`;

const nodes = parseMarkup(PASSAGE, { final: true });

describe('passageBlocks', () => {
	it('keys each block, reads its fields, and takes the shorthands as kinds', () => {
		const blocks = passageBlocks(nodes);
		expect(blocks.map((block) => [block.key, block.kind, block.title])).toEqual([
			['contract-1', 'contract', 'Terms'],
			['texts-2', 'texts', ''],
			['lines-3', 'lines', '']
		]);
		expect(
			blocks[0]?.fields.map((field) => [field.name, field.type, field.label, field.options])
		).toEqual([
			['c1', 'initial', 'You will kneel.', []],
			['c2', 'choice', 'Weekends', ['Yes', 'No']],
			['sig', 'sign', 'Sign here', []]
		]);
		expect(blocks[2]?.fields[0]).toMatchObject({ name: 'f1', type: 'tap-count', target: 20 });
	});
});

describe('turnInputs', () => {
	it('sends changed choices, and every field with the untouched ones skipped', () => {
		expect(passageCycles(nodes)[0]).toMatchObject({
			id: 'pen',
			label: 'the pen',
			options: ['blue', 'black', 'red']
		});
		const inputs = turnInputs(
			nodes,
			{ pen: 'red' },
			{ [fieldKey('contract-1', 'c1')]: 'initialled', [fieldKey('lines-3', 'f1')]: '20' }
		);
		expect(inputs.cycles).toEqual([{ id: 'pen', value: 'red' }]);
		expect(inputs.fields).toEqual([
			{ block: 'contract-1', name: 'c1', value: 'initialled' },
			{ block: 'contract-1', name: 'c2', value: '' },
			{ block: 'contract-1', name: 'sig', value: '' },
			{ block: 'lines-3', name: 'f1', value: '20' }
		]);
		expect(turnInputs(nodes, { pen: 'blue' }, {}).cycles).toEqual([]);
	});
});
