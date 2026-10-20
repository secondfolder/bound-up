import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { DAYDREAM_VOICE_PRESETS, type DaydreamVoice } from '$lib/daydream';
import { plainPassage } from '$lib/daydream/passage-format';
import { waSettled } from '$lib/testing/web-awesome';
import DaydreamVoicePicker from './DaydreamVoicePicker.svelte';

const voice = (narrator: DaydreamVoice['narrator'], stance: DaydreamVoice['stance']) => ({
	narrator,
	stance,
	protagonistName: ''
});

async function renderPicker(value: DaydreamVoice, onchange = vi.fn()) {
	const rendered = render(DaydreamVoicePicker, { value, characterCount: 1, onchange });
	await waSettled(rendered.container);
	return { ...rendered, onchange };
}

const about = (container: HTMLElement) => container.querySelector('.about')?.textContent ?? '';

describe('DaydreamVoicePicker', () => {
	it('lists the options by name only, and describes the chosen one beside them', async () => {
		const { container } = await renderPicker(voice('none', 'self'));
		const options = [...container.querySelectorAll('.options .option')].map((option) =>
			option.textContent?.trim()
		);
		expect(options).toEqual(DAYDREAM_VOICE_PRESETS.map((preset) => preset.label));
		const [talk, told] = DAYDREAM_VOICE_PRESETS;
		expect(about(container)).toContain(talk?.description);
		for (const example of talk?.examples ?? []) {
			expect(about(container)).toContain(plainPassage(example));
		}
		// Drawn as a passage draws it: the action in italics, no asterisks.
		expect(container.querySelector('.examples em')?.textContent).toBe(
			'sets the key on the table between you'
		);
		expect(about(container)).not.toContain('*');
		expect(about(container)).not.toContain(told?.description);
	});

	it('chooses an option, and then describes that one instead', async () => {
		const { container, onchange, rerender } = await renderPicker(voice('none', 'self'));
		container.querySelector<HTMLInputElement>('.options input[value="rules"]')?.click();
		expect(onchange).toHaveBeenCalledWith(voice('impersonal', 'self'));
		await rerender({ value: voice('impersonal', 'self') });
		const rules = DAYDREAM_VOICE_PRESETS.find((preset) => preset.id === 'rules');
		await waitFor(() => expect(about(container)).toContain(rules?.description));
		expect(about(container)).toContain('Infraction logged.');
	});

	it('offers a monologue, described like the rest', async () => {
		const { container, onchange, rerender } = await renderPicker(voice('none', 'self'));
		container.querySelector<HTMLInputElement>('.options input[value="monologue"]')?.click();
		expect(onchange).toHaveBeenCalledWith(voice('monologue', 'self'));
		await rerender({ value: voice('monologue', 'self') });
		await waitFor(() => expect(about(container)).toContain('One voice speaking its mind'));
		expect(container.querySelector('.examples strong')?.textContent).toBe(
			'Being owned is a relief.'
		);
	});

	it('describes a combination no preset gives from its two settings', async () => {
		const { container } = await renderPicker(voice('third-person', 'self'));
		expect(container.querySelector<HTMLInputElement>('.options input:checked')).toBeNull();
		expect(about(container)).toContain('A narrator tells the story about the people in it.');
		expect(about(container)).toContain('You are in the daydream, as yourself.');
	});

	it('names the fine-tune options only, but says why one is blocked', async () => {
		const { container } = await renderPicker(voice('third-person', 'absent'));
		const blocked = container.querySelector('input[value="second-person"]')?.closest('label');
		expect(blocked?.textContent).toContain('Not while you are watching');
		const open = container.querySelector('input[value="third-person"]')?.closest('label');
		expect(open?.textContent?.trim()).toBe('A narrator, about them');
	});
});
