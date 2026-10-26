import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { type Mentioned, NOTHING_MENTIONED, type PromptOutcome } from '$lib/scenes/considerations';
import { DEFAULT_SCENE_PREFERENCES, type ScenePreferences } from '$lib/scenes/preferences';
import { waSettled } from '$lib/testing/web-awesome';
import PromptColumn from './PromptColumn.svelte';

function mentioning(kinkIds: string[]): Mentioned {
	return { kinkIds: new Set(kinkIds), tags: new Set(), maxIntensity: -1 };
}

async function renderColumn(
	overrides: Partial<{
		preferences: ScenePreferences;
		mentioned: Mentioned;
		outcomes: ReadonlyMap<string, PromptOutcome>;
		readOnly: boolean;
	}> = {}
) {
	const onPreferences = vi.fn();
	const onAdd = vi.fn();
	const onOutcome = vi.fn();
	const rendered = render(PromptColumn, {
		preferences: DEFAULT_SCENE_PREFERENCES,
		mentioned: NOTHING_MENTIONED,
		outcomes: new Map(),
		readOnly: false,
		onPreferences,
		onAdd,
		onOutcome,
		...overrides
	});
	await waSettled(rendered.container);
	const prompt = (id: string) =>
		rendered.container.querySelector<HTMLElement>(`[data-prompt="${id}"]`);
	return { ...rendered, onPreferences, onAdd, onOutcome, prompt };
}

function buttonNamed(root: ParentNode, text: string): HTMLElement {
	const found = [...root.querySelectorAll<HTMLElement>('wa-button, button')].find(
		(element) => element.textContent?.replace(/\s+/g, ' ').trim() === text
	);
	if (!found) {
		const names = [...root.querySelectorAll('wa-button, button')].map((element) =>
			JSON.stringify(element.textContent)
		);
		throw new Error(`no button "${text}" among ${names.join(', ')}`);
	}
	return found;
}

describe('PromptColumn', () => {
	it('shows the essentials to start with, and waits for the page to mention what a prompt is about', async () => {
		const { prompt, rerender, container } = await renderColumn();
		expect(prompt('how-will-you-stop')).not.toBeNull();
		expect(prompt('without-words')).toBeNull();

		await rerender({ mentioned: mentioning(['gags', 'bondage']) });
		await waSettled(container);
		expect(prompt('without-words')).not.toBeNull();
	});

	it('steps one type up or down without touching the others', async () => {
		const { container, onPreferences } = await renderColumn();
		const [thinking] = container.querySelectorAll('.prompt-section');
		buttonNamed(thinking as HTMLElement, 'More things to think about').click();
		expect(onPreferences).toHaveBeenCalledWith({ levels: { think: 3 }, neverShow: [] });
	});

	it('hides a type at the lowest step, keeping its heading so it can come back', async () => {
		const { container, prompt } = await renderColumn({
			preferences: { levels: { think: 0 }, neverShow: [] }
		});
		expect(prompt('what-are-you-craving')).toBeNull();
		expect(container.textContent).toContain('Things to think about');
		expect(container.textContent).toContain('Hidden. More brings them back.');
	});

	it('puts an answer on the page and marks the prompt added', async () => {
		const { prompt, onAdd, onOutcome } = await renderColumn();
		const stop = prompt('how-will-you-stop');
		if (!stop) {
			throw new Error('no stop prompt');
		}
		buttonNamed(stop, 'Red / yellow / green').click();
		expect(onAdd).toHaveBeenCalledWith('signals', 'To stop: Red / yellow / green');
		expect(onOutcome).toHaveBeenCalledWith('how-will-you-stop', 'added');
	});

	it('leaves out what this scene dealt with and what this person never wants, and offers them back', async () => {
		const { prompt, container, onOutcome } = await renderColumn({
			outcomes: new Map<string, PromptOutcome>([['how-will-you-stop', 'handled']]),
			preferences: { levels: {}, neverShow: ['limits-tonight'] }
		});
		expect(prompt('how-will-you-stop')).toBeNull();
		expect(prompt('limits-tonight')).toBeNull();
		buttonNamed(container, 'Bring back the prompt set aside here').click();
		expect(onOutcome).toHaveBeenCalledWith('how-will-you-stop', null);
	});

	it('adds nothing for someone who can only read', async () => {
		const { prompt } = await renderColumn({ readOnly: true });
		const chip = prompt('how-will-you-stop')?.querySelector('button.choice-chip');
		expect(chip?.hasAttribute('disabled')).toBe(true);
	});
});
