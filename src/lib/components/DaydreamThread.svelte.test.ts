import { render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { DAYDREAM_LIMITS, type DaydreamTurnRole } from '$lib/daydream';
import type { ReplyOutcome } from '$lib/daydream/client';
import type { ReplySoFar } from '$lib/daydream/reply-format';
import type { DaydreamTurnContent, PassageMeta } from '$lib/sealed-kinds/daydreams';
import { testDaydreamSetup } from '$lib/testing/daydream-setup';
import { defined } from '$lib/testing/defined';
import { pending } from '$lib/testing/pending';
import { waByProp, waProp, waSettled } from '$lib/testing/web-awesome';
import type {
	DaydreamTreeNodeView,
	DaydreamTurnView,
	DaydreamView,
	SealedRefView
} from '$lib/types';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

/** Whether this device can open the story; flipped by a test. */
const keyring = vi.hoisted(() => ({ status: 'unlocked' as string }));
vi.mock('$lib/crypto/session.svelte', () => ({
	currentKeyring: () =>
		keyring.status === 'unlocked' ? { status: 'unlocked', identity: 'secret' } : keyring,
	unlockedIdentity: () => null
}));

/**
 * What each sealed record opens to, by record id. The real openers are
 * covered by `sealed-cache.svelte.test.ts` and the frozen fixtures; here the
 * story is simply what the test says it is.
 */
const opened = vi.hoisted(() => new Map<string, unknown>());
vi.mock('$lib/sealed-views.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sealed-views.svelte')>()),
	openedDaydreamSetup: (sealed: SealedRefView) => opened.get(sealed.recordId),
	openedDaydreamTurn: (sealed: SealedRefView) => opened.get(sealed.recordId),
	openedDaydreamMark: (sealed: SealedRefView) => opened.get(sealed.recordId)
}));

// Export opens every record itself rather than through the page's cache
// (`DaydreamStory.exportHistory`), so it reads the same map.
vi.mock('$lib/crypto/sealed', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/sealed')>()),
	openRecord: (_kind: unknown, input: { recordId: string }) =>
		Promise.resolve(opened.get(input.recordId) ?? null)
}));
vi.mock('$lib/crypto/vaults.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/vaults.svelte')>()),
	vaultById: (id: string) => ({ id }),
	vaultsSettled: () => Promise.resolve({ status: 'ready' })
}));

/** The composer's restored draft, so a test can press Send without typing into Lexical. */
const draftText = vi.hoisted(() => ({ value: '' }));
vi.mock('$lib/messaging/drafts', () => ({
	openDraft: () =>
		Promise.resolve({
			initial: draftText.value ? { text: draftText.value, tagIds: [] } : null,
			save: () => undefined,
			clear: () => undefined,
			settled: () => Promise.resolve()
		})
}));

type SaveInput = {
	id: string;
	parentId: string | null;
	role: DaydreamTurnRole;
	content: DaydreamTurnContent;
};

const client = vi.hoisted(() => ({
	writeReply: vi.fn(),
	saveTurn: vi.fn(),
	readTurns: vi.fn(),
	setActiveTurn: vi.fn(),
	saveSetup: vi.fn(),
	createMark: vi.fn(),
	deleteMark: vi.fn(),
	requestSuggestion: vi.fn(),
	readPrompt: vi.fn()
}));
vi.mock('$lib/daydream/client', () => client);

const { default: DaydreamThread } = await import('./DaydreamThread.svelte');
const { rawReply } = await import('$lib/daydream/story.svelte');

const SETUP = testDaydreamSetup();
let clock = 0;

function ref(recordId: string): SealedRefView {
	return { recordId, vaultId: 'v', ciphertext: 'sb1.x', payloadVersion: 2 };
}

function turn(
	id: string,
	parentId: string | null,
	role: DaydreamTurnRole,
	content: DaydreamTurnContent | string
): DaydreamTurnView {
	opened.set(id, typeof content === 'string' ? { type: 'text', text: content } : content);
	clock += 1;
	return { id, parentId, role, position: 0, createdAt: new Date(clock * 1000), sealed: ref(id) };
}

const node = ({ sealed: _sealed, ...rest }: DaydreamTurnView): DaydreamTreeNodeView => rest;

/** A daydream whose tree is `turns` and whose branch being read ends at `active` (the last turn by default). */
function daydream(turns: DaydreamTurnView[] = [], active?: string): DaydreamView {
	opened.set('d1', SETUP);
	const activeTurnId = active ?? turns.at(-1)?.id ?? null;
	const byId = new Map(turns.map((each) => [each.id, each]));
	const path: DaydreamTurnView[] = [];
	for (
		let at = activeTurnId ? byId.get(activeTurnId) : undefined;
		at;
		at = at.parentId ? byId.get(at.parentId) : undefined
	) {
		path.unshift(at);
	}
	return {
		id: 'd1',
		revision: 0,
		setup: ref('d1'),
		activeTurnId,
		tree: turns.map(node),
		path,
		marks: []
	};
}

const meta = (overrides: Partial<PassageMeta> = {}): PassageMeta => ({
	suggestions: [],
	directions: { add: [], remove: [] },
	...overrides
});

beforeEach(() => {
	keyring.status = 'unlocked';
	opened.clear();
	draftText.value = '';
	for (const fn of Object.values(client)) {
		fn.mockReset();
	}
	client.saveTurn.mockImplementation((_id: string, input: SaveInput) => {
		opened.set(input.id, input.content);
		clock += 1;
		return Promise.resolve({
			ok: true,
			turn: { ...input, position: 0, createdAt: new Date(clock * 1000), sealed: ref(input.id) }
		});
	});
	client.setActiveTurn.mockResolvedValue({ ok: true });
	// Other branches' turns, opened on demand: whatever the test put in `opened`.
	client.readTurns.mockImplementation((_id: string, ids: string[]) =>
		Promise.resolve({
			ok: true,
			turns: ids.map((id) => ({
				id,
				parentId: null,
				role: 'user',
				position: 0,
				createdAt: new Date(0),
				sealed: ref(id)
			}))
		})
	);
	client.writeReply.mockImplementation(() => pending());
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** The button labelled exactly `text`, or else the first whose label contains it: "Stop" is also in "Stop writing". */
function button(container: HTMLElement, text: string): HTMLElement | undefined {
	const buttons = [...container.querySelectorAll<HTMLElement>('wa-button, button')];
	return (
		buttons.find((candidate) => candidate.textContent?.trim() === text) ??
		buttons.find((candidate) => candidate.textContent?.includes(text))
	);
}

async function press(container: HTMLElement, text: string) {
	await waitFor(() => expect(button(container, text)).toBeDefined());
	await waSettled(container);
	button(container, text)?.click();
}

const saved = (index: number) => client.saveTurn.mock.calls[index]?.[1] as SaveInput | undefined;
const asked = (index: number) =>
	client.writeReply.mock.calls[index]?.[1] as Record<string, unknown> | undefined;

describe('DaydreamThread', () => {
	it('lets the page narrow to a phone, however many directions there are', async () => {
		// The route's own chain: a centred column with `margin: 0 auto`, which
		// sizes to its content's minimum. The directions row once held that
		// minimum at its full length, so the column, and the composer in it,
		// stayed at its maximum width on a phone.
		const shell = document.createElement('main');
		shell.style.cssText = 'display: flex; flex-direction: column; inline-size: 320px';
		const column = document.createElement('div');
		column.style.cssText =
			'max-inline-size: 48rem; margin: 0 auto; display: flex; flex-direction: column';
		const content = document.createElement('div');
		content.style.cssText = 'display: flex; flex-direction: column';
		column.append(content);
		shell.append(column);
		document.body.append(shell);
		const many = ['Slower', 'Crueler', 'Skip ahead', 'Tease', 'Closer', 'Surprise me'].map(
			(label) => ({ id: label.toLowerCase().replace(' ', '-'), label })
		);
		try {
			render(DaydreamThread, {
				target: content,
				props: {
					daydream: daydream([
						turn('t1', null, 'story', {
							type: 'text',
							text: 'Sit.',
							meta: meta({ directions: { add: many, remove: [] } })
						})
					]),
					available: true
				}
			});
			await waitFor(() => expect(content.querySelector('[contenteditable]')).not.toBeNull());
			await waSettled(content);
			expect(column.getBoundingClientRect().width).toBeLessThanOrEqual(320);
			const compose = defined(content.querySelector('.compose'), 'compose');
			expect(compose.getBoundingClientRect().width).toBeLessThanOrEqual(320);
		} finally {
			shell.remove();
		}
	});

	it('shows only a placeholder while the device cannot open the story', () => {
		keyring.status = 'locked';
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit down.')]),
			available: true
		});
		expect(container.textContent).not.toContain('Sit down.');
		expect(client.writeReply).not.toHaveBeenCalled();
	});

	it('shows the branch being read, naming a lone character on their passages', () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'story', 'Sit down.'),
				turn('t2', 't1', 'user', 'I sit.')
			]),
			available: true
		});
		expect(container.querySelector('li.passage')?.textContent).toContain('Mara');
		expect(container.querySelector('li.passage')?.textContent).toContain('Sit down.');
		expect(container.querySelector('li.said')?.textContent).toContain('I sit.');
	});

	it('opens a new daydream by itself, then offers what the passage offered', async () => {
		let finish: (outcome: ReplyOutcome) => void = () => undefined;
		client.writeReply.mockImplementationOnce(
			(_id: string, _request: unknown, options: { onText: (soFar: ReplySoFar) => void }) =>
				new Promise((resolve) => {
					options.onText({ passage: 'Mara looks', expansion: null, reading: null });
					finish = resolve;
				})
		);
		const { container } = render(DaydreamThread, { daydream: daydream(), available: true });

		await waitFor(() =>
			expect(container.querySelector('li.streaming')?.textContent).toContain('Mara looks')
		);
		expect(asked(0)).toMatchObject({ mode: 'opening', turns: [] });

		finish({
			ok: true,
			raw: '',
			expansion: null,
			reading: null,
			passage: 'Mara looks up.',
			meta: meta({
				suggestions: ['I sit down.'],
				directions: {
					add: [
						{ id: 'slower', label: 'Slower' },
						{ id: 'surprise-me', label: 'Surprise me' }
					],
					remove: []
				}
			})
		});
		await waitFor(() => expect(saved(0)).toMatchObject({ parentId: null, role: 'story' }));
		expect(saved(0)?.content).toMatchObject({ type: 'text', text: 'Mara looks up.' });
		await waitFor(() => expect(button(container, 'Slower')).toBeDefined());
		expect(button(container, 'Surprise me')).toBeDefined();
		expect(button(container, 'Continue')).toBeDefined();
		expect(container.querySelector('.suggestions')?.textContent).toContain('I sit down.');
	});

	it('does not ask for an opening on a server that cannot write one', () => {
		render(DaydreamThread, { daydream: daydream(), available: false });
		expect(client.writeReply).not.toHaveBeenCalled();
	});

	it('saves what the user sends after the turn they are on, then asks for the next passage', async () => {
		draftText.value = 'I sit down.';
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
			available: true
		});
		await press(container, 'Send');
		await waitFor(() => expect(client.writeReply).toHaveBeenCalledOnce());
		expect(saved(0)).toMatchObject({
			parentId: 't1',
			role: 'user',
			content: { type: 'text', text: 'I sit down.' }
		});
		expect(asked(0)).toMatchObject({
			mode: 'reply',
			turns: [
				{ type: 'text', role: 'story', text: 'Sit.' },
				{ type: 'text', role: 'user', text: 'I sit down.' }
			]
		});
	});

	it('sends a suggestion with a tap', async () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'story', {
					type: 'text',
					text: 'Sit.',
					meta: meta({ suggestions: ['I kneel instead.'] })
				})
			]),
			available: true
		});
		await press(container, 'I kneel instead.');
		await waitFor(() =>
			expect(saved(0)?.content).toEqual({ type: 'text', text: 'I kneel instead.' })
		);
	});

	it('puts a suggestion in the composer to edit, rather than sending it', async () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'story', {
					type: 'text',
					text: 'Sit.',
					meta: meta({ suggestions: ['I kneel instead.'] })
				})
			]),
			available: true
		});
		await waitFor(() => expect(container.querySelector('[contenteditable="true"]')).not.toBeNull());
		await waSettled(container);
		const edit = [...container.querySelectorAll('.suggestions wa-button')][1] as HTMLElement;
		edit.click();
		await waitFor(() =>
			expect(container.querySelector('[contenteditable]')?.textContent).toContain(
				'I kneel instead.'
			)
		);
		expect(client.saveTurn).not.toHaveBeenCalled();
	});

	it('continues without adding a turn, and records a direction button as one', async () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'story', {
					type: 'text',
					text: 'Sit.',
					meta: meta({ directions: { add: [{ id: 'slower', label: 'Slower' }], remove: [] } })
				})
			]),
			available: true
		});
		await press(container, 'Continue');
		await waitFor(() => expect(client.writeReply).toHaveBeenCalledOnce());
		expect(client.saveTurn).not.toHaveBeenCalled();
		expect(asked(0)).toMatchObject({
			mode: 'reply',
			currentDirections: [{ id: 'slower', label: 'Slower' }]
		});
	});

	it('sends each passage with the buttons its own request listed, so the history is sent as it was', async () => {
		const slower = { id: 'slower', label: 'Slower' };
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'story', {
					type: 'text',
					text: 'Sit.',
					meta: meta({ directions: { add: [slower], remove: [] } })
				}),
				turn('t2', 't1', 'user', 'I sit.'),
				turn('t3', 't2', 'story', { type: 'text', text: 'Good.', meta: meta() })
			]),
			available: true
		});
		await press(container, 'Continue');
		await waitFor(() => expect(client.writeReply).toHaveBeenCalledOnce());
		expect(asked(0)?.turns).toEqual([
			{ type: 'text', role: 'story', text: 'Sit.', buttons: [] },
			{ type: 'text', role: 'user', text: 'I sit.' },
			{ type: 'text', role: 'story', text: 'Good.', buttons: [slower] }
		]);
	});

	it('keeps the directions on one row beside the safety controls, scrolling with faded ends and chevrons', async () => {
		const many = ['Slower', 'Crueler', 'Skip ahead', 'Tease', 'Closer', 'Surprise me'].map(
			(label) => ({ id: label.toLowerCase().replace(' ', '-'), label })
		);
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'story', {
					type: 'text',
					text: 'Sit.',
					meta: meta({ directions: { add: many, remove: [] } })
				})
			]),
			available: true
		});
		container.style.inlineSize = '24rem';
		await waitFor(() => expect(button(container, 'Surprise me')).toBeDefined());
		await waSettled(container);
		const scroller = defined(
			container.querySelector<HTMLElement>('.overflow > .scroller'),
			'scroller'
		);
		const chevron = (end: 'start' | 'end') =>
			defined(container.querySelector<HTMLElement>(`.chevron.${end}`), `${end} chevron`);
		const stop = defined(button(container, 'Stop'), 'Stop');
		const continueButton = defined(button(container, 'Continue'), 'Continue');
		const surprise = defined(button(container, 'Surprise me'), 'Surprise me');

		// One row: the first and last directions, and Stop, share a line.
		const top = (element: HTMLElement) => Math.round(element.getBoundingClientRect().top);
		expect(top(surprise)).toBe(top(continueButton));
		expect(top(stop)).toBe(top(continueButton));
		expect(stop.getBoundingClientRect().left).toBeGreaterThan(
			scroller.getBoundingClientRect().right
		);

		// Only the end with more past it is faded, and has a chevron.
		await waitFor(() => expect(scroller.hasAttribute('data-more-end')).toBe(true));
		expect(scroller.hasAttribute('data-more-start')).toBe(false);
		expect(chevron('end').classList.contains('shown')).toBe(true);
		expect(chevron('start').classList.contains('shown')).toBe(false);
		// Square, so `pill` makes its hover background a circle.
		expect(chevron('end').offsetWidth).toBe(chevron('end').offsetHeight);

		// A chevron scrolls by most of a page.
		const onePage = scroller.clientWidth * 0.8;
		chevron('end').click();
		await waitFor(() => expect(scroller.scrollLeft).toBeCloseTo(onePage, -1));
		await waitFor(() => expect(chevron('start').classList.contains('shown')).toBe(true));
		chevron('start').click();
		await waitFor(() => expect(scroller.scrollLeft).toBe(0));
		await waitFor(() => expect(chevron('start').classList.contains('shown')).toBe(false));

		// At the far end, that end is crisp and its chevron gone.
		scroller.scrollLeft = scroller.scrollWidth;
		await waitFor(() => expect(scroller.hasAttribute('data-more-end')).toBe(false));
		expect(scroller.hasAttribute('data-more-start')).toBe(true);
		expect(chevron('end').classList.contains('shown')).toBe(false);

		// A page that would stop a sliver short of the end goes all the way.
		const farEnd = scroller.scrollWidth - scroller.clientWidth;
		// A page short of the end, plus 4rem (64px): within the 5rem that counts as nearly there.
		scroller.scrollLeft = farEnd - scroller.clientWidth * 0.8 - 64;
		await waitFor(() => expect(chevron('end').classList.contains('shown')).toBe(true));
		chevron('end').click();
		await waitFor(() => expect(scroller.scrollLeft).toBeCloseTo(farEnd, 0));
	});

	it('shows every reaction icon unpressed, in a variant the free icon set has', async () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
			available: true
		});
		const icon = (label: string) =>
			container.querySelector(`button[aria-label="${label}"] wa-icon`);
		await waitFor(() => expect(icon('Loved it')).not.toBeNull());
		await waSettled(container);
		// Font Awesome has no free regular `fire`: asked for one, the button sat empty.
		expect(icon('Loved it')?.getAttribute('variant')).toBe('solid');
		expect(icon('Liked it')?.getAttribute('variant')).toBe('regular');
	});

	it('records a direction as a turn before asking for the passage after it', async () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'story', {
					type: 'text',
					text: 'Sit.',
					meta: meta({ directions: { add: [{ id: 'slower', label: 'Slower' }], remove: [] } })
				})
			]),
			available: true
		});
		await press(container, 'Slower');
		await waitFor(() => expect(client.writeReply).toHaveBeenCalledOnce());
		expect(saved(0)).toMatchObject({
			parentId: 't1',
			content: { type: 'direction', id: 'slower', label: 'Slower' }
		});
	});

	it('moves between versions of a passage with the switcher', async () => {
		const opening = turn('t1', null, 'story', 'Sit.');
		const first = turn('a', 't1', 'user', 'First thing I said.');
		const second = turn('b', 't1', 'user', 'Second thing I said.');
		const { container } = render(DaydreamThread, {
			daydream: daydream([opening, first, second], 'b'),
			available: true
		});
		expect(container.textContent).toContain('Second thing I said.');
		expect(container.textContent).toContain('2/2');
		await waSettled(container);
		const [previous] = waByProp(container, 'wa-icon', 'label', 'Previous version');
		const switcher = previous?.closest<HTMLElement>('wa-button');
		if (!switcher) {
			throw new Error('no switcher');
		}
		switcher.click();
		await waitFor(() => expect(container.textContent).toContain('First thing I said.'));
		expect(container.textContent).not.toContain('Second thing I said.');
		expect(client.setActiveTurn).toHaveBeenCalledWith('d1', 'a');
		// The other branch's turn was not in the page's data: it was opened on demand.
		expect(client.readTurns).toHaveBeenCalledWith('d1', ['a']);
	});

	it('writes a passage again as another version beside it', async () => {
		client.writeReply.mockResolvedValueOnce({
			ok: true,
			passage: 'Second take.',
			meta: null,
			expansion: null
		});
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'user', 'Hello.'),
				turn('t2', 't1', 'story', 'First take.')
			]),
			available: true
		});
		await waSettled(container);
		const menu = container.querySelector('li.passage wa-dropdown') as HTMLElement;
		const [again] = waByProp(menu, 'wa-dropdown-item', 'value', 'again');
		menu.dispatchEvent(new CustomEvent('wa-select', { detail: { item: again } }));
		await waitFor(() => expect(saved(0)).toMatchObject({ parentId: 't1', role: 'story' }));
		expect(asked(0)).toMatchObject({
			mode: 'reply',
			turns: [{ type: 'text', role: 'user', text: 'Hello.' }]
		});
		await waitFor(() => expect(container.textContent).toContain('Second take.'));
		expect(container.textContent).toContain('2/2');
	});

	it('stops the scene: drops what was arriving, asks for a check-in, and offers to carry on', async () => {
		let signal: AbortSignal | undefined;
		client.writeReply.mockImplementationOnce(
			(
				_id: string,
				_request: unknown,
				options: { signal: AbortSignal; onText: (soFar: ReplySoFar) => void }
			) => {
				({ signal } = options);
				options.onText({ passage: 'Something unwanted', expansion: null, reading: null });
				return new Promise((_resolve, reject) => {
					options.signal.addEventListener('abort', () =>
						reject(new DOMException('stopped', 'AbortError'))
					);
				});
			}
		);
		client.writeReply.mockResolvedValueOnce({
			ok: true,
			passage: 'Are you okay?',
			meta: null,
			expansion: null
		});
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.'), turn('t2', 't1', 'user', 'Go on.')]),
			available: true
		});
		await press(container, 'Continue');
		await waitFor(() => expect(container.textContent).toContain('Something unwanted'));
		await press(container, 'Stop');

		await waitFor(() => expect(signal?.aborted).toBe(true));
		await waitFor(() => expect(saved(0)?.content).toEqual({ type: 'safety', signal: 'red' }));
		await waitFor(() =>
			expect(saved(1)?.content).toMatchObject({
				type: 'text',
				text: 'Are you okay?',
				meta: { ooc: true }
			})
		);
		// What had arrived was dropped, never saved.
		expect(JSON.stringify(client.saveTurn.mock.calls)).not.toContain('Something unwanted');
		await waitFor(() => expect(container.textContent).toContain('The scene is stopped'));
		expect(button(container, 'Continue')).toBeUndefined();

		await press(container, 'Carry on');
		await waitFor(() => expect(saved(2)?.content).toEqual({ type: 'safety', signal: 'resume' }));
	});

	it('folds Ease off and Stop into a menu on a narrow screen', async () => {
		await page.viewport(600, 800);
		try {
			const { container } = render(DaydreamThread, {
				daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
				available: true
			});
			await waitFor(() => expect(button(container, 'Continue')).toBeDefined());
			await waSettled(container);
			const visible = (element: Element | null | undefined) => element?.checkVisibility() ?? false;
			expect(visible(button(container, 'Ease off'))).toBe(false);
			expect(visible(button(container, 'Stop'))).toBe(false);
			const menu = defined(container.querySelector('.menu'), 'menu');
			expect(visible(menu)).toBe(true);

			defined(menu.querySelector<HTMLElement>('[slot="trigger"]'), 'trigger').click();
			const stop = defined(
				[...menu.querySelectorAll<HTMLElement>('wa-dropdown-item')].find(
					(item) => item.textContent?.trim() === 'Stop'
				),
				'Stop item'
			);
			await waitFor(() => expect(visible(stop)).toBe(true));
			stop.click();
			await waitFor(() => expect(saved(0)?.content).toEqual({ type: 'safety', signal: 'red' }));
		} finally {
			await page.viewport(1280, 800);
		}
	});

	it('shows Ease off and Stop as buttons on a wide screen', async () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
			available: true
		});
		await waitFor(() => expect(button(container, 'Stop')).toBeDefined());
		await waSettled(container);
		expect(button(container, 'Stop')?.checkVisibility()).toBe(true);
		expect(container.querySelector('.menu')?.checkVisibility()).toBe(false);
	});

	it('eases off: lowers the intensity and records it', async () => {
		client.saveSetup.mockResolvedValue({ ok: true, revision: 1 });
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
			available: true
		});
		await press(container, 'Ease off');
		await waitFor(() => expect(client.saveSetup).toHaveBeenCalledOnce());
		expect(client.saveSetup.mock.calls[0]?.[1]).toMatchObject({ dials: { intensity: 2 } });
		await waitFor(() => expect(saved(0)?.content).toEqual({ type: 'safety', signal: 'yellow' }));
	});

	it('puts Settings and the dials in one split button, right of Bookmarks', async () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
			available: true
		});
		await waitFor(() => expect(container.querySelector('#daydream-dials')).not.toBeNull());
		const tools = defined(container.querySelector('.tools'), 'the tool row');
		const [, bookmarks, group] = tools.children;
		expect(bookmarks?.textContent).toContain('Bookmarks');
		expect(group?.tagName).toBe('WA-BUTTON-GROUP');
		const [settings, caret] = defined(group, 'the split button').children;
		expect(settings?.textContent?.trim()).toBe('Settings for this daydream');
		expect(waProp(defined(settings, 'Settings'), 'href')).toBe(
			'/(auth-required)/(app)/daydreams/d1/edit'
		);
		expect(caret?.id).toBe('daydream-dials');
		expect(waProp(caret?.querySelector('wa-icon'), 'label')).toBe('Dials');
		expect(waProp(container.querySelector('wa-popover'), 'for')).toBe('daydream-dials');
	});

	it('shows a dial’s level as it is dragged, and saves it only when let go', async () => {
		client.saveSetup.mockResolvedValue({ ok: true, revision: 1 });
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
			available: true
		});
		await waitFor(() => expect(waByProp(container, 'wa-slider', 'label', 'Heat')).toHaveLength(1));
		await waSettled(container);
		const heat = waByProp(container, 'wa-slider', 'label', 'Heat')[0] as HTMLElement & {
			value: number;
		};
		const level = () => heat.closest('.dial')?.querySelector('.level')?.textContent;
		// Unset: a bare knob, its filled track hidden until it is moved.
		const fill = () =>
			getComputedStyle(defined(heat.shadowRoot?.querySelector('[part~="indicator"]'), 'the fill'))
				.visibility;
		expect(level()).toContain('Not set');
		expect(fill()).toBe('hidden');
		heat.value = 4;
		heat.dispatchEvent(new Event('input'));
		await waitFor(() => expect(level()).toContain('Explicit'));
		expect(fill()).toBe('visible');
		expect(client.saveSetup).not.toHaveBeenCalled();
		heat.dispatchEvent(new Event('change'));
		await waitFor(() => expect(client.saveSetup).toHaveBeenCalledOnce());
	});

	it('sets an unset dial to where its knob is when it is pressed and let go', async () => {
		client.saveSetup.mockResolvedValue({ ok: true, revision: 1 });
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
			available: true
		});
		await waitFor(() => expect(waByProp(container, 'wa-slider', 'label', 'Heat')).toHaveLength(1));
		await waSettled(container);
		const heat = defined(waByProp(container, 'wa-slider', 'label', 'Heat')[0], 'the heat dial');
		const level = () => heat.closest('.dial')?.querySelector('.level')?.textContent;
		// Held: the level the knob is on shows, and nothing is saved yet.
		heat.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
		await waitFor(() => expect(level()).not.toContain('Not set'));
		expect(client.saveSetup).not.toHaveBeenCalled();
		globalThis.dispatchEvent(new PointerEvent('pointercancel'));
		await waitFor(() => expect(level()).toContain('Not set'));
		// Pressed and let go for real, through Playwright, without moving: set
		// to where the knob is, though the slider itself sends no change.
		// Opened first: the dials are in a popover, out of a real pointer's reach.
		await userEvent.click(defined(container.querySelector('#daydream-dials'), 'the Dials chevron'));
		const thumb = defined(heat.shadowRoot?.querySelector('[part~="thumb"]'), 'the knob');
		await userEvent.click(thumb);
		await waitFor(() => expect(client.saveSetup).toHaveBeenCalledOnce());
		expect(client.saveSetup.mock.calls[0]?.[1]).toMatchObject({ scene: { dials: { heat: 3 } } });
	});

	it('turns the scene’s heat up mid-story, in this daydream’s copy of the scene', async () => {
		client.saveSetup.mockResolvedValue({ ok: true, revision: 1 });
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
			available: true
		});
		// The label is a property Svelte set on the upgraded element (AGENTS.md).
		await waitFor(() => expect(waByProp(container, 'wa-slider', 'label', 'Heat')).toHaveLength(1));
		await waSettled(container);
		const heat = waByProp(container, 'wa-slider', 'label', 'Heat')[0] as HTMLElement & {
			value: number;
		};
		heat.value = 4;
		heat.dispatchEvent(new Event('change'));
		await waitFor(() => expect(client.saveSetup).toHaveBeenCalledOnce());
		expect(client.saveSetup.mock.calls[0]?.[1]).toMatchObject({
			scene: { title: SETUP.scene.title, dials: { heat: 4, kink: null } },
			dials: SETUP.dials
		});
	});

	it('rolls the die a passage proposed, and records the result', async () => {
		const roll = {
			prompt: 'Roll to hold still',
			sides: 6,
			outcomes: [
				{ min: 1, max: 3, label: 'You move' },
				{ min: 4, max: 6, label: 'You hold' }
			]
		};
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'story', { type: 'text', text: 'Hold.', meta: meta({ roll }) })
			]),
			available: true
		});
		expect(container.textContent).toContain('Roll to hold still');
		await press(container, 'Roll a d6');
		await waitFor(() => expect(saved(0)?.content.type).toBe('roll'));
		const content = saved(0)?.content as Extract<DaydreamTurnContent, { type: 'roll' }>;
		expect(content.proposalTurnId).toBe('t1');
		expect(content.result).toBeGreaterThanOrEqual(1);
		expect(content.result).toBeLessThanOrEqual(6);
		expect(content.outcome).toBe(content.result <= 3 ? 'You move' : 'You hold');
	});

	it('offers the selection bar for words selected in a passage', async () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'She waits. You hold still.')]),
			available: true
		});
		const text = container.querySelector('[data-passage-text="t1"]') as HTMLElement;
		const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
		let textNode = walker.nextNode() as Text | null;
		while (textNode && !textNode.data.includes('You hold')) {
			textNode = walker.nextNode() as Text | null;
		}
		if (!textNode) {
			throw new Error('no passage text');
		}
		const start = textNode.data.indexOf('You hold');
		const range = document.createRange();
		range.setStart(textNode, start);
		range.setEnd(textNode, start + 'You hold still.'.length);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));

		await waitFor(() => expect(button(container, 'More of this')).toBeDefined());
		await press(container, 'More of this');
		await waitFor(() =>
			expect(saved(0)?.content).toEqual({
				type: 'steer',
				action: 'more',
				targetTurnId: 't1',
				quote: { start, end: start + 15, text: 'You hold still.' }
			})
		);
	});

	it('says when a passage fails, and tries again on request', async () => {
		client.writeReply.mockResolvedValueOnce({
			ok: false,
			error: 'The reply could not be written.',
			partial: ''
		});
		const { container } = render(DaydreamThread, { daydream: daydream(), available: true });
		await waitFor(() => expect(container.textContent).toContain('The reply could not be written.'));
		await press(container, 'Try again');
		await waitFor(() => expect(client.writeReply).toHaveBeenCalledTimes(2));
	});

	it('keeps what the user wrote when it cannot be saved, and asks for nothing', async () => {
		draftText.value = 'I sit down.';
		client.saveTurn.mockResolvedValueOnce({
			ok: false,
			error: 'Something changed since this page loaded.'
		});
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', null, 'story', 'Sit.')]),
			available: true
		});
		await press(container, 'Send');
		await waitFor(() =>
			expect(container.textContent).toContain('Something changed since this page loaded.')
		);
		expect(client.writeReply).not.toHaveBeenCalled();
		expect(container.querySelector('[contenteditable]')?.textContent).toContain('I sit down.');
	});

	describe('written-out turns', () => {
		const Instruction = 'Tell Mara the fox is safe';
		const WrittenOut = '"Mara, the fox is safe."';

		/** A story where the user's instruction was written out by the passage answering it. */
		function writtenOut() {
			return daydream([
				turn('t1', null, 'story', 'Mara frets.'),
				turn('t2', 't1', 'user', Instruction),
				turn('t3', 't2', 'story', {
					type: 'text',
					text: 'Mara sighs with relief.',
					meta: meta({ readAs: 'instruction', expansion: WrittenOut })
				})
			]);
		}

		const bubble = (container: HTMLElement) =>
			container.querySelector('li.said[data-turn-id="t2"]') as HTMLElement;

		it('shows the turn written out, and what was sent at a press', async () => {
			const { container } = render(DaydreamThread, { daydream: writtenOut(), available: true });
			expect(bubble(container).querySelector('.text')?.textContent).toBe(WrittenOut);
			expect(bubble(container).textContent).toContain('written out for you');

			await press(container, 'Show what you sent');
			await waitFor(() =>
				expect(bubble(container).querySelector('.text')?.textContent).toBe(Instruction)
			);
			expect(bubble(container).querySelector('.text')?.classList.contains('note')).toBe(true);
			expect(bubble(container).textContent).toContain('what you sent');

			await press(container, 'Show it written out');
			await waitFor(() =>
				expect(bubble(container).querySelector('.text')?.textContent).toBe(WrittenOut)
			);
		});

		it('leaves an ordinary turn as it was sent, with no switch', () => {
			const { container } = render(DaydreamThread, {
				daydream: daydream([
					turn('t1', null, 'story', 'Mara frets.'),
					turn('t2', 't1', 'user', 'I hug her.'),
					turn('t3', 't2', 'story', 'Mara hugs back.')
				]),
				available: true
			});
			expect(bubble(container).querySelector('.text')?.textContent).toBe('I hug her.');
			expect(button(container, 'Show what you sent')).toBeUndefined();
		});

		it('fills the bubble in as the turn is written out, then keeps it with the passage', async () => {
			draftText.value = Instruction;
			let finish: (outcome: ReplyOutcome) => void = () => undefined;
			client.writeReply.mockImplementationOnce(
				(_id: string, _request: unknown, options: { onText: (soFar: ReplySoFar) => void }) =>
					new Promise((resolve) => {
						options.onText({ passage: '', expansion: '"Mara, the fox', reading: null });
						finish = resolve;
					})
			);
			const { container } = render(DaydreamThread, {
				daydream: daydream([turn('t1', null, 'story', 'Mara frets.')]),
				available: true
			});
			await press(container, 'Send');
			await waitFor(() => expect(container.textContent).toContain('"Mara, the fox'));
			const sent = defined(saved(0), 'the user turn');
			expect(sent.content).toEqual({ type: 'text', text: Instruction });
			expect(container.querySelector('li.said .text')?.textContent).toBe('"Mara, the fox');

			finish({
				ok: true,
				raw: '',
				passage: 'Mara sighs with relief.',
				meta: meta({ readAs: 'action' }),
				expansion: WrittenOut,
				reading: null
			});
			await waitFor(() => expect(saved(1)).toMatchObject({ parentId: sent.id, role: 'story' }));
			// The turn the user sent is kept as sent; the passage carries it written out.
			expect(saved(1)?.content).toMatchObject({
				type: 'text',
				text: 'Mara sighs with relief.',
				meta: { readAs: 'instruction', expansion: WrittenOut }
			});
			await waitFor(() =>
				expect(container.querySelector('li.said .text')?.textContent).toBe(WrittenOut)
			);
		});

		it('drops a turn written out after something the user did not write', async () => {
			client.writeReply.mockResolvedValueOnce({
				ok: true,
				passage: 'Slowly, then.',
				meta: null,
				expansion: 'I slow down.'
			});
			const { container } = render(DaydreamThread, {
				daydream: daydream([
					turn('t1', null, 'story', {
						type: 'text',
						text: 'Mara frets.',
						meta: meta({ directions: { add: [{ id: 'slower', label: 'Slower' }], remove: [] } })
					})
				]),
				available: true
			});
			await press(container, 'Slower');
			await waitFor(() => expect(saved(1)).toMatchObject({ role: 'story' }));
			expect(saved(1)?.content).toEqual({ type: 'text', text: 'Slowly, then.' });
		});

		it('tells the model the turn as written out from then on', async () => {
			draftText.value = 'I sit with her.';
			const { container } = render(DaydreamThread, { daydream: writtenOut(), available: true });
			await press(container, 'Send');
			await waitFor(() => expect(client.writeReply).toHaveBeenCalledOnce());
			expect(asked(0)).toMatchObject({
				turns: [
					{ type: 'text', role: 'story', text: 'Mara frets.' },
					{ type: 'text', role: 'user', text: WrittenOut },
					{ type: 'text', role: 'story', text: 'Mara sighs with relief.' },
					{ type: 'text', role: 'user', text: 'I sit with her.' }
				]
			});
		});

		it('writes the turn out afresh for another take', async () => {
			client.writeReply.mockResolvedValueOnce({
				ok: true,
				passage: 'Mara nods.',
				meta: null,
				expansion: '"It\'s safe, Mara."'
			});
			const { container } = render(DaydreamThread, { daydream: writtenOut(), available: true });
			await waSettled(container);
			const menu = container.querySelector(
				'li.passage[data-turn-id="t3"] wa-dropdown'
			) as HTMLElement;
			const [again] = waByProp(menu, 'wa-dropdown-item', 'value', 'again');
			menu.dispatchEvent(new CustomEvent('wa-select', { detail: { item: again } }));
			await waitFor(() => expect(saved(0)).toMatchObject({ parentId: 't2', role: 'story' }));
			expect(asked(0)).toMatchObject({
				turns: [
					{ type: 'text', role: 'story', text: 'Mara frets.' },
					{ type: 'text', role: 'user', text: Instruction }
				]
			});
			expect(saved(0)?.content).toMatchObject({ meta: { expansion: '"It\'s safe, Mara."' } });
		});

		it('keeps the turn as written out when its passage is rewritten', async () => {
			client.writeReply.mockResolvedValueOnce({
				ok: true,
				passage: 'Mara laughs.',
				meta: null,
				expansion: 'Something else entirely.'
			});
			const { container } = render(DaydreamThread, { daydream: writtenOut(), available: true });
			const text = container.querySelector('[data-passage-text="t3"]') as HTMLElement;
			const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
			let textNode = walker.nextNode() as Text | null;
			while (textNode && !textNode.data.includes('relief')) {
				textNode = walker.nextNode() as Text | null;
			}
			const found = defined(textNode, 'the passage text');
			const start = found.data.indexOf('relief');
			const range = document.createRange();
			range.setStart(found, start);
			range.setEnd(found, start + 'relief'.length);
			document.getSelection()?.removeAllRanges();
			document.getSelection()?.addRange(range);
			document.dispatchEvent(new Event('selectionchange'));

			await press(container, 'Rewrite this');
			await waitFor(() => expect(saved(0)).toMatchObject({ parentId: 't2', role: 'story' }));
			expect(asked(0)).toMatchObject({
				mode: 'rewrite',
				turns: [
					{ type: 'text', role: 'story', text: 'Mara frets.' },
					{ type: 'text', role: 'user', text: WrittenOut }
				]
			});
			expect(saved(0)?.content).toMatchObject({
				meta: { readAs: 'instruction', expansion: WrittenOut }
			});
		});
	});

	describe('directions and reading a turn differently', () => {
		const Steamy = 'Make the story super steamy';

		/** A story where the user's words were read by the passage after them as `readAs`. */
		function readAs(readAsValue: PassageMeta['readAs'], readAsChosen?: boolean) {
			return daydream([
				turn('t1', null, 'story', 'Mara waits.'),
				turn('t2', 't1', 'user', Steamy),
				turn('t3', 't2', 'story', {
					type: 'text',
					text: 'The air grows warm.',
					meta: meta({
						readAs: readAsValue,
						...(readAsChosen === undefined ? {} : { readAsChosen })
					})
				})
			]);
		}

		/** Picks a reading from the user turn's Read it differently menu. */
		async function rereadAs(container: HTMLElement, turnId: string, reading: string) {
			await waSettled(container);
			const menu = container.querySelector(
				`li[data-turn-id="${turnId}"] wa-dropdown.reread`
			) as HTMLElement;
			const [item] = waByProp(menu, 'wa-dropdown-item', 'value', reading);
			menu.dispatchEvent(new CustomEvent('wa-select', { detail: { item } }));
		}

		it('draws words read as a direction as a direction, not something said', () => {
			const { container } = render(DaydreamThread, {
				daydream: readAs('direction'),
				available: true
			});
			const marker = container.querySelector('li.marker[data-turn-id="t2"]');
			expect(marker?.textContent).toContain(Steamy);
			expect(container.querySelector('li.said[data-turn-id="t2"]')).toBeNull();
		});

		it('draws a turn as a direction as soon as the reply says it read it as one', async () => {
			let finish: (outcome: ReplyOutcome) => void = () => undefined;
			client.writeReply.mockImplementationOnce(
				(_id: string, _request: unknown, options: { onText: (soFar: ReplySoFar) => void }) =>
					new Promise((resolve) => {
						options.onText({ passage: '', expansion: null, reading: 'direction' });
						finish = resolve;
					})
			);
			draftText.value = Steamy;
			const { container } = render(DaydreamThread, {
				daydream: daydream([turn('t1', null, 'story', 'Mara waits.')]),
				available: true
			});
			await press(container, 'Send');
			await waitFor(() =>
				expect(container.querySelector('li.marker')?.textContent).toContain(Steamy)
			);

			// The opening reading outranks the one in the metadata.
			finish({
				ok: true,
				raw: '',
				passage: 'The air grows warm.',
				meta: meta({ readAs: 'action' }),
				expansion: null,
				reading: 'direction'
			});
			await waitFor(() => expect(saved(1)).toMatchObject({ role: 'story' }));
			expect(saved(1)?.content).toMatchObject({ meta: { readAs: 'direction' } });
			expect(saved(1)?.content).not.toMatchObject({ meta: { readAsChosen: true } });
		});

		it('offers every reading but the one it was read as', async () => {
			const { container } = render(DaydreamThread, {
				daydream: readAs('direction'),
				available: true
			});
			await waSettled(container);
			const values = [...container.querySelectorAll('li[data-turn-id="t2"] wa-dropdown-item')].map(
				(item) => waProp(item as HTMLElement, 'value')
			);
			expect(values).toEqual(['action', 'instruction', 'cowrite', 'ooc']);
		});

		it('forks from the turn with the reading the user meant, keeping the passage it had', async () => {
			client.writeReply.mockResolvedValueOnce({
				ok: true,
				passage: 'Mara blushes.',
				meta: meta({ readAs: 'action' }),
				expansion: null
			});
			const { container } = render(DaydreamThread, { daydream: readAs('action'), available: true });
			expect(container.querySelector('li.said[data-turn-id="t2"]')).not.toBeNull();

			await rereadAs(container, 't2', 'direction');
			await waitFor(() => expect(saved(0)).toMatchObject({ parentId: 't2', role: 'story' }));
			expect(client.setActiveTurn).toHaveBeenCalledWith('d1', 't2');
			expect(asked(0)).toMatchObject({
				mode: 'reply',
				turns: [
					{ type: 'text', role: 'story', text: 'Mara waits.' },
					{ type: 'text', role: 'user', text: Steamy, readAs: 'direction' }
				]
			});
			// The user's choice wins over the model's own reading, and is recorded as theirs.
			expect(saved(0)?.content).toMatchObject({
				text: 'Mara blushes.',
				meta: { readAs: 'direction', readAsChosen: true }
			});
			await waitFor(() =>
				expect(container.querySelector('li.marker[data-turn-id="t2"]')?.textContent).toContain(
					'read as a direction, as you asked'
				)
			);
			// The passage it had is a branch beside the new one.
			expect(container.textContent).toContain('2/2');
		});

		it('stops a passage still arriving, keeps it, then forks', async () => {
			let signal: AbortSignal | undefined;
			client.writeReply.mockImplementationOnce(
				(
					_id: string,
					_request: unknown,
					options: { signal: AbortSignal; onText: (soFar: ReplySoFar) => void }
				) => {
					({ signal } = options);
					options.onText({ passage: 'Mara starts to', expansion: null, reading: null });
					return new Promise((_resolve, reject) => {
						options.signal.addEventListener('abort', () =>
							reject(new DOMException('stopped', 'AbortError'))
						);
					});
				}
			);
			client.writeReply.mockResolvedValueOnce({
				ok: true,
				passage: 'The room heats up.',
				meta: null,
				expansion: null
			});
			draftText.value = Steamy;
			const { container } = render(DaydreamThread, {
				daydream: daydream([turn('t1', null, 'story', 'Mara waits.')]),
				available: true
			});
			await press(container, 'Send');
			await waitFor(() => expect(container.textContent).toContain('Mara starts to'));
			const sent = defined(saved(0), 'the user turn');

			await rereadAs(container, sent.id, 'direction');
			await waitFor(() => expect(signal?.aborted).toBe(true));
			await waitFor(() => expect(saved(2)).toMatchObject({ parentId: sent.id, role: 'story' }));
			expect(saved(1)).toMatchObject({
				parentId: sent.id,
				content: { type: 'text', text: 'Mara starts to' }
			});
			expect(saved(2)?.content).toMatchObject({
				text: 'The room heats up.',
				meta: { readAs: 'direction', readAsChosen: true }
			});
		});

		it('keeps the chosen reading for another take, and tells the model it later', async () => {
			client.writeReply.mockResolvedValueOnce({
				ok: true,
				passage: 'Second take.',
				meta: null,
				expansion: null
			});
			const { container } = render(DaydreamThread, {
				daydream: readAs('direction', true),
				available: true
			});
			await waSettled(container);
			const menu = container.querySelector(
				'li.passage[data-turn-id="t3"] wa-dropdown'
			) as HTMLElement;
			const [again] = waByProp(menu, 'wa-dropdown-item', 'value', 'again');
			menu.dispatchEvent(new CustomEvent('wa-select', { detail: { item: again } }));
			await waitFor(() => expect(saved(0)).toMatchObject({ parentId: 't2', role: 'story' }));
			expect(asked(0)?.turns).toContainEqual({
				type: 'text',
				role: 'user',
				text: Steamy,
				readAs: 'direction'
			});
			expect(saved(0)?.content).toMatchObject({
				meta: { readAs: 'direction', readAsChosen: true }
			});
		});

		it('sends the model’s own reading of an earlier turn as nothing but the words', async () => {
			draftText.value = 'I kiss her.';
			const { container } = render(DaydreamThread, {
				daydream: readAs('direction'),
				available: true
			});
			await press(container, 'Send');
			await waitFor(() => expect(client.writeReply).toHaveBeenCalledOnce());
			expect(asked(0)?.turns).toContainEqual({ type: 'text', role: 'user', text: Steamy });
		});
	});

	describe('naming', () => {
		/** A daydream with no name yet, its opening written. */
		function unnamed() {
			const value = daydream([turn('t1', null, 'story', 'Sit down. We have a lot to cover.')]);
			opened.set('d1', { ...SETUP, title: '' });
			return value;
		}

		const completion = (body: unknown) => ({
			ok: true,
			value: { choices: [{ message: { content: JSON.stringify(body) } }] }
		});

		it('names an unnamed daydream from its opening, and tells the page', async () => {
			client.requestSuggestion.mockResolvedValue(completion({ title: '“After the meeting”' }));
			client.saveSetup.mockResolvedValue({ ok: true, revision: 1 });
			const onnamed = vi.fn();
			render(DaydreamThread, { daydream: unnamed(), available: true, onnamed });

			await waitFor(() => expect(onnamed).toHaveBeenCalledWith('After the meeting'));
			expect(client.requestSuggestion).toHaveBeenCalledOnce();
			expect(client.requestSuggestion.mock.calls[0]?.[0]).toMatchObject({
				task: 'name',
				opening: 'Sit down. We have a lot to cover.',
				characters: ['Mara']
			});
			expect(client.saveSetup.mock.calls[0]?.[1]).toMatchObject({ title: 'After the meeting' });
		});

		it('leaves a daydream that has a name alone', async () => {
			render(DaydreamThread, {
				daydream: daydream([turn('t1', null, 'story', 'Sit down.')]),
				available: true
			});
			await waSettled(document.body);
			expect(client.requestSuggestion).not.toHaveBeenCalled();
		});

		it('waits for the opening before naming anything', async () => {
			const value = daydream();
			opened.set('d1', { ...SETUP, title: '' });
			render(DaydreamThread, { daydream: value, available: true });
			await waitFor(() => expect(client.writeReply).toHaveBeenCalled());
			expect(client.requestSuggestion).not.toHaveBeenCalled();
		});

		it('says nothing when no name comes back, and keeps the setup as it was', async () => {
			client.requestSuggestion.mockResolvedValue({ ok: false, error: 'No ideas just now.' });
			const { container } = render(DaydreamThread, { daydream: unnamed(), available: true });

			await waitFor(() => expect(client.requestSuggestion).toHaveBeenCalledOnce());
			await waSettled(container);
			expect(client.saveSetup).not.toHaveBeenCalled();
			expect(container.textContent).not.toContain('No ideas just now.');
		});
	});
});

describe('DaydreamThread in debug mode', () => {
	const Raw =
		'<reading>action</reading>\nMara looks up.\n\n<meta>\n```json\n{"suggestions": []}\n```\n</meta>';

	/** A reply that streams `raw` in, then ends: the stream as `writeReply` sees it. */
	function replyWith(raw: string, passage: string) {
		client.writeReply.mockImplementationOnce(
			(
				_id: string,
				_request: unknown,
				options: { onText: (soFar: ReplySoFar, raw: string) => void }
			) => {
				options.onText({ passage, expansion: null, reading: 'action' }, raw);
				return Promise.resolve({
					ok: true,
					passage,
					meta: meta(),
					expansion: null,
					reading: 'action',
					raw
				} satisfies ReplyOutcome);
			}
		);
	}

	afterEach(() => {
		localStorage.removeItem('daydreams.raw-log');
	});

	it('keeps the reply as it arrived on the passage, for an account granted debug mode', async () => {
		replyWith(Raw, 'Mara looks up.');
		render(DaydreamThread, { daydream: daydream(), available: true, keepRawReplies: true });
		await waitFor(() => expect(saved(0)?.role).toBe('story'));
		expect(saved(0)?.content).toMatchObject({ type: 'text', text: 'Mara looks up.', raw: Raw });
		expect(saved(0)?.content).not.toHaveProperty('rawTruncated');
	});

	it('keeps nothing raw for an account without it', async () => {
		replyWith(Raw, 'Mara looks up.');
		render(DaydreamThread, { daydream: daydream(), available: true });
		await waitFor(() => expect(saved(0)?.role).toBe('story'));
		expect(saved(0)?.content).not.toHaveProperty('raw');
	});

	it('keeps what had arrived when the reply is stopped', async () => {
		client.writeReply.mockImplementationOnce(
			(
				_id: string,
				_request: unknown,
				options: { signal: AbortSignal; onText: (soFar: ReplySoFar, raw: string) => void }
			) => {
				options.onText(
					{ passage: 'Mara half', expansion: null, reading: null },
					'<reading>action</reading>\nMara half<me'
				);
				return new Promise((_resolve, reject) => {
					options.signal.addEventListener('abort', () =>
						reject(new DOMException('stopped', 'AbortError'))
					);
				});
			}
		);
		const { container } = render(DaydreamThread, {
			daydream: daydream(),
			available: true,
			keepRawReplies: true
		});
		await waitFor(() => expect(container.textContent).toContain('Mara half'));
		await press(container, 'Stop writing');
		await waitFor(() => expect(saved(0)?.role).toBe('story'));
		expect(saved(0)?.content).toMatchObject({
			text: 'Mara half',
			raw: '<reading>action</reading>\nMara half<me'
		});
	});

	it('cuts a runaway reply, and says it did', () => {
		expect(rawReply('')).toEqual({});
		expect(rawReply('short')).toEqual({ raw: 'short' });
		const long = 'x'.repeat(DAYDREAM_LIMITS.rawReply + 10);
		expect(rawReply(long)).toEqual({
			raw: 'x'.repeat(DAYDREAM_LIMITS.rawReply),
			rawTruncated: true
		});
	});

	it('exports the whole story, every branch, opened, as a file', async () => {
		const blobs: Blob[] = [];
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
			blobs.push(blob as Blob);
			return 'blob:export';
		});
		const clicked = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => undefined);
		try {
			const { container } = render(DaydreamThread, {
				daydream: daydream(
					[
						turn('t1', null, 'story', { type: 'text', text: 'Sit.', raw: Raw }),
						turn('t2', 't1', 'user', 'I sit.')
					],
					't2'
				),
				available: true,
				debug: true
			});
			await press(container, 'Export');
			await waitFor(() => expect(blobs).toHaveLength(1));
			const exported = JSON.parse(await defined(blobs[0], 'the file').text());
			expect(exported).toMatchObject({
				format: 'bound-up-daydream-export',
				daydreamId: 'd1',
				branch: ['t1', 't2'],
				turns: [
					{ id: 't1', role: 'story', content: { text: 'Sit.', raw: Raw } },
					{ id: 't2', parentId: 't1', role: 'user', content: { text: 'I sit.' } }
				]
			});
			expect(exported.setup).toEqual(SETUP);
			expect(clicked).toHaveBeenCalled();
		} finally {
			createObjectURL.mockRestore();
			clicked.mockRestore();
		}
	});

	/** The prompt endpoint, answering by which passage it is asked about: the opening, or the reply after it. */
	function promptsBy(systems: { opening: string; reply: string }) {
		client.readPrompt.mockImplementation((_id: string, body: { mode: string }) =>
			Promise.resolve({
				ok: true,
				messages:
					body.mode === 'opening'
						? [
								{ role: 'system', content: systems.opening },
								{ role: 'user', content: '(Begin the story.)' }
							]
						: [
								{ role: 'system', content: systems.reply },
								{ role: 'user', content: '(Begin the story.)' },
								{ role: 'assistant', content: 'Sit.' },
								{ role: 'user', content: 'I sit.' }
							]
			})
		);
	}

	const twoPassages = () =>
		daydream([
			turn('t1', null, 'story', { type: 'text', text: 'Sit.', raw: Raw }),
			turn('t2', 't1', 'user', 'I sit.'),
			turn('t3', 't2', 'story', { type: 'text', text: 'Mara looks up.', meta: meta(), raw: Raw })
		]);

	it('shows what the model was sent before each passage, in the raw log', async () => {
		localStorage.setItem('daydreams.raw-log', '1');
		promptsBy({ opening: 'THE RULES', reply: 'THE RULES' });
		const { container } = render(DaydreamThread, {
			daydream: twoPassages(),
			available: true,
			debug: true
		});
		const sent = (id: string) => container.querySelector(`[data-sent-before="${id}"]`);
		await waitFor(() => expect(sent('t1')?.textContent).toContain('(Begin the story.)'));
		await waitFor(() => expect(sent('t3')?.querySelector('.message')?.textContent).toBe('I sit.'));
		// The system prompt once, at the top, and not again with each request
		// that sent the same one.
		const system = container.querySelector('[data-raw-system]');
		expect(system?.textContent).toContain('THE RULES');
		expect(container.querySelector('.turns')?.firstElementChild).toBe(system);
		expect(sent('t1')?.textContent).not.toContain('THE RULES');
		expect(sent('t3')?.textContent).not.toContain('THE RULES');
		// Before the passage it led to, and only before passages.
		expect(sent('t1')?.nextElementSibling?.getAttribute('data-turn-id')).toBe('t1');
		expect(container.querySelectorAll('[data-sent-before]')).toHaveLength(2);
	});

	it('shows a request’s own system prompt only when it sent a different one', async () => {
		localStorage.setItem('daydreams.raw-log', '1');
		promptsBy({ opening: 'CHECK IN', reply: 'THE RULES' });
		const { container } = render(DaydreamThread, {
			daydream: twoPassages(),
			available: true,
			debug: true
		});
		const sent = (id: string) => container.querySelector(`[data-sent-before="${id}"]`);
		// Its title is the disclosure's `summary`, not text in it.
		await waitFor(() => expect(sent('t1')?.querySelector('wa-details')).not.toBeNull());
		expect(sent('t1')?.querySelector('wa-details')?.textContent).toContain('CHECK IN');
		await waitFor(() => expect(sent('t3')?.textContent).toContain('I sit.'));
		expect(sent('t3')?.querySelector('wa-details')).toBeNull();
	});

	it('offers Export only while debug mode is on', async () => {
		const story = [turn('t1', null, 'story', 'Sit.')];
		const off = render(DaydreamThread, { daydream: daydream(story), available: true });
		await waSettled(off.container);
		expect(button(off.container, 'Export')).toBeUndefined();
	});

	it('offers the raw log only while debug mode is on', async () => {
		const story = [turn('t1', null, 'story', 'Sit.')];
		const off = render(DaydreamThread, { daydream: daydream(story), available: true });
		await waSettled(off.container);
		expect(off.container.querySelector('wa-switch.raw-log')).toBeNull();
		off.unmount();

		const on = render(DaydreamThread, { daydream: daydream(story), available: true, debug: true });
		await waitFor(() => expect(on.container.querySelector('wa-switch.raw-log')).not.toBeNull());
	});

	it('shows each turn raw: the reply as it arrived, what is stored, and the prompt on request', async () => {
		localStorage.setItem('daydreams.raw-log', '1');
		client.readPrompt.mockResolvedValue({
			ok: true,
			messages: [
				{ role: 'system', content: 'THE RULES' },
				{ role: 'user', content: 'I sit.' }
			]
		});
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', null, 'story', { type: 'text', text: 'Old passage.' }),
				turn('t2', 't1', 'user', 'I sit.'),
				turn('t3', 't2', 'story', { type: 'text', text: 'Mara looks up.', meta: meta(), raw: Raw })
			]),
			available: true,
			debug: true
		});

		await waitFor(() => expect(container.querySelectorAll('li.raw')).toHaveLength(3));
		const [old, said, passage] = [...container.querySelectorAll<HTMLElement>('li.raw')];
		expect(old?.textContent).toContain('Raw reply not recorded.');
		expect(said?.querySelector('wa-details pre')?.textContent).toContain('"I sit."');
		expect(passage?.querySelector('pre.reply')?.textContent).toBe(Raw);
		// The parsed view is gone while the log is on.
		expect(container.querySelector('li.passage')).toBeNull();

		await press(defined(passage, 'the passage'), 'Show prompt');
		await waitFor(() => expect(passage?.textContent).toContain('THE RULES'));
		expect(client.readPrompt).toHaveBeenCalledWith(
			'd1',
			expect.objectContaining({
				mode: 'reply',
				turns: [
					{ type: 'text', role: 'story', text: 'Old passage.', buttons: [] },
					{ type: 'text', role: 'user', text: 'I sit.' }
				]
			})
		);
	});

	it('shows a failed reply as it arrived, which is never saved', async () => {
		localStorage.setItem('daydreams.raw-log', '1');
		client.writeReply.mockResolvedValueOnce({
			ok: false,
			error: 'The reply stopped partway through. Try again.',
			partial: 'Mara',
			raw: '<reading>act'
		} satisfies ReplyOutcome);
		const { container } = render(DaydreamThread, {
			daydream: daydream(),
			available: true,
			debug: true
		});
		await waitFor(() =>
			expect(container.querySelector('pre.problem-raw')?.textContent).toBe('<reading>act')
		);
		expect(client.saveTurn).not.toHaveBeenCalled();
	});
});
