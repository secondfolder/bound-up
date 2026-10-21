import { render, waitFor } from '@testing-library/svelte';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { type MarkedSummary, parseMarkedSummary } from '$lib/daydream/summary';
import { daydreamSetupFormSchema, EMPTY_DAYDREAM_SETUP } from '$lib/schemas/daydreamForm';
import type { DaydreamSetupContent } from '$lib/sealed-kinds/daydreams';
import { testCharacter, testDaydreamSetup } from '$lib/testing/daydream-setup';
import { defined } from '$lib/testing/defined';
import { TYPE_SLOWLY_TIMEOUT, typeSlowly } from '$lib/testing/type-slowly';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import type { DaydreamLibraryView, SealedRefView } from '$lib/types';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

/** What each library record opens to, by record id. */
const opened = vi.hoisted(() => new Map<string, unknown>());
vi.mock('$lib/sealed-views.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sealed-views.svelte')>()),
	openedDaydreamCharacter: (sealed: SealedRefView) => opened.get(sealed.recordId),
	openedDaydreamIdea: (sealed: SealedRefView) => opened.get(sealed.recordId)
}));

const client = vi.hoisted(() => ({
	saveLibraryItem: vi.fn(),
	requestSuggestion: vi.fn(),
	sealSetupExchanges: vi.fn()
}));
vi.mock('$lib/daydream/client', () => client);

const { default: DaydreamSetupForm } = await import('./DaydreamSetupForm.svelte');

const EMPTY_LIBRARY: DaydreamLibraryView = { characters: [], ideas: [] };
const ref = (recordId: string): SealedRefView => ({
	recordId,
	vaultId: 'v',
	ciphertext: 'sb1.x',
	payloadVersion: 1
});

async function renderForm(
	options: {
		setup?: DaydreamSetupContent;
		draft?: DaydreamSetupContent;
		summary?: MarkedSummary | null;
		layout?: 'summary' | 'full';
		onretry?: (limits: string) => void;
		library?: DaydreamLibraryView;
		suggestionsOn?: boolean;
		debug?: boolean;
	} = {}
) {
	const setupForm = await superValidate(EMPTY_DAYDREAM_SETUP, zod4(daydreamSetupFormSchema), {
		errors: false
	});
	const rendered = render(DaydreamSetupForm, {
		setupForm,
		daydream: options.setup ? { id: 'd1', revision: 0, setup: options.setup } : null,
		draft: options.draft ?? null,
		summary: options.summary ?? null,
		layout: options.layout ?? 'full',
		onretry: options.onretry,
		library: options.library ?? EMPTY_LIBRARY,
		suggestionsOn: options.suggestionsOn ?? false,
		submitLabel: 'Save setup',
		debug: options.debug ?? false
	});
	await waSettled(rendered.container);
	return rendered;
}

function button(container: HTMLElement, text: string): HTMLElement | undefined {
	return [...container.querySelectorAll<HTMLElement>('wa-button, button')].find((candidate) =>
		candidate.textContent?.includes(text)
	);
}

/** A `wa-details` by its summary. */
function details(container: HTMLElement, summary: string) {
	// The property, which is what Svelte set on the upgraded element (AGENTS.md).
	const found = [
		...container.querySelectorAll<HTMLElement & { open: boolean; summary: string }>('wa-details')
	].find((candidate) => candidate.summary === summary);
	if (!found) {
		throw new Error(`no "${summary}" details`);
	}
	return found;
}

async function openDetails(container: HTMLElement, summary: string) {
	details(container, summary).open = true;
	await waSettled(container);
}

/** The "How it's told" fieldset, last in the full layout. */
const told = (container: HTMLElement) => {
	const found = container.querySelector<HTMLElement>('fieldset.told');
	if (!found) {
		throw new Error('no "How it\'s told"');
	}
	return found;
};

/** An icon-only button, named by its icon's label (AGENTS.md). */
const removeButton = (container: HTMLElement, name: string) =>
	// The property, which is what Svelte set on the upgraded element (AGENTS.md).
	[...container.querySelectorAll<HTMLElement & { label: string }>('wa-icon')]
		.find((icon) => icon.label === `Remove ${name}`)
		?.closest<HTMLElement>('wa-button');

/** Opens the voice picker from its one-line summary. */
async function changeVoice(container: HTMLElement) {
	button(told(container), 'Change')?.click();
	await waitFor(() => expect(told(container).querySelector('.options')).not.toBeNull());
	await waSettled(container);
}

/** The rows under "Who's in it" for the idea's parts. */
const partRows = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.part')];

const PARTS = [
	{ id: 'p1', name: 'the interviewer', description: 'asks the questions' },
	{ id: 'p2', name: 'the observer', description: '' }
];

beforeEach(() => {
	opened.clear();
	client.requestSuggestion.mockReset();
});

describe('DaydreamSetupForm', () => {
	/**
	 * A regression test. The form's schema once trimmed each field, and once
	 * the form is valid superforms writes the schema's parsed value back after
	 * each change, so every space was deleted a moment after it was typed:
	 * "The office" came out "Theoffice". It only shows with the rest of the
	 * form valid and typing paced like a person's, hence a full setup and both.
	 */
	it(
		'keeps the spaces typed into the title and the limits',
		async () => {
			const { container } = await renderForm({ setup: testDaydreamSetup() });
			await openDetails(container, 'More options');
			const title = container.querySelector('wa-input')?.shadowRoot?.querySelector('input');
			const limits = container.querySelector('textarea');
			if (!(title && limits)) {
				throw new Error('no title or limits field');
			}
			await userEvent.clear(title);
			await typeSlowly(title, 'Late at night');
			expect(title.value).toBe('Late at night');
			await typeSlowly(limits, 'Nothing in public');
			expect(limits.value).toBe('Nothing in public');
		},
		TYPE_SLOWLY_TIMEOUT
	);

	it('offers the name as optional, with its hint as the field’s own', async () => {
		const { container } = await renderForm({ setup: testDaydreamSetup() });
		const name = defined(container.querySelector<HTMLElement>('wa-input'), 'the name field');
		// A string field reads as required to superforms; this one is not, and
		// its asterisk sat over a hint saying to leave it empty.
		expect(waProp(name, 'required')).toBe(false);
		expect(waProp(name, 'hint')).toBe('Leave it empty to have it named for you.');
	});

	it('fills both settings from a preset, and disables what could never work with it', async () => {
		const { container } = await renderForm();
		await changeVoice(container);
		container.querySelector<HTMLInputElement>('.options input[value="watch"]')?.click();
		await waitFor(() =>
			expect(
				container.querySelector<HTMLInputElement>('input[value="third-person"]')?.checked
			).toBe(true)
		);
		expect(container.querySelector<HTMLInputElement>('input[value="absent"]')?.checked).toBe(true);
		// Watching rules out a story told to "you", and characters speaking to you.
		expect(
			container.querySelector<HTMLInputElement>('input[value="second-person"]')?.disabled
		).toBe(true);
		expect(container.querySelector<HTMLInputElement>('input[value="none"]')?.disabled).toBe(true);
		// Nobody to watch yet.
		expect(container.textContent).toContain('To watch, add at least one character');
		// And who leads means nothing when you are only watching.
		expect(container.textContent).not.toContain('Who leads');
	});

	it('needs no characters for a story told to you', async () => {
		const { container } = await renderForm({ draft: testDaydreamSetup() });
		await changeVoice(container);
		container.querySelector<HTMLInputElement>('.options input[value="told"]')?.click();
		await waitFor(() =>
			expect(container.textContent).toContain('Optional: people the narrator brings in')
		);
		expect(container.textContent).not.toContain('add a character, or choose a narrator');
	});

	describe('how it’s told, last', () => {
		it('comes last, just above the button, as one line', async () => {
			const { container } = await renderForm();
			const legends = [...container.querySelectorAll('form > fieldset > legend')].map((legend) =>
				legend.textContent?.trim()
			);
			expect(legends.at(-1)).toBe("How it's told");
			expect(told(container).nextElementSibling?.textContent?.trim()).toBe('Save setup');
			expect(told(container).querySelector('.options')).toBeNull();
			expect(button(told(container), 'Change')).toBeDefined();
		});

		it('follows who is in it until it is chosen: told to you with nobody, talking with anyone', async () => {
			const empty = await renderForm();
			expect(told(empty.container).textContent).toContain('A story told to you');
			expect(told(empty.container).textContent).toContain('Picked from who’s in it.');
			// Nobody in it is a story told to you, which works, so nothing is wrong.
			expect(empty.container.textContent).not.toContain('add a character');
			empty.unmount();

			const { container } = await renderForm({ draft: testDaydreamSetup() });
			expect(told(container).textContent).toContain('Talk with a character');
			removeButton(container, 'Mara')?.click();
			await waitFor(() => expect(told(container).textContent).toContain('A story told to you'));
		});

		it('stops following once one is chosen', async () => {
			const { container } = await renderForm({ draft: testDaydreamSetup() });
			await changeVoice(container);
			container.querySelector<HTMLInputElement>('.options input[value="rules"]')?.click();
			removeButton(container, 'Mara')?.click();
			await waitFor(() => expect(container.textContent).not.toContain('Mara'));
			expect(
				container.querySelector<HTMLInputElement>('.options input[value="rules"]')?.checked
			).toBe(true);
		});

		it('treats an edited daydream’s voice as chosen', async () => {
			const { container } = await renderForm({
				setup: testDaydreamSetup({
					voice: { narrator: 'third-person', stance: 'absent', protagonistName: '' },
					characters: []
				})
			});
			expect(told(container).textContent).toContain('Watch a story unfold');
			expect(told(container).textContent).not.toContain('Picked from');
		});
	});

	describe('as a summary', () => {
		const draft = () =>
			testDaydreamSetup({
				title: '',
				idea: { ...testDaydreamSetup().idea, dials: { heat: 3, kink: null } }
			});
		/** The summary's paragraphs as they read, without the menus' items. */
		const summary = (container: HTMLElement) =>
			[...container.querySelectorAll('.setup-summary p')].map((paragraph) => {
				const copy = paragraph.cloneNode(true) as HTMLElement;
				for (const item of copy.querySelectorAll('wa-dropdown-item')) {
					item.remove();
				}
				return copy.textContent?.replace(/\s+/g, ' ').trim();
			});
		const marked = (raw: string) => parseMarkedSummary(raw, ['Mara']);

		it('says the premise, then the setup, each part of it a blank to change', async () => {
			const { container } = await renderForm({ draft: draft(), layout: 'summary' });
			expect(summary(container)).toEqual([
				'The office has emptied out.',
				'It’s a steamy daydream: Late meeting, with Mara. It’s told in the characters’ own words, with no narrator.'
			]);
			expect(container.querySelectorAll('.setup-summary .blank')).toHaveLength(4);
			expect(container.querySelector('fieldset.told')).toBeNull();
		});

		it('shows the model’s summary with its blanks, and says what it left out after it', async () => {
			const { container } = await renderForm({
				draft: draft(),
				summary: marked('[[Mara|Your boss]] keeps you behind in [[idea|the empty office]].'),
				layout: 'summary'
			});
			expect(summary(container)).toEqual([
				'Your boss keeps you behind in the empty office.',
				'It’s a steamy daydream. It’s told in the characters’ own words, with no narrator.'
			]);
			expect(
				[...container.querySelectorAll('.setup-summary .blank .words')].map(
					(words) => words.textContent
				)
			).toEqual([
				'Your boss',
				'the empty office',
				'steamy',
				'in the characters’ own words, with no narrator'
			]);
		});

		it('shows the markers it was written with in debug mode, and none on what it adds', async () => {
			const written = marked('[[Mara|Your boss]] keeps [[Bel|Bel]] and you behind.');
			const plain = await renderForm({ draft: draft(), summary: written, layout: 'summary' });
			expect(summary(plain.container)[0]).toBe('Your boss keeps Bel and you behind.');
			plain.unmount();

			const { container } = await renderForm({
				draft: draft(),
				summary: written,
				layout: 'summary',
				debug: true
			});
			// The blank still works inside its marker; the marker for nobody in
			// the story is shown as it was written.
			expect(summary(container)).toEqual([
				'[[Mara|Your boss]] keeps [[Bel|Bel]] and you behind.',
				'It’s a steamy daydream: Late meeting. It’s told in the characters’ own words, with no narrator.'
			]);
			expect(container.querySelectorAll('.setup-summary .blank')).toHaveLength(4);
		});

		it('gives way to the premise once how it is told changes', async () => {
			const { container } = await renderForm({
				draft: draft(),
				summary: marked('[[Mara|Your boss]] keeps you behind.'),
				layout: 'summary'
			});
			const [, voice] = [...container.querySelectorAll<HTMLElement>('.setup-summary wa-dropdown')];
			const item = [
				...(voice?.querySelectorAll<HTMLElement & { value: string }>('wa-dropdown-item') ?? [])
			].find((candidate) => candidate.value === 'told');
			voice?.dispatchEvent(new CustomEvent('wa-select', { detail: { item } }));
			await waitFor(() =>
				expect(summary(container)).toEqual([
					'The office has emptied out.',
					'It’s a steamy daydream: Late meeting, with Mara. It’s told to you by a narrator.'
				])
			);
		});

		it('changes the heat and how it is told from the blanks', async () => {
			const { container } = await renderForm({ draft: draft(), layout: 'summary' });
			const [heat, voice] = [
				...container.querySelectorAll<HTMLElement>('.setup-summary wa-dropdown')
			];
			const pick = (dropdown: HTMLElement | undefined, value: string) => {
				const item = [
					...(dropdown?.querySelectorAll<HTMLElement & { value: string }>('wa-dropdown-item') ?? [])
				].find((candidate) => candidate.value === value);
				dropdown?.dispatchEvent(new CustomEvent('wa-select', { detail: { item } }));
			};
			pick(heat, '4');
			await waitFor(() => expect(summary(container)[1]).toMatch(/^It’s an explicit daydream/));
			pick(voice, 'told');
			await waitFor(() =>
				expect(summary(container)[1]).toBe(
					'It’s an explicit daydream: Late meeting, with Mara. It’s told to you by a narrator.'
				)
			);
		});

		it('switches to every control with nothing lost', async () => {
			const { container } = await renderForm({ draft: draft(), layout: 'summary' });
			button(container, 'Customise everything')?.click();
			await waitFor(() => expect(container.querySelector('fieldset.told')).not.toBeNull());
			expect(container.querySelector('.setup-summary')).toBeNull();
			expect(container.textContent).toContain('Late meeting');
			expect(partRows(container)).toHaveLength(0);
			expect(button(container, 'Edit Mara')).toBeDefined();
		});

		it('asks for another with the limits written so far, and only when it can', async () => {
			const without = await renderForm({ draft: draft(), layout: 'summary' });
			expect(button(without.container, 'Try another')).toBeUndefined();
			without.unmount();

			const onretry = vi.fn();
			const { container } = await renderForm({ draft: draft(), layout: 'summary', onretry });
			await openDetails(container, 'Anything off the table?');
			const limits = container.querySelector('textarea');
			if (!limits) {
				throw new Error('no limits field');
			}
			await userEvent.type(limits, 'Nothing public.');
			button(container, 'Try another')?.click();
			expect(onretry).toHaveBeenCalledWith('Nothing public.');
		});
	});

	it('offers the library’s newer version of a character, and takes it on request', async () => {
		opened.set('c1', { ...testCharacter({ name: 'Mara', archetype: 'stricter now' }) });
		const setup = testDaydreamSetup({
			characters: [
				testCharacter({ name: 'Mara', archetype: 'strict', sourceId: 'c1', sourceRevision: 1 })
			]
		});
		const { container } = await renderForm({
			setup,
			library: {
				characters: [{ id: 'c1', revision: 2, updatedAt: new Date(), sealed: ref('c1') }],
				ideas: []
			}
		});
		expect(container.textContent).toContain('Updated in your library since.');
		button(container, 'Use the latest')?.click();
		await waitFor(() => expect(container.textContent).toContain('stricter now'));
		expect(container.textContent).not.toContain('Updated in your library since.');
	});

	it('offers to save a character kept only in this daydream', async () => {
		const { container } = await renderForm({ setup: testDaydreamSetup() });
		expect(container.textContent).toContain('Only in this daydream.');
		expect(button(container, 'Save to my characters')).toBeDefined();
	});

	it('offers Surprise me only when suggestions are on', async () => {
		const off = await renderForm();
		expect(button(off.container, 'Surprise me')).toBeUndefined();
		off.unmount();
		const on = await renderForm({ suggestionsOn: true });
		expect(button(on.container, 'Surprise me')).toBeDefined();
	});

	describe('kept short', () => {
		it('asks for no name for a new daydream, and offers one to change later', async () => {
			const created = await renderForm();
			expect(created.container.querySelector('wa-input[name="title"]')).toBeNull();
			created.unmount();
			const edited = await renderForm({ setup: testDaydreamSetup() });
			expect(edited.container.querySelector('wa-input[name="title"]')).not.toBeNull();
		});

		it('keeps the voice to one line and the rest under a closed disclosure for a new daydream', async () => {
			const { container } = await renderForm();
			expect(told(container).querySelector('wa-details')).toBeNull();
			expect(details(container, 'More options').open).toBe(false);
			// Who leads, the limits and the dials are all in there.
			const more = details(container, 'More options');
			expect(more.querySelector('textarea')).not.toBeNull();
			expect(more.textContent).toContain('Dials');
		});

		it('opens what an edited daydream has changed, and only that', async () => {
			const limited = await renderForm({ setup: testDaydreamSetup({ limits: 'Nothing public.' }) });
			expect(details(limited.container, 'More options').open).toBe(true);
			// A preset's voice says all there is to say in one line.
			expect(told(limited.container).querySelector('.options')).toBeNull();
			limited.unmount();

			const persona = await renderForm({
				setup: testDaydreamSetup({
					voice: { narrator: 'none', stance: 'persona', protagonistName: 'Sam' }
				})
			});
			expect(details(persona.container, "Fine-tune how it's told").open).toBe(true);
			expect(details(persona.container, 'More options').open).toBe(false);
		});

		it('shows a problem with the voice while its settings are closed', async () => {
			const { container } = await renderForm();
			await changeVoice(container);
			container.querySelector<HTMLInputElement>('.options input[value="watch"]')?.click();
			await waitFor(() => expect(container.querySelector('.problem')).not.toBeNull());
			expect(container.querySelector('.problem')?.closest('wa-details')).toBeNull();
		});

		it('shows a problem with the voice while the picker is closed too', async () => {
			const { container } = await renderForm({
				setup: testDaydreamSetup({
					voice: { narrator: 'third-person', stance: 'absent', protagonistName: '' },
					characters: []
				})
			});
			expect(told(container).querySelector('.options')).toBeNull();
			expect(told(container).textContent).toContain('To watch, add at least one character');
		});
	});

	describe('casting', () => {
		it('gives each of the idea’s parts a row, with who plays it or a way to cast it', async () => {
			const setup = testDaydreamSetup({
				idea: { ...testDaydreamSetup().idea, parts: PARTS },
				characters: [
					testCharacter({
						name: 'Mara',
						casting: { partId: 'p1', relationship: 'your boss', part: 'testing you' }
					})
				]
			});
			const { container } = await renderForm({ setup });
			const [interviewer, observer] = partRows(container);
			expect(interviewer?.textContent).toContain('the interviewer');
			expect(interviewer?.querySelector('wa-card')?.textContent).toContain('Mara');
			expect(interviewer?.textContent).toContain('your boss · testing you');
			expect(observer?.querySelector('wa-card')).toBeNull();
			expect(button(observer as HTMLElement, 'Cast the observer')).toBeDefined();
			// Everyone has a part, so the last picker is for someone besides.
			expect(button(container, 'Add someone else')).toBeDefined();
		});

		it('writes the part of someone cast from the library, saying so while it does', async () => {
			opened.set('c1', testCharacter({ name: 'Mara', personality: 'Calm.' }));
			let answer: (value: unknown) => void = () => undefined;
			client.requestSuggestion.mockReturnValue(
				new Promise((resolve) => {
					answer = resolve;
				})
			);
			const { container } = await renderForm({
				setup: testDaydreamSetup({
					idea: { ...testDaydreamSetup().idea, parts: PARTS },
					characters: []
				}),
				library: {
					characters: [{ id: 'c1', revision: 0, updatedAt: new Date(), sealed: ref('c1') }],
					ideas: []
				},
				suggestionsOn: true
			});
			const picker = partRows(container)[0]?.querySelector('wa-dropdown') as HTMLElement;
			const item = [
				...picker.querySelectorAll<HTMLElement & { value: string }>('wa-dropdown-item')
			].find((candidate) => candidate.value === 'c1');
			picker.dispatchEvent(new CustomEvent('wa-select', { detail: { item } }));

			await waitFor(() =>
				expect(partRows(container)[0]?.textContent).toContain('Writing their part…')
			);
			expect(client.requestSuggestion.mock.calls[0]?.[0]).toMatchObject({
				task: 'casting',
				character: { name: 'Mara', personality: 'Calm.' },
				part: { name: 'the interviewer', description: 'asks the questions' },
				stance: 'self'
			});
			answer({
				ok: true,
				value: {
					choices: [
						{ message: { content: '{"relationship": "your new boss", "part": "testing you"}' } }
					]
				}
			});
			await waitFor(() =>
				expect(partRows(container)[0]?.textContent).toContain('your new boss · testing you')
			);
		});

		it('casts without writing anything when suggestions are off', async () => {
			opened.set('c1', testCharacter({ name: 'Mara' }));
			const { container } = await renderForm({
				setup: testDaydreamSetup({
					idea: { ...testDaydreamSetup().idea, parts: PARTS },
					characters: []
				}),
				library: {
					characters: [{ id: 'c1', revision: 0, updatedAt: new Date(), sealed: ref('c1') }],
					ideas: []
				}
			});
			const picker = partRows(container)[0]?.querySelector('wa-dropdown') as HTMLElement;
			const item = [
				...picker.querySelectorAll<HTMLElement & { value: string }>('wa-dropdown-item')
			].find((candidate) => candidate.value === 'c1');
			picker.dispatchEvent(new CustomEvent('wa-select', { detail: { item } }));
			await waitFor(() => expect(partRows(container)[0]?.textContent).toContain('Mara'));
			expect(client.requestSuggestion).not.toHaveBeenCalled();
		});

		it('lets go of a part the new idea does not have, and keeps the words', async () => {
			opened.set('s2', { ...testDaydreamSetup().idea, title: 'Elsewhere', parts: [] });
			const setup = testDaydreamSetup({
				idea: { ...testDaydreamSetup().idea, parts: PARTS },
				characters: [
					testCharacter({
						name: 'Mara',
						casting: { partId: 'p1', relationship: 'your boss', part: '' }
					})
				]
			});
			const { container } = await renderForm({
				setup,
				library: {
					characters: [],
					ideas: [{ id: 's2', revision: 0, updatedAt: new Date(), sealed: ref('s2') }]
				}
			});
			const picker = [...container.querySelectorAll('wa-dropdown')].find((dropdown) =>
				dropdown.textContent?.includes('Choose a saved idea')
			) as HTMLElement;
			const item = picker.querySelector(
				'wa-dropdown-item[value="s2"], wa-dropdown-item'
			) as HTMLElement;
			picker.dispatchEvent(new CustomEvent('wa-select', { detail: { item } }));
			await waitFor(() => expect(container.textContent).toContain('Elsewhere'));
			expect(partRows(container)).toHaveLength(0);
			const card = [...container.querySelectorAll('wa-card')].find((each) =>
				each.textContent?.includes('Mara')
			);
			expect(card?.textContent).toContain('your boss');
		});

		it('keeps their part when taking the library’s newer version of them', async () => {
			opened.set('c1', { ...testCharacter({ name: 'Mara', archetype: 'stricter now' }) });
			const setup = testDaydreamSetup({
				idea: { ...testDaydreamSetup().idea, parts: PARTS },
				characters: [
					testCharacter({
						name: 'Mara',
						sourceId: 'c1',
						sourceRevision: 1,
						casting: { partId: 'p1', relationship: 'your boss', part: '' }
					})
				]
			});
			const { container } = await renderForm({
				setup,
				library: {
					characters: [{ id: 'c1', revision: 2, updatedAt: new Date(), sealed: ref('c1') }],
					ideas: []
				}
			});
			button(container, 'Use the latest')?.click();
			await waitFor(() =>
				expect(container.textContent).not.toContain('Updated in your library since.')
			);
			expect(partRows(container)[0]?.textContent).toContain('your boss');
		});
	});
});
