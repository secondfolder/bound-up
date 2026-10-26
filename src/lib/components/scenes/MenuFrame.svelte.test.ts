import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MENU_DESIGNS, mascotFor, menuCopy } from '$lib/scenes/menu-designs';
import { buildMenuFrame } from '$lib/scenes/menu-frame';
import { defined } from '$lib/testing/defined';
import MenuFrame from './MenuFrame.svelte';

/**
 * A menu's frame is built twice: by `buildMenuFrame` in the editor, and by
 * `MenuFrame.svelte` for a stored version and a design's preview. One
 * stylesheet draws both, so they must be the same elements.
 */

/** An element's shape: its tag, classes, whether it is hidden, and its children's. */
function shape(element: Element): unknown {
	return {
		tag: element.tagName.toLowerCase(),
		className:
			element
				.getAttribute('class')
				?.replace(/\s*svelte-\w+/g, '')
				.trim() ?? '',
		hidden: element.hasAttribute('hidden'),
		text: element.children.length === 0 ? (element.textContent?.trim() ?? '') : undefined,
		children: [...element.children].map(shape)
	};
}

describe('a menu’s frame', () => {
	for (const [id, scale, value] of [
		['diner', null, null],
		['office', 'Intensity', 'Price'],
		['facts', null, 'Price'],
		['clinic', 'Dose', null],
		['pet', null, null]
	] as const) {
		it(`is the same in the editor and out of it (${id}, key: ${scale ?? 'none'})`, () => {
			const design = MENU_DESIGNS[id];
			// One of its copy rewritten, where it has any.
			const copy = { office: { memo: 'TO: Whoever is reading\nFROM: Me' } };
			const { container } = render(MenuFrame, {
				design,
				subtitle: 'For two',
				scale,
				value,
				copy
			});
			const drawn = defined(container.querySelector('.scene-menu'), 'the drawn menu');

			const built = document.createElement('section');
			buildMenuFrame(built, {
				title: design.title,
				subtitle: 'For two',
				key: { scale, value, valueKey: design.valueKey },
				copy: menuCopy(design, copy),
				mascot: design.mascot
					? { ...defined(mascotFor(design, {}), 'its mascot'), label: design.mascot.label }
					: null
			});

			// The menu's own element differs by who made it; what is inside must not.
			expect([...drawn.children].map(shape)).toEqual([...built.children].map(shape));
		});
	}

	it('shows a design’s copy as the menu rewrote it, and only on that design', () => {
		const copy = { letter: { signoff: 'Yours, always' } };
		const letter = render(MenuFrame, { design: MENU_DESIGNS.letter, copy });
		expect(letter.container.querySelector('[data-copy="signoff"]')).toHaveTextContent(
			'Yours, always'
		);
		expect(letter.container.querySelector('[data-copy="date"]')).toHaveTextContent(
			'Saturday evening'
		);
		const facts = render(MenuFrame, { design: MENU_DESIGNS.facts, copy });
		expect(facts.container.querySelector('[data-copy="signoff"]')).toBeNull();
	});
});
