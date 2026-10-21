import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { storedOffset } from '$lib/daydream/passage-selection';
import { defined } from '$lib/testing/defined';
import DaydreamProse from './DaydreamProse.svelte';

const cast = { you: ['you'], characters: ['Mara Quinn', 'Jo'] };

/** The text node holding `words`, in a passage drawn into `container`. */
function textNode(container: HTMLElement, words: string): Text {
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if ((node as Text).data.includes(words)) {
			return node as Text;
		}
	}
	throw new Error(`no text node with "${words}"`);
}

describe('DaydreamProse', () => {
	it('draws paragraphs, a scene break and emphasis, with none of the markup', () => {
		const { container } = render(DaydreamProse, {
			text: 'She **waits**.\n\n* * *\n\n*Later,* you come in.',
			cast
		});
		const paragraphs = container.querySelectorAll('.prose > p');
		expect([...paragraphs].map((p) => p.textContent)).toEqual([
			'She waits.',
			'Later, you come in.'
		]);
		expect(container.querySelector('.scene-break')?.tagName).toBe('HR');
		expect(container.querySelector('strong')?.textContent).toBe('waits');
		expect(container.querySelector('em')?.textContent).toBe('Later,');
		expect(paragraphs[1]?.classList.contains('after-break')).toBe(true);
		expect(container.textContent).not.toMatch(/[*]/);
	});

	it('draws bold at 800 inside a sentence too, not only in a standout line', () => {
		const { container } = render(DaydreamProse, { text: 'You *always* **fold**.', cast });
		expect(
			getComputedStyle(defined(container.querySelector('strong'), 'the bold run')).fontWeight
		).toBe('800');
	});

	it('draws a paragraph that is bold throughout as a standout line, larger than the rest', () => {
		const { container } = render(DaydreamProse, {
			text: '**Being owned is a relief.**\n\nI mean it.',
			cast
		});
		const [statement, after] = [...container.querySelectorAll<HTMLElement>('.prose > p')];
		expect(statement?.classList.contains('standout')).toBe(true);
		expect(
			getComputedStyle(defined(statement?.querySelector('strong'), 'its bold run')).fontWeight
		).toBe('800');
		expect(after?.classList.contains('standout')).toBe(false);
		expect(Number.parseFloat(getComputedStyle(defined(statement)).fontSize)).toBeGreaterThan(
			Number.parseFloat(getComputedStyle(defined(after)).fontSize)
		);
	});

	it('colours each voice its own, without naming the speaker', () => {
		const { container } = render(DaydreamProse, {
			text: '<say who="Mara">"Sit."</say> She waits. <say who="Jo">"No."</say> "Who said that?"',
			cast
		});
		const lines = [...container.querySelectorAll<HTMLElement>('.dialogue')];
		expect(lines.map((line) => line.textContent)).toEqual(['"Sit."', '"No."', '"Who said that?"']);
		expect(lines.map((line) => line.style.getPropertyValue('--voice'))).toEqual([
			'var(--daydream-voice-1)',
			'var(--daydream-voice-2)',
			''
		]);
		// Who is speaking is for the colour; the story already says it.
		expect(container.textContent).not.toContain('Mara');
		// Unattributed dialogue takes the dialogue colour, which narration does not.
		// The token is the theme's, which component tests do not load.
		container.style.setProperty('--daydream-dialogue', 'rgb(1, 2, 3)');
		expect(getComputedStyle(lines[2] as HTMLElement).color).toBe('rgb(1, 2, 3)');
		const narration = defined(textNode(container, 'She waits').parentElement);
		expect(getComputedStyle(narration).color).not.toBe('rgb(1, 2, 3)');
		expect(container.textContent).not.toContain('<say');
	});

	it('sets a thought apart from speech, in italics and its thinker’s colour, never as dialogue', () => {
		const { container } = render(DaydreamProse, {
			text: '<say who="Mara">"Fine."</say> <thought who="Mara">It is not fine.</thought>',
			cast
		});
		const [thought] = [...container.querySelectorAll<HTMLElement>('.thought')];
		expect(thought?.textContent).toBe('It is not fine.');
		expect(thought?.classList.contains('dialogue')).toBe(false);
		expect(thought?.style.getPropertyValue('--voice')).toBe('var(--daydream-voice-1)');
		expect(getComputedStyle(defined(thought)).fontStyle).toBe('italic');
		expect(container.textContent).not.toContain('<thought');
	});

	it('sets sounds apart, in their own colour outside a line and the speaker’s inside one', () => {
		const { container } = render(DaydreamProse, {
			text: 'A <sound>crack</sound>. <say who="Mara">"<sound>Ah</sound> — more."</say>',
			cast
		});
		container.style.setProperty('--daydream-sound', 'rgb(4, 5, 6)');
		const sounds = [...container.querySelectorAll<HTMLElement>('.sound')];
		expect(sounds.map((sound) => sound.textContent)).toEqual(['crack', 'Ah']);
		expect(getComputedStyle(defined(sounds[0])).fontVariantCaps).toBe('all-small-caps');
		expect(getComputedStyle(defined(sounds[0])).color).toBe('rgb(4, 5, 6)');
		expect(defined(sounds[1]).style.getPropertyValue('--voice')).toBe('var(--daydream-voice-1)');
		expect(getComputedStyle(defined(sounds[1])).color).not.toBe('rgb(4, 5, 6)');
		expect(container.textContent).not.toContain('<sound');
	});

	it('highlights a quote across formatting', () => {
		const text = 'She **holds** still.';
		const { container } = render(DaydreamProse, {
			text,
			cast,
			quotes: [{ start: 6, end: 15, text: text.slice(6, 15) }]
		});
		expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
			'holds',
			' s'
		]);
		expect(container.querySelector('mark')?.classList.contains('bold')).toBe(true);
	});

	it('draws lists as lists, keeping an ordered list’s own numbers, with none of the markers', () => {
		const { container } = render(DaydreamProse, {
			text: 'Say it with me:\n- I am an *object*.\n- I exist to be used.\n\n3. Kneel.\n4. Wait.',
			cast
		});
		const bullets = [...container.querySelectorAll('.prose > ul > li')];
		expect(bullets.map((item) => item.textContent)).toEqual([
			'I am an object.',
			'I exist to be used.'
		]);
		expect(bullets[0]?.querySelector('em')?.textContent).toBe('object');
		const numbered = [...container.querySelectorAll<HTMLLIElement>('.prose > ol > li')];
		expect(numbered.map((item) => [item.value, item.textContent])).toEqual([
			[3, 'Kneel.'],
			[4, 'Wait.']
		]);
		expect(container.querySelector('.prose > p')?.textContent).toBe('Say it with me:');
	});

	it('hides markup still arriving', () => {
		const { container } = render(DaydreamProse, {
			text: 'She says <say who="Ma',
			cast,
			streaming: true
		});
		expect(container.textContent?.trim()).toBe('She says');
	});
});

describe('storedOffset', () => {
	const text = 'She **holds** <say who="Mara">"still"</say>.';

	it('maps a point in the drawn text to the stored offset, past hidden markup', () => {
		const { container } = render(DaydreamProse, { text, cast });
		const root = container.querySelector('.prose') as HTMLElement;
		const holds = textNode(container, 'holds');
		expect(storedOffset(root, holds, 0)).toBe(text.indexOf('holds'));
		expect(storedOffset(root, holds, 5)).toBe(text.indexOf('holds') + 5);
		const still = textNode(container, 'still');
		expect(storedOffset(root, still, 1)).toBe(text.indexOf('still'));
	});

	it('maps a point in a list item past its hidden marker', () => {
		const listed = 'Rules:\n- Kneel.\n- Wait.';
		const { container } = render(DaydreamProse, { text: listed, cast });
		const root = container.querySelector('.prose') as HTMLElement;
		expect(storedOffset(root, textNode(container, 'Wait'), 0)).toBe(listed.indexOf('Wait'));
	});

	it('takes a point between elements as the start of the next run, or the end of the last', () => {
		const { container } = render(DaydreamProse, { text, cast });
		const root = container.querySelector('.prose') as HTMLElement;
		const paragraph = root.querySelector('p') as HTMLElement;
		expect(storedOffset(root, paragraph, 0)).toBe(0);
		expect(storedOffset(root, paragraph, paragraph.childNodes.length)).toBe(text.length);
	});
});
