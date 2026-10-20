import { render, screen, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { imageModelSettingsFormSchema } from '$lib/schemas/serverSettingsForms';
import ServerSettingsFieldsHarness from '$lib/testing/ServerSettingsFieldsHarness.svelte';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import ModelDetails from './ModelDetails.svelte';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const presets = [
	{
		id: 'dark-beast',
		label: 'Dark Beast',
		description: 'A preset.',
		modelId: 'persona:242173@2788849',
		baseLabel: 'Z-Image Turbo'
	}
];

async function renderFields(stored = { set: true, tail: 'abcd' }) {
	const data = await superValidate(
		{
			runwareApiKey: '',
			runwareApiKeyChange: 'keep',
			photoModel: 'dark-beast',
			photoRunwareModelAir: '',
			photoBase: '',
			illustratedModel: 'wai-illustrious',
			illustratedRunwareModelAir: '',
			illustratedBase: ''
		},
		zod4(imageModelSettingsFormSchema),
		{ errors: false }
	);
	const view = render(ServerSettingsFieldsHarness, { data, stored, presets });
	await waSettled(view.container);
	return view;
}

function formData(): Record<string, unknown> {
	return JSON.parse(screen.getByTestId('form').textContent ?? '{}');
}

/**
 * Types into a `wa-input` as a browser does: into the native control inside
 * it, with the composed `input` event real typing dispatches. Not the
 * element's own `value`, which is not authoritative (AGENTS.md).
 */
function type(element: Element, value: string) {
	const control = (element as HTMLElement & { input?: HTMLInputElement | null }).input;
	if (!control) {
		throw new Error('expected an upgraded wa-input with a native control');
	}
	control.value = value;
	control.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

afterEach(() => vi.unstubAllGlobals());

/** Everything a Runware result carries beyond its id and name. */
const PONY = {
	version: 'v3',
	architecture: 'pony',
	base: 'pony',
	description: 'Made for ponies.',
	tags: [],
	defaultSteps: 30,
	defaultCfg: 7,
	triggerWords: ''
};

async function searchBox(container: HTMLElement): Promise<Element> {
	return await waitFor(() => {
		const found = container.querySelector('wa-input[type="search"]');
		expect(found).not.toBeNull();
		return found as Element;
	});
}

describe('SecretSettingField', () => {
	it('shows only how a saved credential ends, and hides the field until Replace', async () => {
		const { container } = await renderFields();
		expect(screen.getByText(/Saved, ending/)).toBeInTheDocument();
		expect(container.textContent).toContain('…abcd');
		expect(container.querySelector('wa-input[name="runwareApiKey"]')).toBeNull();

		screen.getByText('Replace').click();
		await waitFor(() =>
			expect(container.querySelector('wa-input[name="runwareApiKey"]')).not.toBeNull()
		);
	});

	it('says Remove in the hidden change field, and Undo takes it back', async () => {
		const { container } = await renderFields();
		const change = () =>
			container.querySelector<HTMLInputElement>('input[name="runwareApiKeyChange"]')?.value;
		expect(change()).toBe('keep');
		screen.getByText('Remove').click();
		await waitFor(() => expect(change()).toBe('remove'));
		expect(screen.getByText('Removed when you save')).toBeInTheDocument();
		screen.getByText('Undo').click();
		await waitFor(() => expect(change()).toBe('keep'));
	});

	it('shows the field straight away when nothing is saved', async () => {
		const { container } = await renderFields({ set: false, tail: '' });
		expect(container.querySelector('wa-input[name="runwareApiKey"]')).not.toBeNull();
		expect(screen.queryByText('Replace')).toBeNull();
	});
});

describe('ModelDetails for OpenRouter', () => {
	it('names a typed id, saying how an @ suffix routes it, and says when OpenRouter lists none', async () => {
		const lookup = vi.fn(async (input: unknown) =>
			String(input).includes('?id=z-ai%2Fglm-5.2')
				? Response.json({
						results: [
							{
								openrouterModelId: 'z-ai/glm-5.2',
								name: 'Z.ai: GLM 5.2',
								description: 'A big model.',
								contextLength: 200_000,
								promptPerMillion: 0.6,
								completionPerMillion: 2.2
							}
						]
					})
				: Response.json({ results: [] })
		);
		vi.stubGlobal('fetch', lookup);
		const view = render(ModelDetails, {
			provider: 'openrouter',
			modelId: 'z-ai/glm-5.2@preset/nsfw-compatible'
		});
		expect(await screen.findByText('Z.ai: GLM 5.2')).toBeInTheDocument();
		expect(screen.getByText(/Sent with/)).toHaveTextContent('@preset/nsfw-compatible');
		expect(screen.getByText(/200,000 tokens of context/)).toBeInTheDocument();

		await view.rerender({ provider: 'openrouter', modelId: 'nobody/none' });
		expect(await screen.findByText(/OpenRouter doesn't list/)).toBeInTheDocument();
	});
});

describe('ModelChoice', () => {
	it('searches only once Custom is chosen, and a result fills in the AIR and its base model', async () => {
		const search = vi.fn(async () =>
			Response.json({
				results: [
					{
						runwareModelAir: 'civitai:1@2',
						name: 'A Pony',
						version: 'v3',
						architecture: 'pony',
						base: 'pony',
						description: 'Made for ponies.',
						tags: ['pony'],
						defaultSteps: 30,
						defaultCfg: 7,
						triggerWords: 'score_9'
					}
				]
			})
		);
		vi.stubGlobal('fetch', search);
		const { container } = await renderFields();
		expect(container.querySelector('wa-input[type="search"]')).toBeNull();

		screen.getByRole('radio', { name: /Custom/ }).click();
		await waitFor(() => expect(formData().photoModel).toBe('custom'));
		const box = await waitFor(() => {
			const found = container.querySelector('wa-input[type="search"]');
			expect(found).not.toBeNull();
			return found as Element;
		});
		type(box, 'pony');

		const result = await screen.findByRole('button', { name: /A Pony/ });
		// Icons are fetched through the same stub, some as `data:` URLs.
		const asked = search.mock.calls
			.map((call) => String((call as unknown[])[0]))
			.filter((input) => input.startsWith('/api/'));
		expect(asked).toEqual(['/api/admin/models/runware?q=pony']);
		result.click();

		await waitFor(() =>
			expect(formData()).toMatchObject({ photoRunwareModelAir: 'civitai:1@2', photoBase: 'pony' })
		);
		await waSettled(container);
		expect(waProp(container.querySelector('wa-select[name="photoBase"]'), 'value')).toBe('pony');

		// What Runware says about it, from the result, without asking again.
		expect(await screen.findByText(/Runware lists it as/)).toHaveTextContent(
			'Runware lists it as pony, which is Pony (SDXL).'
		);
		expect(screen.getByText('Made for ponies.')).toBeInTheDocument();
		expect(screen.getByText(/recommends 30 steps at CFG 7/)).toBeInTheDocument();
		expect(search.mock.calls.map((call) => String((call as unknown[])[0]))).not.toContainEqual(
			expect.stringContaining('?air=')
		);
	});

	it('hides the results again when the search is emptied', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({ results: [{ ...PONY, runwareModelAir: 'civitai:1@2', name: 'A Pony' }] })
			)
		);
		const { container } = await renderFields();
		screen.getByRole('radio', { name: /Custom/ }).click();
		const box = await searchBox(container);
		type(box, 'pony');
		await screen.findByRole('button', { name: /A Pony/ });
		type(box, '');
		await waitFor(() => expect(screen.queryByRole('button', { name: /A Pony/ })).toBeNull());
	});

	it('follows real typing, so the details never describe the AIR the field held before', async () => {
		const lookup = vi.fn(async (input: unknown) =>
			String(input).includes('?air=persona%3A242173%402788849L')
				? Response.json({
						results: [{ ...PONY, runwareModelAir: 'persona:242173@2788849L', name: 'Lettered One' }]
					})
				: Response.json({ results: [] })
		);
		vi.stubGlobal('fetch', lookup);
		const { container } = await renderFields();
		screen.getByRole('radio', { name: /Custom/ }).click();
		const air = await waitFor(() => {
			const found = container.querySelector('wa-input[name="photoRunwareModelAir"]');
			expect(found).not.toBeNull();
			return found as HTMLElement & { input?: HTMLInputElement };
		});
		await waSettled(container);
		// Trusted keystrokes, through Playwright, into the native control: what a
		// person does, and what a synthetic event on the host did not catch.
		await userEvent.type(air.input as HTMLInputElement, 'persona:242173@2788849L');
		await waitFor(() => expect(formData().photoRunwareModelAir).toBe('persona:242173@2788849L'));
		// A version with a letter in it is still an AIR, so it is looked up.
		expect(await screen.findByText('Lettered One')).toBeInTheDocument();
	});

	it('looks up an AIR typed in by hand, and fills an unchosen base model from it', async () => {
		const lookup = vi.fn(async (input: unknown) =>
			String(input).includes('?air=civitai%3A5%406')
				? Response.json({
						results: [{ ...PONY, runwareModelAir: 'civitai:5@6', name: 'Typed One' }]
					})
				: Response.json({ results: [] })
		);
		vi.stubGlobal('fetch', lookup);
		const { container } = await renderFields();
		screen.getByRole('radio', { name: /Custom/ }).click();
		const air = await waitFor(() => {
			const found = container.querySelector('wa-input[name="photoRunwareModelAir"]');
			expect(found).not.toBeNull();
			return found as Element;
		});
		type(air, 'civitai:5@6');
		expect(await screen.findByText('Typed One')).toBeInTheDocument();
		await waitFor(() => expect(formData().photoBase).toBe('pony'));

		type(air, 'civitai:7@8');
		expect(await screen.findByText(/Runware doesn't host/)).toBeInTheDocument();
	});

	it('says inline when the search needs a saved key', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({ message: 'Save a Runware API key first.' }, { status: 409 })
			)
		);
		const { container } = await renderFields();
		screen.getByRole('radio', { name: /Custom/ }).click();
		const box = await waitFor(() => {
			const found = container.querySelector('wa-input[type="search"]');
			expect(found).not.toBeNull();
			return found as Element;
		});
		type(box, 'anything');
		expect(await screen.findByText('Save a Runware API key first.')).toBeInTheDocument();
	});
});
