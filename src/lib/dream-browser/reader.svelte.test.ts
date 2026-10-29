import { describe, expect, it } from 'vitest';
import { utterances } from '$lib/dream/speech';
import { passageRuns, rangeFor } from './reader.svelte';

/**
 * Reading a passage as it is drawn (docs/dreams.md, "Read aloud"): what is
 * visible is read, with who says it and how, and nothing else.
 */

function drawn(html: string): HTMLElement {
	const root = document.createElement('div');
	root.className = 'markup';
	root.innerHTML = html;
	document.body.append(root);
	return root;
}

describe('passageRuns', () => {
	it('reads speech in its speaker’s voice with its cue, and leaves out the label', () => {
		const root = drawn(
			'The door shuts. <span class="say" data-who="ines" data-how="low, amused"><span class="speaker" data-unspoken>Ines</span>Sit down.</span> <em class="sound" data-who="ines">sighs</em>'
		);
		const said = utterances(passageRuns(root).runs);
		expect(said.map((entry) => [entry.who, entry.spoken])).toEqual([
			[null, 'The door shuts.'],
			['ines', '[low, amused] Sit down. [sighs]']
		]);
		root.remove();
	});

	it('reads a spoiler only once it is open, and never a button or a hidden part', () => {
		const root = drawn(
			'<p>Before. <button class="spoiler"><span class="blur" aria-hidden="true">secret</span><span class="label" aria-hidden="true">Tap to reveal</span></button></p><p>After.</p><wa-button>Roll a d6</wa-button><span class="stat-change" data-unspoken>+5 composure</span>'
		);
		const { text } = passageRuns(root);
		expect(text).not.toContain('secret');
		expect(text).not.toContain('Roll');
		expect(text).not.toContain('composure');
		expect(utterances(passageRuns(root).runs).map((entry) => entry.spoken)).toEqual([
			'Before. After.'
		]);
		root.remove();
	});

	it('finds the drawn words for a range of its text, across elements', () => {
		const root = drawn('<p>One <strong>two</strong> three.</p>');
		const passage = passageRuns(root);
		const from = passage.text.indexOf('two');
		expect(rangeFor(passage, from, from + 3)?.toString()).toBe('two');
		const start = passage.text.indexOf('One');
		expect(rangeFor(passage, start, passage.text.indexOf('three') + 5)?.toString()).toBe(
			'One two three'
		);
		root.remove();
	});
});
