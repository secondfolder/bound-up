import { fireEvent, render } from '@testing-library/svelte';
import {
	$createNodeSelection as createNodeSelection,
	$createTextNode as createTextNode,
	getNearestEditorFromDOMNode,
	// biome-ignore lint/suspicious/noDeprecatedImports: only the overload that takes a type argument is deprecated, and this calls the plain one.
	$getNodeByKey as getNodeByKey,
	$getRoot as getRoot,
	$isElementNode as isElementNode,
	type LexicalEditor,
	$setSelection as setSelection
} from 'lexical';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CachedEmbedDetails, clearOembedCache } from '$lib/embeds';
import { FORMAT_BOLD, FORMAT_ITALIC, FORMAT_STRIKETHROUGH } from '$lib/richtext';
import { $isEmbedNode as isEmbedNode } from '$lib/richtext-editor';
import { defined } from '$lib/testing/defined';
import { waProp } from '$lib/testing/web-awesome';
import RichTextEditorHarness from './RichTextEditorHarness.svelte';

/**
 * Keystroke-by-keystroke typing, with a real caret, lives in the Playwright
 * suite.
 *
 * Everything here goes through `RichTextEditorHarness`, which feeds each change
 * back into `value` the way a form does. That loop is what the editor has to
 * survive, and it cannot be reproduced with `rerender`: replacing the props
 * object re-runs the setup effect on its own, so a test built that way passes
 * and fails for reasons that have nothing to do with the component.
 */

/**
 * The live editor behind a mounted surface.
 *
 * Lexical hangs it off the root element, which is how its own devtools find it.
 * Reached for here because a real edit is the only thing that makes the
 * component emit, and the bug under test only appears once it has.
 */
function editorOf(container: HTMLElement): LexicalEditor {
	const editor = getNearestEditorFromDOMNode(container.querySelector('.surface'));
	if (!editor) {
		throw new Error('no Lexical editor mounted on .surface');
	}
	return editor;
}

/** Appends text the way a keystroke would, so the update listener fires. */
function typeInto(container: HTMLElement, value: string) {
	editorOf(container).update(
		() => {
			const first = getRoot().getFirstChild();
			if (first && 'append' in first) {
				(first as unknown as { append: (node: unknown) => void }).append(createTextNode(value));
			}
		},
		{ discrete: true }
	);
}

afterEach(() => {
	// The composer's preview lookup is cached per URL for the page; without
	// this a stub from one case answers the next one's question.
	clearOembedCache();
	vi.unstubAllGlobals();
});

describe('RichTextEditor', () => {
	it('mounts an editing surface', async () => {
		const { container } = render(RichTextEditorHarness);
		await tick();
		const surface = container.querySelector('.surface');
		expect(surface?.getAttribute('contenteditable')).toBe('true');
		expect(surface?.getAttribute('data-lexical-editor')).toBe('true');
	});

	it('loads an existing document', async () => {
		const stored = JSON.stringify({
			root: {
				type: 'root',
				children: [
					{ type: 'paragraph', children: [{ type: 'text', text: 'already here', format: 0 }] }
				]
			}
		});
		const { container } = render(RichTextEditorHarness, { props: { initial: stored } });
		await tick();
		expect(container.querySelector('.surface')?.textContent).toContain('already here');
	});

	/**
	 * The regression this file was written for.
	 *
	 * `TaskForm` feeds `onChange` straight back into `value`, so `value` changes
	 * on every keystroke. While the editor's setup effect read `value`, that
	 * rebuilt the whole editor between keystrokes: the caret went back to the
	 * start, so characters landed in reverse order, and a selection was dropped
	 * the instant it was made.
	 */
	it('survives its own change being fed back by the parent', async () => {
		const { container } = render(RichTextEditorHarness);
		await tick();

		const surface = container.querySelector('.surface');
		const editorBefore = editorOf(container);

		typeInto(container, 'a');
		await tick();

		// The same element, the same editor instance, and the text still there.
		expect(container.querySelector('.surface')).toBe(surface);
		expect(editorOf(container)).toBe(editorBefore);
		expect(surface?.textContent).toContain('a');
	});

	it('keeps accumulating across several changes rather than only the first', async () => {
		const { container } = render(RichTextEditorHarness);
		await tick();

		const editorBefore = editorOf(container);
		for (const character of ['a', 'b', 'c']) {
			typeInto(container, character);
			await tick();
		}

		expect(editorOf(container)).toBe(editorBefore);
		expect(container.querySelector('.surface')?.textContent).toContain('abc');
	});

	/**
	 * Lexical draws a text node as *one* tag: `getElementInnerTag` returns
	 * `strong` for bold, `em` for italic, and never both. Every format past that
	 * first tag is carried by a theme class instead, so an editor built without
	 * a theme silently shows only one of the formats a node actually has —
	 * bold+italic looked merely bold, and strikethrough looked like nothing at
	 * all, while the stored document had the bits set all along.
	 *
	 * Asserting on the class names rather than on computed style is deliberate:
	 * the class is the whole mechanism.
	 */
	it('marks every format on a text node, not just the first', async () => {
		const stored = JSON.stringify({
			root: {
				type: 'root',
				children: [
					{
						type: 'paragraph',
						children: [
							{ type: 'text', text: 'both', format: FORMAT_BOLD | FORMAT_ITALIC },
							{ type: 'text', text: 'struck', format: FORMAT_STRIKETHROUGH }
						]
					}
				]
			}
		});
		const { container } = render(RichTextEditorHarness, { props: { initial: stored } });
		await tick();

		const both = container.querySelector('.surface strong');
		expect(both?.textContent).toBe('both');
		expect(both?.className).toContain('rt-italic');

		const struck = [...container.querySelectorAll('.surface *')].find(
			(element) => element.textContent === 'struck'
		);
		expect(struck?.className).toContain('rt-strikethrough');
	});

	it('still accepts a value that genuinely arrives from outside', async () => {
		const { container, component } = render(RichTextEditorHarness);
		await tick();

		(component as unknown as { replace: (next: string) => void }).replace(
			JSON.stringify({
				root: {
					type: 'root',
					children: [
						{ type: 'paragraph', children: [{ type: 'text', text: 'replaced', format: 0 }] }
					]
				}
			})
		);
		await tick();

		expect(container.querySelector('.surface')?.textContent).toContain('replaced');
	});
});

/* ── embeds ─────────────────────────────────────────────────────────────── */

/**
 * A document with an embeddable link and the embed the composer would have put
 * at the start of its line. Written out rather than typed in, because a real
 * auto-link needs a caret and a keystroke — that half lives in the Playwright
 * suite.
 */
const WITH_EMBED = JSON.stringify({
	root: {
		type: 'root',
		children: [
			{
				type: 'paragraph',
				children: [
					{ type: 'text', text: 'look', format: 0 },
					{ type: 'linebreak' },
					{ type: 'embed', url: 'https://i.imgur.com/cat.jpg' },
					{
						type: 'autolink',
						url: 'https://i.imgur.com/cat.jpg',
						isUnlinked: false,
						children: [{ type: 'text', text: 'https://i.imgur.com/cat.jpg', format: 0 }]
					}
				]
			}
		]
	}
});

/** The same, for a URL whose preview is a player — an iframe to press or miss. */
const WITH_PLAYER = JSON.stringify({
	root: {
		type: 'root',
		children: [
			{
				type: 'paragraph',
				children: [
					{ type: 'text', text: 'look', format: 0 },
					{ type: 'linebreak' },
					{ type: 'embed', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
					{
						type: 'autolink',
						url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						isUnlinked: false,
						children: [
							{ type: 'text', text: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format: 0 }
						]
					}
				]
			}
		]
	}
});

function embedChips(container: HTMLElement): Element[] {
	return [...container.querySelectorAll('.richtext-embed')];
}

/**
 * Answers the composer's own preview lookup.
 *
 * The composer resolves the same details the send path will, so that what the
 * writer sees is what the reader gets. Without this stub it draws nothing
 * until the lookup fails, which is also what it should do.
 */
function stubEmbedMetadata(url: string, over: Partial<CachedEmbedDetails> = {}) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () =>
			Response.json({
				embeds: [
					{
						href: url,
						fetchedAt: Date.now(),
						kind: 'image',
						providerName: 'Imgur',
						title: 'A cat',
						description: null,
						thumbnailUrl: null,
						canonicalUrl: url,
						imageUrl: url,
						iframeSrc: null,
						iframeHeight: null,
						faviconUrl: null,
						themeColor: null,
						...over
					}
				]
			})
		)
	);
}

/**
 * The embed's remove button, once it is there.
 *
 * Waited for because the embed draws nothing — its actions row included —
 * until its preview lookup settles, rather than a skeleton that flashes and
 * is replaced a moment later.
 */
function removeButton(container: HTMLElement): Promise<HTMLElement> {
	return vi.waitFor(() => {
		const button = container.querySelector('.composer-embed .remove');
		if (!(button instanceof HTMLElement)) {
			throw new Error('no remove button on the embed');
		}
		return button;
	});
}

describe('RichTextEditor, embeds', () => {
	/**
	 * The composer shows the real embed, not a stand-in: what the writer sees
	 * while typing is what the reader gets. Lexical renders nothing for a
	 * decorator on its own, so this is also the assertion that the mounting in
	 * `RichTextEditor.svelte` actually runs.
	 */
	it('mounts the real embed into the editor, with a remove button', async () => {
		stubEmbedMetadata('https://i.imgur.com/cat.jpg');
		const { container } = render(RichTextEditorHarness, { props: { initial: WITH_EMBED } });
		await tick();

		// The resolved card, title and all — the same one the reader gets, not a
		// bare image the writer cannot tell apart from a broken link.
		await vi.waitFor(() => {
			expect(container.querySelector('.surface .card')?.textContent).toContain('A cat');
		});
		expect(container.querySelector('.surface img')?.getAttribute('src')).toBe(
			'https://i.imgur.com/cat.jpg'
		);
		// A `wa-button` takes its name from its icon's label.
		expect(waProp((await removeButton(container)).querySelector('wa-icon'), 'label')).toBe(
			'Remove embedded preview of https://i.imgur.com/cat.jpg'
		);
	});

	/**
	 * One appearance, not two. The lookup runs while the writer is still
	 * typing, so nothing is waiting on it — a skeleton that is replaced by the
	 * card a moment later is just a second flash.
	 */
	it('draws nothing until the preview is ready, then the finished card', async () => {
		let answer: ((response: Response) => void) | undefined;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						answer = resolve;
					})
			)
		);
		const { container } = render(RichTextEditorHarness, { props: { initial: WITH_EMBED } });
		await tick();

		const embed = await vi.waitFor(() => {
			const found = container.querySelector('.composer-embed .url-embed');
			if (!found) {
				throw new Error('expected the embed to be mounted');
			}
			return found;
		});
		await vi.waitFor(() => expect(answer).toBeDefined());
		// Mounted and asking, but drawing nothing: no placeholder, no bare image.
		expect(embed.children.length).toBe(0);

		answer?.(
			Response.json({
				embeds: [
					{
						href: 'https://i.imgur.com/cat.jpg',
						fetchedAt: Date.now(),
						kind: 'image',
						providerName: 'Imgur',
						title: 'A cat',
						description: null,
						thumbnailUrl: null,
						canonicalUrl: null,
						imageUrl: 'https://i.imgur.com/cat.jpg',
						iframeSrc: null,
						iframeHeight: null,
						faviconUrl: null,
						themeColor: null
					}
				]
			})
		);
		await vi.waitFor(() => {
			expect(embed.querySelector('.card')?.textContent).toContain('A cat');
		});
	});

	/**
	 * The bug this cost the most time to find.
	 *
	 * `@lexical/link` unwraps an auto-link whose previous sibling is not text or
	 * a line break, and an embed at the start of the link's line is exactly
	 * that. The link silently became plain text on load — and for a description,
	 * saving afterwards wrote the loss back. The fix is to settle the link, so
	 * assert on what a reader would see: an anchor, still.
	 */
	it('keeps the link a link with an embed sitting in front of it', async () => {
		const { container, component } = render(RichTextEditorHarness, {
			props: { initial: WITH_EMBED }
		});
		await tick();

		const anchor = container.querySelector('.surface a');
		expect(anchor?.getAttribute('href')).toBe('https://i.imgur.com/cat.jpg');
		expect(anchor?.textContent).toBe('https://i.imgur.com/cat.jpg');

		// And it survives being serialised back out, which is what gets stored.
		const stored = (component as unknown as { current: () => string }).current();
		expect(stored).toContain('https://i.imgur.com/cat.jpg');
		expect(JSON.parse(stored || '{}')).toBeTruthy();
	});

	/**
	 * What selecting an embed has to look like, and what merely standing next to
	 * it must not.
	 *
	 * Arrowing onto an inline decorator makes the node itself the selection —
	 * `$createNodeSelection` is that exact state. The caret is then out of the
	 * text, which is why the next Backspace takes the whole embed and why there
	 * is nothing on screen to say so unless the embed says it.
	 *
	 * The caret stop immediately beside the embed is an ordinary text position
	 * and is emphatically not that state, so it must not be marked: marking it
	 * too made the embed look selected for two presses of the arrow key, only
	 * one of which meant it.
	 */
	it('marks the embed only while it is the selection', async () => {
		const { container } = render(RichTextEditorHarness, { props: { initial: WITH_EMBED } });
		await tick();
		const editor = editorOf(container);
		const surface = container.querySelector('.surface');
		const embed = container.querySelector('.surface .richtext-embed');
		expect(embed?.classList.contains('is-selected')).toBe(false);

		const embedNode = () =>
			editor.getEditorState().read(() => {
				const paragraph = getRoot().getFirstChild();
				const node = isElementNode(paragraph)
					? paragraph.getChildren().find(isEmbedNode)
					: undefined;
				if (!node) {
					throw new Error('expected an embed node');
				}
				return node.getKey();
			});
		const key = embedNode();

		// Beside it: a caret, in the text, with the embed just behind it.
		editor.update(
			() => {
				const node = getNodeByKey(key);
				node?.selectNext(0, 0);
			},
			{ discrete: true }
		);
		await tick();
		expect(embed?.classList.contains('is-selected')).toBe(false);
		expect(surface?.classList.contains('widget-selected')).toBe(false);

		// On it: no caret anywhere, the node itself selected.
		editor.update(
			() => {
				const selection = createNodeSelection();
				selection.add(key);
				setSelection(selection);
			},
			{ discrete: true }
		);
		await tick();
		expect(embed?.classList.contains('is-selected')).toBe(true);
		// And no text caret is drawn while that is true, because there is no text
		// position to draw — the browser would otherwise park one at the start.
		expect(surface?.classList.contains('widget-selected')).toBe(true);

		// And moving off it again clears both.
		editor.update(
			() => {
				getRoot().selectEnd();
			},
			{ discrete: true }
		);
		await tick();
		expect(embed?.classList.contains('is-selected')).toBe(false);
		expect(surface?.classList.contains('widget-selected')).toBe(false);
	});

	/**
	 * An embed caught inside an ordinary text selection.
	 *
	 * Dragging across one selects it as surely as arrowing onto it does — it is
	 * in the range, it will go when the range is typed over — so it has to say
	 * so. The caret is a different matter: the range has one, so it stays drawn,
	 * unlike when the embed is the whole selection.
	 */
	it('marks an embed that a text selection runs across', async () => {
		const { container } = render(RichTextEditorHarness, { props: { initial: WITH_EMBED } });
		await tick();
		const editor = editorOf(container);
		const embed = container.querySelector('.surface .richtext-embed');
		const surface = container.querySelector('.surface');

		editor.update(
			() => {
				const block = getRoot().getFirstChild();
				if (!isElementNode(block)) {
					throw new Error('expected a paragraph');
				}
				// From the start of the text above it to the end of the link below.
				block.select(0, block.getChildrenSize());
			},
			{ discrete: true }
		);
		await tick();
		expect(embed?.classList.contains('is-selected')).toBe(true);
		// The selection has a caret of its own, so nothing is hidden.
		expect(surface?.classList.contains('widget-selected')).toBe(false);
	});

	/**
	 * Pressing the card, which is the gesture that had no effect at all: the
	 * preview swallows pointer events so the caret simply stayed where it was,
	 * and the embed read as part of the wallpaper.
	 */
	it('selects the embed when its card is pressed', async () => {
		const { container } = render(RichTextEditorHarness, { props: { initial: WITH_EMBED } });
		await tick();
		const card = container.querySelector('.composer-embed');
		if (!card) {
			throw new Error('expected a composer embed');
		}

		await fireEvent.pointerDown(card, { clientX: 4, clientY: 4 });
		await tick();

		expect(container.querySelector('.richtext-embed')?.classList.contains('is-selected')).toBe(
			true
		);
		expect(container.querySelector('.surface')?.classList.contains('widget-selected')).toBe(true);
	});

	/**
	 * Except over a player, which is not the card. Everything inside the preview
	 * is `pointer-events: none`, so the press lands on the same element wherever
	 * it was aimed and only the geometry can tell the two apart.
	 */
	it('leaves a press on the player alone', async () => {
		const { container } = render(RichTextEditorHarness, { props: { initial: WITH_PLAYER } });
		await tick();
		const card = container.querySelector('.composer-embed');
		if (!card) {
			throw new Error('expected a composer embed');
		}
		// The player appears once the details lookup has settled,
		// which it does by failing: there is no server here.
		const frame = await vi.waitFor(() => {
			const found = container.querySelector('.composer-embed iframe');
			if (!found) {
				throw new Error('expected a player in the composer');
			}
			return found;
		});

		frame.getBoundingClientRect = () =>
			({ left: 10, top: 10, right: 60, bottom: 50, width: 50, height: 40 }) as DOMRect;

		await fireEvent.pointerDown(card, { clientX: 30, clientY: 30 });
		await tick();
		expect(container.querySelector('.richtext-embed')?.classList.contains('is-selected')).toBe(
			false
		);

		// And the card around it still selects, at a point outside the frame.
		await fireEvent.pointerDown(card, { clientX: 4, clientY: 4 });
		await tick();
		expect(container.querySelector('.richtext-embed')?.classList.contains('is-selected')).toBe(
			true
		);
	});

	/**
	 * An embed has no text of its own — its URL lives in the link that produced
	 * it — so a composer holding one and nothing else used to be called empty,
	 * and the placeholder sat on top of the picture.
	 */
	it('does not call itself empty when it holds only an embed', async () => {
		const onlyEmbed = JSON.stringify({
			root: {
				type: 'root',
				children: [
					{ type: 'paragraph', children: [{ type: 'embed', url: 'https://i.imgur.com/cat.jpg' }] }
				]
			}
		});
		const { container } = render(RichTextEditorHarness, { props: { initial: onlyEmbed } });
		await tick();

		expect(container.querySelector('.surface .richtext-embed')).not.toBeNull();
		expect(container.querySelector('.placeholder')).toBeNull();
	});

	/** Inside the paragraph, after the line break, not above the whole block. */
	it('keeps the embed on the line its link is on', async () => {
		const { container } = render(RichTextEditorHarness, { props: { initial: WITH_EMBED } });
		await tick();

		const embed = container.querySelector('.surface .richtext-embed');
		expect(embed?.closest('p')).not.toBeNull();
		expect(embed?.previousElementSibling?.tagName).toBe('BR');
	});

	/**
	 * The regression this whole change exists for.
	 *
	 * Removing the embed and then moving the caret used to put it straight back,
	 * because the sweep only knew "this link has no embed above it" and the
	 * caret leaving a link is exactly what triggers a sweep.
	 */
	it('does not put a removed embed back when the caret leaves the link again', async () => {
		const { container } = render(RichTextEditorHarness, { props: { initial: WITH_EMBED } });
		await tick();
		expect(embedChips(container)).toHaveLength(1);

		await fireEvent.click(await removeButton(container));
		await tick();
		expect(embedChips(container)).toHaveLength(0);

		// Any edit runs the sweep, which is what would have re-inserted it.
		typeInto(container, ' and more');
		await tick();
		expect(embedChips(container)).toHaveLength(0);
	});

	/**
	 * Two links on one line share a line start, so the second embed has to go
	 * after the first. Inserting it in front would stack the previews in the
	 * opposite order to the links they belong to.
	 */
	it('stacks embeds for one line in the order their links appear', async () => {
		const twoLinks = JSON.stringify({
			root: {
				type: 'root',
				children: [
					{
						type: 'paragraph',
						children: [
							{
								type: 'autolink',
								url: 'https://i.imgur.com/one.jpg',
								isUnlinked: false,
								children: [{ type: 'text', text: 'https://i.imgur.com/one.jpg', format: 0 }]
							},
							{ type: 'text', text: ' ', format: 0 },
							{
								type: 'autolink',
								url: 'https://i.imgur.com/two.jpg',
								isUnlinked: false,
								children: [{ type: 'text', text: 'https://i.imgur.com/two.jpg', format: 0 }]
							}
						]
					}
				]
			}
		});
		const { container } = render(RichTextEditorHarness, { props: { initial: twoLinks } });
		await tick();
		// Any edit runs the sweep, which is what inserts both.
		typeInto(container, ' x');
		await tick();

		expect(
			[...container.querySelectorAll('.surface .richtext-embed')].map((node) =>
				node.getAttribute('aria-label')
			)
		).toEqual([
			'Embedded preview of https://i.imgur.com/one.jpg',
			'Embedded preview of https://i.imgur.com/two.jpg'
		]);
	});

	/**
	 * These check the half the script owns — the class that makes a link's
	 * button eligible to show — and click the button directly. Revealing it on
	 * hover is plain CSS, covered by the e2e suite.
	 */
	const linkWrapper = (container: HTMLElement) =>
		defined(container.querySelector('.surface .link-with-embed-offer'), 'the link wrapper');

	it('offers a way back: the link carries a button that re-embeds it', async () => {
		const { container } = render(RichTextEditorHarness, { props: { initial: WITH_EMBED } });
		await tick();

		// While the embed is there the link has nothing to offer.
		expect(linkWrapper(container)).not.toHaveClass('embed-available');

		await fireEvent.click(await removeButton(container));
		await tick();
		expect(linkWrapper(container)).toHaveClass('embed-available');

		await fireEvent.click(
			defined(
				linkWrapper(container).querySelector('wa-button.embed-again'),
				'the embed-again button'
			)
		);
		await tick();

		expect(embedChips(container)).toHaveLength(1);
		expect(linkWrapper(container)).not.toHaveClass('embed-available');
	});

	it('keeps the button out of the stored document', async () => {
		const { container, component } = render(RichTextEditorHarness, {
			props: { initial: WITH_EMBED }
		});
		await tick();
		await fireEvent.click(await removeButton(container));
		await tick();

		// The editor draws links under its own node types; what it hands back
		// must still be the stored `link` / `autolink`, or the schema rejects it.
		const types = component.current().match(/"type":"[a-z-]+"/g);
		expect(types).not.toContain('"type":"editor-link"');
		expect(types).not.toContain('"type":"editor-autolink"');
		expect(types?.some((type) => type === '"type":"link"' || type === '"type":"autolink"')).toBe(
			true
		);
	});

	it('shows no embed button over a link no provider can embed', async () => {
		const plain = JSON.stringify({
			root: {
				type: 'root',
				children: [
					{
						type: 'paragraph',
						children: [
							{
								type: 'autolink',
								url: 'https://example.com/nothing',
								isUnlinked: false,
								children: [{ type: 'text', text: 'https://example.com/nothing', format: 0 }]
							}
						]
					}
				]
			}
		});
		const { container } = render(RichTextEditorHarness, { props: { initial: plain } });
		await tick();

		expect(linkWrapper(container)).not.toHaveClass('embed-available');
	});
});
