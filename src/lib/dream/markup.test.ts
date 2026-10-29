import { describe, expect, it } from 'vitest';
import {
	createMarkupStream,
	escapeMarkup,
	findTag,
	findTags,
	type MarkupNode,
	type MarkupTag,
	parseMarkup,
	plainText,
	tagText
} from './markup';

function only(nodes: MarkupNode[]): MarkupTag {
	const [first] = nodes;
	if (first?.type !== 'tag') {
		throw new Error(`expected a single tag, got ${JSON.stringify(nodes)}`);
	}
	return first;
}

const PASSAGE = `Ottilie doesn't look up when you come in.
<say who="ottilie">"Shoes by the door. Then the chair."</say>
<beat/>
On the chair, a folded card. <hidden label="the card">Today you will not speak unless asked.</hidden>
She's dressed differently: <more>her outfit</more>. Through the wall, [[jun|someone]] practises.
<set you.poise="+5">You don't move. She notices.</set>
<say who="ottilie">"Next time you'll wear <cycle id="wear">the collar|nothing|your shirt</cycle>."</say>
<ask as="ottilie" keep="story">"Do you want to know what today is for?"
<option>Tell me</option><option>Don't</option></ask>
<after>
{"next": "She makes them hold the first position."}
</after>`;

describe('parseMarkup', () => {
	it('reads tags, attributes, self-closing tags and refs', () => {
		const nodes = parseMarkup(PASSAGE, { final: true });
		expect(findTags(nodes, 'say').map((tag) => tag.attrs.who)).toEqual(['ottilie', 'ottilie']);
		expect(findTag(nodes, 'beat')).toMatchObject({ complete: true, children: [] });
		expect(findTag(nodes, 'hidden')?.attrs.label).toBe('the card');
		expect(findTag(nodes, 'set')?.attrs['you.poise']).toBe('+5');
		expect(tagText(nodes, 'cycle')).toBe('the collar|nothing|your shirt');
		expect(findTags(nodes, 'option').map((tag) => plainText(tag.children))).toEqual([
			'Tell me',
			"Don't"
		]);
		expect(nodes).toContainEqual({ type: 'ref', id: 'jun', text: 'someone' });
	});

	it('keeps the footer raw, so its JSON is never parsed as markup', () => {
		const after = findTag(parseMarkup(PASSAGE, { final: true }), 'after');
		expect(after?.children).toEqual([
			{ type: 'text', text: '\n{"next": "She makes them hold the first position."}\n' }
		]);
	});

	it('keeps prose that only looks like markup as text', () => {
		const prose = 'I <3 you, and 2 < 3, and [not a ref], and [[ also not ]].';
		expect(plainText(parseMarkup(prose, { final: true }))).toBe(prose);
	});

	it('ignores a close tag nothing opened, and closes what was left open', () => {
		const nodes = parseMarkup('one </say> two <whisper>three', { final: true });
		expect(plainText(nodes)).toBe('one  two three');
		expect(findTag(nodes, 'whisper')).toMatchObject({ complete: false });
	});

	it('closes an inner tag the model forgot when its parent closes', () => {
		const tag = only(parseMarkup('<say who="a"><whisper>hush</say>', { final: true }));
		expect(tag).toMatchObject({ name: 'say', complete: true });
		expect(findTag(tag.children, 'whisper')).toMatchObject({ complete: false });
	});

	it('reads lower-cased names and every attribute form', () => {
		const tag = only(parseMarkup(`<Block KIND="report" title='Week 3' date=Thursday open/>`));
		expect(tag.name).toBe('block');
		expect(tag.attrs).toEqual({ kind: 'report', title: 'Week 3', date: 'Thursday', open: '' });
	});

	it('decodes the common entities', () => {
		expect(plainText(parseMarkup('a &lt;b&gt; &amp; &quot;c&quot;', { final: true }))).toBe(
			'a <b> & "c"'
		);
	});

	it('round-trips escaped text', () => {
		const text = 'She wrote <3 & "left".';
		expect(plainText(parseMarkup(escapeMarkup(text), { final: true }))).toBe(text);
	});
});

describe('createMarkupStream', () => {
	it('never shows part of a tag or ref as text, at any split', () => {
		const final = plainText(parseMarkup(PASSAGE, { final: true }));
		for (let at = 0; at <= PASSAGE.length; at += 1) {
			const shown = plainText(parseMarkup(PASSAGE.slice(0, at)));
			// Raw content (the footer) streams as-is, so compare up to it.
			const visible = shown.split('\n{"next"')[0] ?? '';
			expect(final.startsWith(visible), `split at ${at}: ${JSON.stringify(visible)}`).toBe(true);
		}
	});

	it('ends with exactly the whole-text parse', () => {
		const stream = createMarkupStream();
		for (const chunk of PASSAGE.match(/[\s\S]{1,7}/g) ?? []) {
			stream.push(chunk);
		}
		expect(stream.end()).toEqual(parseMarkup(PASSAGE, { final: true }));
	});

	it('reads a passage of blocks, fields and cycles the same however it is split', () => {
		const passage = `You read it twice. <cycle id="pen" label="the pen">blue|black</cycle>
<block kind="contract" title="Terms">
<field id="c1" type="initial">You will kneel when she enters.</field>
<field id="c2" type="choice" label="Weekends">Yes<option>Yes</option><option>No</option></field>
<field id="sig" type="sign">Sign here</field>
</block>
<texts><say who="ines">Well?</say><say who="you">Signed.</say></texts>
<after>
{"next":"She reads it."}
</after>`;
		const whole = parseMarkup(passage, { final: true });
		for (const size of [1, 2, 3, 5, 8, 13]) {
			const stream = createMarkupStream();
			for (const chunk of passage.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? []) {
				stream.push(chunk);
			}
			expect(stream.end(), `chunks of ${size}`).toEqual(whole);
		}
		for (let at = 0; at <= passage.length; at += 1) {
			const stream = createMarkupStream();
			stream.push(passage.slice(0, at));
			stream.push(passage.slice(at));
			expect(stream.end(), `split at ${at}`).toEqual(whole);
		}
	});

	it('marks a tag still streaming as incomplete', () => {
		const stream = createMarkupStream();
		const nodes = stream.push('On the chair. <hidden label="card">Today you will');
		expect(findTag(nodes, 'hidden')).toMatchObject({ complete: false });
	});
});
