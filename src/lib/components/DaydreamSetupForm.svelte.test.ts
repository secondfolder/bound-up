import { render } from '@testing-library/svelte';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { daydreamSetupFormSchema, EMPTY_DAYDREAM_SETUP } from '$lib/schemas/daydreamForm';
import { waSettled } from '$lib/testing/web-awesome';
import DaydreamSetupForm from './DaydreamSetupForm.svelte';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

async function renderForm() {
	const setupForm = await superValidate(EMPTY_DAYDREAM_SETUP, zod4(daydreamSetupFormSchema), {
		errors: false
	});
	const rendered = render(DaydreamSetupForm, { setupForm, submitLabel: 'Start daydreaming' });
	await waSettled(rendered.container);
	return rendered;
}

/** The text box inside a `wa-input`, which is what a person types into. */
function inputOf(container: HTMLElement, name: string): HTMLInputElement {
	const input = container
		.querySelector(`wa-input[name="${name}"]`)
		?.shadowRoot?.querySelector('input');
	if (!input) {
		throw new Error(`no ${name} field`);
	}
	return input;
}

/**
 * Fills in what the form requires, other than `except`. The bug this guards
 * against only shows once the form is valid as a whole: that is when
 * superforms writes the schema's parsed value back after each change.
 */
async function fillRequired(container: HTMLElement, except: string) {
	const required: [string, () => Element][] = [
		['title', () => inputOf(container, 'title')],
		['characterName', () => inputOf(container, 'characterName')],
		['scenario', () => container.querySelector('textarea[name="scenario"]') as Element]
	];
	for (const [name, field] of required) {
		if (name !== except) {
			await userEvent.type(field(), 'Filled');
		}
	}
}

/** Types one key at a time, giving the form's validation time to run between them. */
async function typeSlowly(field: Element, text: string) {
	for (const key of text) {
		await userEvent.type(field, key === ' ' ? '{Space}' : key);
		await new Promise((resolve) => setTimeout(resolve, 30));
	}
}

describe('DaydreamSetupForm', () => {
	/**
	 * A regression test. The form's schema once trimmed each field, and once
	 * the form is valid superforms writes the schema's parsed value back after
	 * each change, so every space was deleted a moment after it was typed:
	 * "The office" came out "Theoffice". It only shows with the rest of the
	 * form filled in and typing paced like a person's, hence both.
	 */
	it.each(['scenario', 'persona', 'limits'])('keeps the spaces typed into the %s', async (name) => {
		const { container } = await renderForm();
		const field = container.querySelector<HTMLTextAreaElement>(`textarea[name="${name}"]`);
		if (!field) {
			throw new Error(`no ${name} field`);
		}
		await fillRequired(container, name);
		await typeSlowly(field, 'The office has emptied');
		expect(field.value).toBe('The office has emptied');
	});

	it.each(['title', 'characterName', 'tone', 'safeword'])(
		'keeps the spaces typed into the %s',
		async (name) => {
			const { container } = await renderForm();
			const field = inputOf(container, name);
			await fillRequired(container, name);
			await typeSlowly(field, 'Late at night');
			expect(field.value).toBe('Late at night');
		}
	);
});
