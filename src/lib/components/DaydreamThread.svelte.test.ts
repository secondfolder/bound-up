import { render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplyOutcome, SaveOutcome } from '$lib/daydream/client';
import type { DaydreamSetupContent } from '$lib/sealed-kinds/daydreams';
import { pending } from '$lib/testing/pending';
import { waSettled } from '$lib/testing/web-awesome';
import type { DaydreamTurnView, DaydreamView, SealedRefView } from '$lib/types';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

/** Whether this device can open the conversation; flipped by a test. */
const keyring = vi.hoisted(() => ({ status: 'unlocked' as string }));
vi.mock('$lib/crypto/session.svelte', () => ({
	currentKeyring: () =>
		keyring.status === 'unlocked' ? { status: 'unlocked', identity: 'secret' } : keyring,
	unlockedIdentity: () => null
}));

/**
 * What each sealed record opens to, by record id. The real openers are
 * covered by `sealed-cache.svelte.test.ts` and the frozen fixtures; here the
 * conversation is simply what the test says it is.
 */
const opened = vi.hoisted(() => new Map<string, unknown>());
vi.mock('$lib/sealed-views.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sealed-views.svelte')>()),
	openedDaydreamSetup: (sealed: SealedRefView) => opened.get(sealed.recordId),
	openedDaydreamTurn: (sealed: SealedRefView) => opened.get(sealed.recordId)
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

const writeReply =
	vi.fn<
		(
			id: string,
			request: { mode: string; turns: unknown[] },
			options: { signal: AbortSignal; onText: (soFar: string) => void }
		) => Promise<ReplyOutcome>
	>();
const saveTurn =
	vi.fn<(id: string, turn: { id: string; role: string; text: string }) => Promise<SaveOutcome>>();
const replaceTurn = vi.fn<() => Promise<SaveOutcome>>();
vi.mock('$lib/daydream/client', () => ({ writeReply, saveTurn, replaceTurn }));

const { default: DaydreamThread } = await import('./DaydreamThread.svelte');

const SETUP: DaydreamSetupContent = {
	title: 'Late meeting',
	characterName: 'Mara',
	persona: '',
	lead: 'character',
	scenario: 'The office has emptied out.',
	tone: '',
	limits: '',
	safeword: 'pineapple'
};

function ref(recordId: string): SealedRefView {
	return { recordId, vaultId: 'v', ciphertext: 'sb1.x', payloadVersion: 1 };
}

function turn(id: string, role: 'user' | 'character', position: number, text: string) {
	opened.set(id, { text });
	return { id, role, position, revision: 0, sealed: ref(id) } satisfies DaydreamTurnView;
}

function daydream(turns: DaydreamTurnView[] = []): DaydreamView {
	opened.set('d1', SETUP);
	return { id: 'd1', revision: 0, setup: ref('d1'), turns };
}

/** What `saveTurn` answers by default: saved, at the next position. */
function savesAt(position: number) {
	saveTurn.mockImplementationOnce((_id, saved) => {
		opened.set(saved.id, { text: saved.text });
		return Promise.resolve({
			ok: true,
			turn: {
				id: saved.id,
				role: saved.role as 'user' | 'character',
				position,
				revision: 0,
				sealed: ref(saved.id)
			}
		});
	});
}

function waButtonWithText(container: HTMLElement, text: string): HTMLElement | undefined {
	return [...container.querySelectorAll<HTMLElement>('wa-button')].find((button) =>
		button.textContent?.includes(text)
	);
}

beforeEach(() => {
	keyring.status = 'unlocked';
	opened.clear();
	draftText.value = '';
	writeReply.mockReset();
	saveTurn.mockReset();
	replaceTurn.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('DaydreamThread', () => {
	it('shows only a placeholder while the device cannot open the conversation', () => {
		keyring.status = 'locked';
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', 'character', 0, 'Sit down.')]),
			available: true
		});
		expect(container.textContent).not.toContain('Sit down.');
		expect(container.textContent).toContain('…');
		expect(writeReply).not.toHaveBeenCalled();
	});

	it('shows the conversation, naming the character on their turns', () => {
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', 'character', 0, 'Sit down.'),
				turn('t2', 'user', 1, 'I sit.')
			]),
			available: true
		});
		expect(container.querySelector('li.character')?.textContent).toContain('Mara');
		expect(container.querySelector('li.character')?.textContent).toContain('Sit down.');
		expect(container.querySelector('li.user')?.textContent).toContain('I sit.');
		expect(writeReply).not.toHaveBeenCalled();
	});

	it('opens a new daydream by itself, showing the reply as it arrives, then saves it', async () => {
		let finish: (outcome: ReplyOutcome) => void = () => undefined;
		writeReply.mockImplementationOnce(
			(_id, _request, options) =>
				new Promise((resolve) => {
					options.onText('Mara looks');
					finish = resolve;
				})
		);
		savesAt(0);
		const { container } = render(DaydreamThread, { daydream: daydream(), available: true });

		await waitFor(() =>
			expect(container.querySelector('li.streaming')?.textContent).toContain('Mara looks')
		);
		expect(writeReply.mock.calls[0]?.[1]).toMatchObject({ mode: 'opening', turns: [] });

		finish({ ok: true, text: 'Mara looks up.' });
		await waitFor(() => expect(saveTurn).toHaveBeenCalledOnce());
		expect(saveTurn.mock.calls[0]?.[1]).toMatchObject({
			role: 'character',
			text: 'Mara looks up.'
		});
		await waitFor(() => expect(container.querySelector('li.streaming')).toBeNull());
		expect(container.querySelector('li.character')?.textContent).toContain('Mara looks up.');
	});

	it('does not ask for an opening on a server that cannot write one', () => {
		render(DaydreamThread, { daydream: daydream(), available: false });
		expect(writeReply).not.toHaveBeenCalled();
	});

	it('stops a reply when asked, keeping what had arrived', async () => {
		let signal: AbortSignal | undefined;
		writeReply.mockImplementationOnce((_id, _request, options) => {
			({ signal } = options);
			options.onText('Mara be');
			return new Promise((_resolve, reject) => {
				options.signal.addEventListener('abort', () =>
					reject(new DOMException('stopped', 'AbortError'))
				);
			});
		});
		savesAt(0);
		const { container } = render(DaydreamThread, { daydream: daydream(), available: true });

		await waitFor(() => expect(waButtonWithText(container, 'Stop')).toBeDefined());
		await waSettled(container);
		waButtonWithText(container, 'Stop')?.click();

		await waitFor(() => expect(signal?.aborted).toBe(true));
		await waitFor(() => expect(saveTurn).toHaveBeenCalledOnce());
		expect(saveTurn.mock.calls[0]?.[1]).toMatchObject({ role: 'character', text: 'Mara be' });
	});

	it('says when a reply fails, and tries again on request', async () => {
		writeReply.mockResolvedValueOnce({
			ok: false,
			error: 'The reply could not be written.',
			partial: ''
		});
		const { container } = render(DaydreamThread, { daydream: daydream(), available: true });

		await waitFor(() => expect(container.textContent).toContain('The reply could not be written.'));
		expect(saveTurn).not.toHaveBeenCalled();

		writeReply.mockImplementationOnce(() => pending());
		await waSettled(container);
		waButtonWithText(container, 'Try again')?.click();
		await waitFor(() => expect(writeReply).toHaveBeenCalledTimes(2));
	});

	it('saves what the user sends before asking for the reply to it', async () => {
		draftText.value = 'I sit down.';
		writeReply.mockImplementation(() => pending());
		savesAt(1);
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', 'character', 0, 'Sit.')]),
			available: true
		});

		await waitFor(() => expect(waButtonWithText(container, 'Send')).toBeDefined());
		await waSettled(container);
		waButtonWithText(container, 'Send')?.click();

		await waitFor(() => expect(writeReply).toHaveBeenCalledOnce());
		expect(saveTurn.mock.calls[0]?.[1]).toMatchObject({ role: 'user', text: 'I sit down.' });
		// The reply is asked for with the whole conversation, the new turn included.
		expect(writeReply.mock.calls[0]?.[1]).toMatchObject({
			mode: 'reply',
			turns: [
				{ role: 'character', text: 'Sit.' },
				{ role: 'user', text: 'I sit down.' }
			]
		});
	});

	it('sends a turn written while a reply is still arriving once that reply is saved', async () => {
		draftText.value = 'I was already typing.';
		let finish: (outcome: ReplyOutcome) => void = () => undefined;
		writeReply.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		writeReply.mockImplementation(() => pending());
		savesAt(0);
		savesAt(1);
		const { container } = render(DaydreamThread, { daydream: daydream(), available: true });

		await waitFor(() => expect(waButtonWithText(container, 'Send')).toBeDefined());
		await waSettled(container);
		waButtonWithText(container, 'Send')?.click();
		// Nothing of the user's is saved while the opening is still arriving.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(saveTurn).not.toHaveBeenCalled();

		finish({ ok: true, text: 'The opening.' });
		await waitFor(() => expect(saveTurn).toHaveBeenCalledTimes(2));
		expect(saveTurn.mock.calls.map(([, saved]) => saved.role)).toEqual(['character', 'user']);
		await waitFor(() => expect(writeReply).toHaveBeenCalledTimes(2));
		expect(writeReply.mock.calls[1]?.[1]).toMatchObject({
			turns: [
				{ role: 'character', text: 'The opening.' },
				{ role: 'user', text: 'I was already typing.' }
			]
		});
	});

	it('keeps what the user wrote when it cannot be saved, and asks for no reply', async () => {
		draftText.value = 'I sit down.';
		saveTurn.mockResolvedValueOnce({
			ok: false,
			error: 'Something changed since this page loaded.'
		});
		const { container } = render(DaydreamThread, {
			daydream: daydream([turn('t1', 'character', 0, 'Sit.')]),
			available: true
		});

		await waitFor(() => expect(waButtonWithText(container, 'Send')).toBeDefined());
		await waSettled(container);
		waButtonWithText(container, 'Send')?.click();

		await waitFor(() =>
			expect(container.textContent).toContain('Something changed since this page loaded.')
		);
		expect(writeReply).not.toHaveBeenCalled();
		expect(container.querySelector('[contenteditable]')?.textContent).toContain('I sit down.');
	});

	it('writes the newest reply again in its place', async () => {
		replaceTurn.mockResolvedValueOnce({
			ok: true,
			turn: { ...turn('t2', 'character', 1, 'Second take.'), revision: 1 }
		});
		writeReply.mockResolvedValueOnce({ ok: true, text: 'Second take.' });
		const { container } = render(DaydreamThread, {
			daydream: daydream([
				turn('t1', 'user', 0, 'Hello.'),
				turn('t2', 'character', 1, 'First take.')
			]),
			available: true
		});

		await waSettled(container);
		waButtonWithText(container, 'Write this reply again')?.click();

		await waitFor(() => expect(replaceTurn).toHaveBeenCalledOnce());
		// Answering the conversation before the reply being replaced.
		expect(writeReply.mock.calls[0]?.[1]).toMatchObject({
			mode: 'reply',
			turns: [{ role: 'user', text: 'Hello.' }]
		});
		await waitFor(() => expect(container.textContent).toContain('Second take.'));
		expect(container.querySelectorAll('li.character')).toHaveLength(1);
	});
});
