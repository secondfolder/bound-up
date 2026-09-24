import type { SerializedEditorState } from 'lexical';
import { describe, expect, it } from 'vitest';
import { toEditorDocument, toStoredDocument } from '$lib/lexical/document-shape';
import { BLOCK_CONTINUATION_KEY } from '$lib/lexical/transformers/mend-split-blocks';
import type { RichTextDocument, RichTextInlineNode } from '$lib/richtext';

/**
 * The bridge between the two shapes of the same document: embeds inline in
 * storage, embeds at the root in the editor.
 *
 * The rule these cases exist to hold is that the two directions are exact
 * inverses. A document that comes back from the editor differing from the one
 * that went in is a message whose line structure changed while somebody looked
 * at it — the failure this whole arrangement is built to avoid.
 */

const url = 'https://i.imgur.com/cat.jpg';
const text = (value: string): RichTextInlineNode => ({ type: 'text', text: value, format: 0 });
const br: RichTextInlineNode = { type: 'linebreak' };
const embed: RichTextInlineNode = { type: 'embed', url };
const link: RichTextInlineNode = {
	type: 'autolink',
	url,
	isUnlinked: false,
	children: [{ type: 'text', text: url, format: 0 }]
};
const paragraph = (...children: RichTextInlineNode[]) => ({ type: 'paragraph' as const, children });
const doc = (...blocks: ReturnType<typeof paragraph>[]): RichTextDocument => ({
	root: { type: 'root', children: blocks }
});

/** The block types the editor document ends up with, in order. */
const shape = (document: RichTextDocument) =>
	document.root.children.map((block) => block.type).join(' / ');

/** Editor JSON back through the return leg, as the composer does on save. */
const roundTrip = (stored: RichTextDocument): RichTextDocument =>
	toStoredDocument(
		toEditorDocument(stored) as unknown as SerializedEditorState
	) as unknown as RichTextDocument;

describe('the editor shape of a document with embeds', () => {
	it('lifts an embed out of the line it sits on', () => {
		const stored = doc(paragraph(text('look'), br, embed, link));
		expect(shape(toEditorDocument(stored))).toBe('paragraph / embed / paragraph');
	});

	it('leaves no empty half when the embed opens the paragraph', () => {
		const stored = doc(paragraph(embed, text('hello '), link));
		// An empty paragraph is a blank row on screen, and the writer did not
		// type one.
		expect(shape(toEditorDocument(stored))).toBe('embed / paragraph');
	});

	it('marks only the half that has something to go back to', () => {
		const cut = toEditorDocument(doc(paragraph(text('look'), br, embed, link)));
		const opening = toEditorDocument(doc(paragraph(embed, link)));
		const marked = (document: RichTextDocument) =>
			document.root.children.map(
				(block) =>
					// biome-ignore lint/style/useNamingConvention: Lexical's own key for node state.
					(block as { $?: Record<string, boolean> }).$?.[BLOCK_CONTINUATION_KEY] === true
			);

		expect(marked(cut)).toEqual([false, false, true]);
		// Nothing above it to rejoin with: marking this would swallow whatever
		// block happens to precede the embed.
		expect(marked(opening)).toEqual([false, false]);
	});

	it('stacks two embeds from one line as two blocks', () => {
		const second = 'https://i.imgur.com/dog.jpg';
		const stored = doc(
			paragraph(text('two'), br, embed, { type: 'embed', url: second }, link, text(' and '), {
				...link,
				url: second
			})
		);
		expect(shape(toEditorDocument(stored))).toBe('paragraph / embed / embed / paragraph');
	});

	it('leaves a document with no embeds exactly as it found it', () => {
		const stored = doc(paragraph(text('nothing here'), br, text('or here')));
		expect(toEditorDocument(stored)).toBe(stored);
		expect(roundTrip(stored)).toEqual(stored);
	});
});

describe('the return leg', () => {
	const cases: { what: string; stored: RichTextDocument }[] = [
		{
			what: 'an embed above the second line',
			stored: doc(paragraph(text('look'), br, embed, link))
		},
		{ what: 'an embed opening the paragraph', stored: doc(paragraph(embed, text('hello '), link)) },
		{
			what: 'an embed under a blank line',
			stored: doc(paragraph(text('hi'), br, br, embed, text('watch '), link))
		},
		{
			what: 'two paragraphs, one with an embed',
			stored: doc(paragraph(text('first')), paragraph(embed, text('second '), link))
		},
		{
			what: 'an embed in each of two paragraphs',
			stored: doc(paragraph(text('a'), br, embed, link), paragraph(text('b'), br, embed, link))
		}
	];

	for (const { what, stored } of cases) {
		it(`gives back exactly what came in: ${what}`, () => {
			expect(roundTrip(stored)).toEqual(stored);
		});
	}

	/**
	 * A paragraph after an embed that was never cut from anything keeps its own
	 * boundary. Getting this wrong joins two paragraphs the writer meant to
	 * keep apart — which is what the mark is for.
	 */
	it('does not join blocks the writer separated', () => {
		const stored = doc(paragraph(text('first')), paragraph(embed, text('second '), link));
		expect(shape(roundTrip(stored))).toBe('paragraph / paragraph');
	});
});
