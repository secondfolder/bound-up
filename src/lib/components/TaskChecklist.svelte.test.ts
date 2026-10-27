import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { TaskEntry, TaskListMode } from '$lib/task-list';
import { defined } from '$lib/testing/defined';
import { testPartnershipTaskView, testSelfTaskView } from '$lib/testing/item-views';
import { waProp, waSettled } from '$lib/testing/web-awesome';

// Titles and names are sealed; these open them by record id (sealed-refs.ts).
vi.mock('$lib/crypto/sealed', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/sealed')>()),
	openRecord: (await import('$lib/testing/sealed-refs')).openTestRecord
}));
vi.mock('$lib/crypto/vaults.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/vaults.svelte')>()),
	vaultById: (id: string) => ({ id })
}));

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

/**
 * A completion that is submitted and never answered: enough for the list to
 * see which task was ticked (`ItemAction.pending`), which is what places the
 * undo line, without a SvelteKit runtime to post to. The answer is then
 * played by re-rendering with the reloaded list and the `completion` prop.
 */
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit?: (input: unknown) => unknown) => {
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			submit?.({ cancel: () => undefined, formElement: form, formData: new FormData(form) });
		});
	},
	// The task sheet's ticks read an action result with it (`description-ticks.ts`).
	// A browser refuses to link a module missing a named import, so it has to be
	// here even though nothing in this file ticks one.
	deserialize: () => ({ type: 'error', error: undefined })
}));

const { default: TaskChecklist } = await import('./TaskChecklist.svelte');

const threeAWeek = {
	mode: 'rolling-window',
	limit: { completions: 3, every: 1, unit: 'week' }
} as const;

async function renderList(entries: TaskEntry[], mode: TaskListMode = 'to-do') {
	const view = render(TaskChecklist, {
		entries,
		mode,
		partnerName: 'Jun',
		emptyMessage: 'Nothing here.'
	});
	await waSettled(view.container);
	return view;
}

async function openDetail(container: HTMLElement, title: string) {
	const body = defined(
		Array.from(container.querySelectorAll<HTMLButtonElement>('button.open')).find((button) =>
			button.textContent?.includes(title)
		),
		`the row for ${title}`
	);
	body.click();
	await tick();
	await waSettled(document.body);
	return defined(document.querySelector('wa-dialog'), 'the detail dialog');
}

describe('TaskChecklist', () => {
	it('says so when there is nothing', async () => {
		const { container } = await renderList([]);
		expect(container).toHaveTextContent('Nothing here.');
	});

	it('gives a task that can be done a circle named for it, and its award at the end', async () => {
		const { container } = await renderList([
			{ task: testSelfTaskView({ title: 'Stretch', creditsAwarded: 3 }), completeAction: '?/done' }
		]);
		const circle = defined(container.querySelector('button.tick'), 'the circle');
		expect(circle).toHaveAccessibleName('Complete Stretch');
		expect(circle.closest('form')?.getAttribute('action')).toBe('?/done');
		expect(container.querySelector('.award')).toHaveTextContent('+3 credits');
	});

	it('posts only the task, and says whose space it is in on a list of several', async () => {
		const { container } = await renderList([
			{
				task: testSelfTaskView({ title: 'Make tea' }),
				completeAction: '?/complete',
				space: { id: 'space-own', kind: 'solo', colour: 'me', names: null }
			}
		]);
		const form = defined(container.querySelector('form'), 'the completion form');
		// The task carries its own space: nothing else is posted, and the
		// context never decides where a completion goes.
		expect([...new FormData(form).keys()]).toEqual(['taskId']);
		expect(container.querySelector('.chip')).toHaveTextContent('Me');
	});

	it('shows a task that opens later with a clock and when, and no circle', async () => {
		const { container } = await renderList([
			{
				task: testSelfTaskView({
					title: 'Journal',
					canComplete: false,
					nextEligibleAt: new Date(Date.now() + 30 * 60 * 1000)
				}),
				completeAction: '?/done'
			}
		]);
		expect(container.querySelector('button.tick')).toBeNull();
		expect(container.querySelector('.waiting wa-icon')).not.toBeNull();
		expect(container.querySelector('.when')).toHaveTextContent(/in \d+ minutes/);
	});

	it("says what is left of a window's quota", async () => {
		const { container } = await renderList([
			{
				task: testSelfTaskView({ title: 'Walk', schedule: threeAWeek, windowCompletions: 2 }),
				completeAction: '?/done'
			}
		]);
		expect(container).toHaveTextContent('3× a week');
		expect(container).toHaveTextContent('1 left');
	});

	it('shows nothing to tick for a task you set, only how far along it is', async () => {
		const { container } = await renderList(
			[
				{
					task: testPartnershipTaskView({
						title: 'Stretch',
						createdByMe: true,
						canComplete: false,
						schedule: threeAWeek,
						windowCompletions: 1
					}),
					completeAction: null
				}
			],
			'set'
		);
		// Not theirs to complete, so no circle, and no column standing empty for one.
		expect(container.querySelector('button.tick')).toBeNull();
		expect(container.querySelector('.item-row .leading')).toBeNull();
		expect(container.querySelector('.item-row')).not.toHaveClass('has-leading');
		expect(container).toHaveTextContent('1 of 3 this week');
		// One list, unheaded: the page's tab says whose these are.
		expect(container.querySelector('h3')).toBeNull();
	});

	it('opens a task in a dialog with its whole schedule and a way to complete and edit it', async () => {
		const { container, unmount } = await renderList([
			{
				task: testSelfTaskView({ title: 'Walk', schedule: threeAWeek, windowCompletions: 1 }),
				completeAction: '?/done',
				editHref: '/tasks/t1'
			}
		]);
		const dialog = await openDetail(container, 'Walk');
		expect(waProp(dialog, 'label')).toBe('Walk');
		expect(dialog).toHaveTextContent('Repeats Anytime, up to 3 times a week');
		expect(dialog).toHaveTextContent('This week 1 of 3');
		// The thing to do first, as the design had it.
		const buttons = Array.from(dialog.querySelectorAll('[slot="footer"] wa-button'));
		expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Complete · +2', 'Edit']);
		unmount();
	});

	it('offers no Complete in the dialog of a task you set', async () => {
		const { container, unmount } = await renderList(
			[
				{
					task: testPartnershipTaskView({
						title: 'Stretch',
						createdByMe: true,
						canComplete: false
					}),
					completeAction: null,
					editHref: '/partner/p1/tasks/t1'
				}
			],
			'set'
		);
		const dialog = await openDetail(container, 'Stretch');
		const buttons = Array.from(dialog.querySelectorAll('[slot="footer"] wa-button'));
		expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Edit']);
		unmount();
	});

	it('greys a task that is not due yet, which cannot be completed before then', async () => {
		const { container } = await renderList([
			{
				task: testSelfTaskView({
					title: 'Journal',
					canComplete: false,
					nextEligibleAt: new Date(Date.now() + 26 * 60 * 60 * 1000)
				}),
				completeAction: '?/done'
			},
			{ task: testSelfTaskView({ title: 'Walk' }), completeAction: '?/done' }
		]);
		const [later, ready] = ['Journal', 'Walk'].map((title) =>
			Array.from(container.querySelectorAll('.item-row')).find((row) =>
				row.textContent?.includes(title)
			)
		);
		expect(later).toHaveClass('quiet');
		expect(ready).not.toHaveClass('quiet');
		// When, with a clock, in informal time and no "Opens".
		expect(later?.querySelector('.when')).toHaveTextContent(
			/^(?:Tomorrow|\w{3}) \d{1,2}(?::\d{2})?(?:am|pm)$/
		);
		expect(later?.querySelector('.when wa-icon')).not.toBeNull();
	});

	it('marks the schedule with the icon the design gave it', async () => {
		const { container } = await renderList([
			{ task: testSelfTaskView({ title: 'Walk', schedule: threeAWeek }), completeAction: '?/done' },
			{
				task: testSelfTaskView({
					title: 'Journal',
					schedule: {
						mode: 'scheduled',
						anchorLocal: '2026-10-01T09:00',
						frequency: 'day',
						interval: 1,
						end: { kind: 'never' }
					}
				}),
				completeAction: '?/done'
			},
			{ task: testSelfTaskView({ title: 'Once' }), completeAction: '?/done' }
		]);
		const iconOf = (title: string) =>
			waProp(
				Array.from(container.querySelectorAll('.item-row'))
					.find((row) => row.textContent?.includes(title))
					?.querySelector('.piece wa-icon'),
				'name'
			);
		expect(iconOf('Walk')).toBe('repeat');
		expect(iconOf('Journal')).toBe('calendar');
		expect(iconOf('Once')).toBeUndefined();
	});

	it("says whose time a task runs in, by the partner's name", async () => {
		const { container } = await renderList([
			{
				task: testPartnershipTaskView({
					title: 'Make tea',
					timeZoneNote: {
						timeZone: 'Asia/Tokyo',
						referenceTimeZone: 'UTC',
						date: new Date(),
						showCurrentTime: false
					}
				}),
				completeAction: '?/done'
			}
		]);
		expect(container.querySelector('.whose-time')).toHaveTextContent("Jun's time");
	});

	it('lights the row whose detail is open', async () => {
		const { container, unmount } = await renderList([
			{ task: testSelfTaskView({ title: 'Walk' }), completeAction: '?/done' }
		]);
		const row = container.querySelector('.item-row');
		expect(row).not.toHaveClass('selected');
		await openDetail(container, 'Walk');
		expect(row).toHaveClass('selected');
		unmount();
	});

	describe('the undo line', () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		const stretch = testSelfTaskView({ id: 'stretch', title: 'Stretch', creditsAwarded: 2 });
		const walk = testSelfTaskView({ id: 'walk', title: 'Walk' });
		const entry = (task: TaskEntry['task']): TaskEntry => ({
			task,
			completeAction: '?/done',
			undoAction: '?/undo'
		});
		const completion = { id: '9d7f1a52-6c39-4c39-9a51-0d9e0a7f2a10', taskId: 'stretch' };

		/** Ticks Stretch, then plays the answer: Stretch done and inactive, and its completion. */
		async function tickStretch() {
			const view = render(TaskChecklist, {
				entries: [entry(stretch), entry(walk)],
				mode: 'to-do',
				emptyMessage: 'Nothing here.'
			});
			await waSettled(view.container);
			defined(
				view.container.querySelector<HTMLButtonElement>('button[aria-label="Complete Stretch"]'),
				'the circle'
			).click();
			await tick();
			await view.rerender({
				entries: [entry({ ...stretch, active: false, canComplete: false }), entry(walk)],
				completion
			});
			await waSettled(view.container);
			return view;
		}

		const groupTitled = (container: HTMLElement, title: string) =>
			Array.from(container.querySelectorAll('.item-group')).find((group) =>
				group.querySelector('h3, .summary')?.textContent?.includes(title)
			);

		it("takes the ticked task's place, where it was tapped, with an Undo", async () => {
			const { container } = await tickStretch();
			const ready = defined(groupTitled(container, 'Ready'), 'the Ready group');
			const [first, second] = Array.from(ready.querySelectorAll('li'));
			expect(first).toHaveTextContent('Stretch');
			expect(first).toHaveTextContent('Completed · +2');
			expect(second).toHaveTextContent('Walk');

			const form = defined(first?.querySelector('form'), 'the undo form');
			expect(form.getAttribute('action')).toBe('?/undo');
			expect(new FormData(form).get('completionId')).toBe(completion.id);
			expect(form.querySelector('wa-button')).toHaveTextContent('Undo');
			// It said so to a screen reader too.
			expect(container.querySelector('[role="status"]')).toHaveTextContent('Task completed.');
			// Not in two places at once: the inactive one waits until the line goes.
			expect(groupTitled(container, 'Inactive')).toBeUndefined();
		});

		it('gives the task back its own line once the completion is undone', async () => {
			const { container, rerender } = await tickStretch();
			await rerender({ entries: [entry(stretch), entry(walk)], completion: null });
			await waSettled(container);
			expect(container.querySelector('button[aria-label="Complete Stretch"]')).not.toBeNull();
			expect(container).not.toHaveTextContent('Completed');
		});

		it('stays in place even when the reloaded list no longer has the task at all', async () => {
			const { container, rerender } = await tickStretch();
			await rerender({ entries: [entry(walk)], completion });
			await waSettled(container);
			expect(groupTitled(container, 'Ready')?.querySelector('li')).toHaveTextContent(
				'Completed · +2'
			);
		});

		it('goes after a few seconds, but not while it is pointed at', async () => {
			const { container } = await tickStretch();
			vi.useFakeTimers();
			const line = defined(
				Array.from(container.querySelectorAll('li')).find((li) =>
					li.textContent?.includes('Completed')
				),
				'the undo line'
			);
			line.dispatchEvent(new PointerEvent('pointerenter'));
			await tick();
			vi.advanceTimersByTime(30_000);
			await tick();
			expect(container).toHaveTextContent('Completed');

			line.dispatchEvent(new PointerEvent('pointerleave'));
			await tick();
			vi.advanceTimersByTime(10_000);
			await tick();
			expect(container).not.toHaveTextContent('Completed');
			// And the task is where the reload put it.
			expect(groupTitled(container, 'Inactive')).toBeDefined();
		});
	});
});
