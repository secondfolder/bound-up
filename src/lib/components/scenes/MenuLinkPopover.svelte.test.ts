import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { insertMenu } from '$lib/lexical/plugins/scene-blocks';
import { createRichTextEditor, SCENE_FEATURES } from '$lib/richtext-editor';
import { defined } from '$lib/testing/defined';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import MenuLinkPopover from './MenuLinkPopover.svelte';

/**
 * A menu's link, asked for from its link button: copied, and shown with a
 * way to open it. See docs/scenes.md, "A menu's own page".
 */

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	vi.restoreAllMocks();
});

async function setUp() {
	const root = document.createElement('div');
	root.contentEditable = 'true';
	document.body.append(root);
	const { editor, destroy } = createRichTextEditor({
		features: SCENE_FEATURES,
		namespace: 'menu-link-test'
	});
	editor.setRootElement(root);
	insertMenu(editor);
	await new Promise((resolve) => editor.update(() => undefined, { onUpdate: () => resolve(null) }));
	const menu = defined(root.querySelector<HTMLElement>('.scene-menu'), 'the menu');
	const button = defined(menu.querySelector<HTMLElement>('.menu-link'), 'its link button');
	cleanups.push(() => {
		editor.setRootElement(null);
		destroy();
		root.remove();
	});
	const { container } = render(MenuLinkPopover, {
		editor,
		menuHref: (menuId: string) => `/home/notebook/scene/menus/${menuId}`
	});
	const link = `${location.origin}/home/notebook/scene/menus/${menu.dataset.menuId}`;
	return { container, ask: () => button.click(), link, menu };
}

describe('MenuLinkPopover', () => {
	it('copies the menu’s link and shows it, with a way to open it in a new tab', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		const { container, ask, link } = await setUp();
		ask();
		expect(writeText).toHaveBeenCalledWith(link);
		expect(await screen.findByText('Link copied to your clipboard.')).toBeInTheDocument();
		await waSettled(container);

		const popover = defined(container.querySelector('wa-popover'), 'the popover');
		expect(waProp(popover, 'open')).toBe(true);
		const field = defined(popover.querySelector('wa-input'), 'the link');
		expect(waProp(field, 'value')).toBe(link);
		expect(waProp(field, 'readonly')).toBe(true);
		const open = defined(popover.querySelector('wa-button'), 'the open button');
		expect(waProp(open, 'href')).toBe(link);
		expect(waProp(open, 'target')).toBe('_blank');
	});

	it('says when the link could not be copied, and still shows it to copy by hand', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('refused'));
		const { container, ask, link } = await setUp();
		ask();
		expect(
			await screen.findByText("Couldn't copy the link. Select it below to copy it yourself.")
		).toBeInTheDocument();
		expect(waProp(container.querySelector('wa-input'), 'value')).toBe(link);
	});

	it('keeps the menu’s corner showing while open, and closes on a second tap', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		const { container, ask, menu } = await setUp();
		ask();
		await waSettled(container);
		const popover = container.querySelector('wa-popover');
		expect(waProp(popover, 'open')).toBe(true);
		expect(menu.classList.contains('link-open')).toBe(true);
		ask();
		await expect.poll(() => waProp(popover, 'open')).toBe(false);
		await expect.poll(() => menu.classList.contains('link-open')).toBe(false);
	});
});
