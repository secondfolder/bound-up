import { render, screen, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { describe, expect, it } from 'vitest';
import { taskEditorFormSchema } from '$lib/schemas/taskEditorForm';
import { type TaskEditorFormValues, taskEditorFormValuesForCreate } from '$lib/task-editor-form';
import { waButtonOfType, waProp, waSettled, waType } from '$lib/testing/web-awesome';

const { default: TaskFormHarness } = await import('$lib/testing/TaskFormHarness.svelte');

function editValues(): TaskEditorFormValues {
	return {
		...taskEditorFormValuesForCreate('u1'),
		title: 'Long shower',
		description: 'Take your time',
		creditsAwarded: '2',
		completionMessagesText: 'Nicely done'
	};
}

describe('TaskForm', () => {
	it('starts outlined on a fresh add form and becomes solid once edited', async () => {
		const data = await superValidate(
			taskEditorFormValuesForCreate('u1'),
			zod4(taskEditorFormSchema),
			{
				errors: false
			}
		);
		const { container } = render(TaskFormHarness, {
			data,
			submitLabel: 'Add task'
		});
		const save = waButtonOfType(container, 'submit');

		expect(waProp(save, 'appearance')).toBe('outlined');
		expect(waProp(save, 'variant')).toBe('neutral');

		await waType(container, 'title', 'Long shower');

		await waitFor(() => {
			expect(waProp(save, 'appearance')).toBe('accent');
			expect(waProp(save, 'variant')).toBe('brand');
		});
	});

	it('says what each Every box counts, and where its period is counted from', async () => {
		const shownFor = async (values: Partial<TaskEditorFormValues>, field: string) => {
			const data = await superValidate(
				{ ...taskEditorFormValuesForCreate('u1'), ...values },
				zod4(taskEditorFormSchema),
				{ errors: false }
			);
			const { container, unmount } = render(TaskFormHarness, { data, submitLabel: 'Add task' });
			await waSettled(container);
			const input = container.querySelector(`wa-input[name="${field}"]`);
			const shown = {
				label: waProp(input, 'label'),
				placeholder: waProp(input, 'placeholder'),
				hint: container.querySelector('.mode-hint')?.textContent
			};
			unmount();
			return shown;
		};

		await expect(
			shownFor({ scheduleMode: 'scheduled', scheduledFrequency: 'month' }, 'scheduledInterval')
		).resolves.toEqual({
			label: 'Repeat every this many months',
			placeholder: 'Number of months',
			hint: expect.stringContaining('fixed calendar from the start time')
		});
		await expect(
			shownFor({ scheduleMode: 'after-completion', afterUnit: 'day' }, 'afterEvery')
		).resolves.toEqual({
			label: 'Repeat after this many days',
			placeholder: 'Number of days',
			hint: expect.stringContaining('from when it was last marked complete')
		});
		await expect(
			shownFor(
				{ scheduleMode: 'rolling-window', rollingLimitEnabled: true, rollingLimitUnit: 'hour' },
				'rollingLimitEvery'
			)
		).resolves.toEqual({
			label: 'Within this many hours',
			placeholder: 'Number of hours',
			hint: expect.stringContaining('the period rolls')
		});
	});

	it('starts outlined on an edit form and stays outlined until something changes', async () => {
		const data = await superValidate(editValues(), zod4(taskEditorFormSchema), { errors: false });
		const { container } = render(TaskFormHarness, {
			data,
			submitLabel: 'Save task'
		});
		const save = waButtonOfType(container, 'submit');

		expect(waProp(save, 'appearance')).toBe('outlined');
		expect(waProp(save, 'variant')).toBe('neutral');

		await waType(container, 'title', '');

		await waitFor(() => {
			expect(waProp(save, 'appearance')).toBe('outlined');
			expect(waProp(save, 'variant')).toBe('neutral');
		});

		await waType(container, 'title', 'Long shower deluxe');

		await waitFor(() => {
			expect(waProp(save, 'appearance')).toBe('accent');
			expect(waProp(save, 'variant')).toBe('brand');
		});
	});

	it('shows the weekly Days validation error as text', async () => {
		const data = await superValidate(
			{
				...taskEditorFormValuesForCreate('u1'),
				title: 'Stretch',
				scheduleMode: 'scheduled',
				scheduledFrequency: 'week',
				scheduledAnchorLocal: '2026-09-14T10:00',
				scheduledWeekdays: []
			},
			zod4(taskEditorFormSchema)
		);

		render(TaskFormHarness, {
			data,
			submitLabel: 'Add task'
		});

		expect(screen.getByText('Choose at least one day')).toBeInTheDocument();
		expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
	});

	it('posts every field through the shared field components', async () => {
		const data = await superValidate(editValues(), zod4(taskEditorFormSchema), { errors: false });
		const { container } = render(TaskFormHarness, { data, submitLabel: 'Save task' });
		await waSettled(container);
		await waType(container, 'creditsAwarded', '5');
		await waType(container, 'completionMessagesText', 'Good\nVery good');
		await waSettled(container);

		const form = container.querySelector('form');
		if (!form) {
			throw new Error('missing form');
		}
		// The Web Awesome fields are form-associated: what they hold is what the
		// form posts, from the same FormData the action reads.
		const posted = new FormData(form);
		expect(posted.get('title')).toBe('Long shower');
		expect(posted.get('creditsAwarded')).toBe('5');
		expect(posted.get('completionMessagesText')).toBe('Good\nVery good');
		expect(posted.get('scheduleMode')).toBe('one-off');
		expect(posted.get('active')).toBe('on');
		// No native field is left behind: the text fields are wa-input/-textarea.
		expect(container.querySelector('input[name="title"], textarea, select')).toBeNull();
	});

	it('shows the fields of the repeat mode chosen from the select', async () => {
		const data = await superValidate(editValues(), zod4(taskEditorFormSchema), { errors: false });
		const { container } = render(TaskFormHarness, { data, submitLabel: 'Save task' });
		await waSettled(container);
		expect(container.querySelector('wa-input[name="afterEvery"]')).toBeNull();

		const mode = container.querySelector('wa-select[name="scheduleMode"]') as
			| (HTMLElement & { value?: string })
			| null;
		if (!mode) {
			throw new Error('missing mode select');
		}
		// A choice reaches the field as `wa-select` reports it: its value, then
		// a change on the host.
		mode.value = 'after-completion';
		mode.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

		await waitFor(() => {
			expect(container.querySelector('wa-input[name="afterEvery"]')).not.toBeNull();
			expect(container.querySelector('wa-select[name="afterUnit"]')).not.toBeNull();
		});
		const save = waButtonOfType(container, 'submit');
		await waitFor(() => expect(waProp(save, 'appearance')).toBe('accent'));
	});

	it('turns a task off from its checkbox', async () => {
		const data = await superValidate(editValues(), zod4(taskEditorFormSchema), { errors: false });
		const { container } = render(TaskFormHarness, { data, submitLabel: 'Save task' });
		await waSettled(container);
		const active = container.querySelector('wa-checkbox[name="active"]') as
			| (HTMLElement & { checked?: boolean })
			| null;
		if (!active) {
			throw new Error('missing active checkbox');
		}
		expect(active.checked).toBe(true);
		active.checked = false;
		active.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
		await waSettled(container);

		const form = container.querySelector('form');
		expect(form && new FormData(form).has('active')).toBe(false);
		const save = waButtonOfType(container, 'submit');
		await waitFor(() => expect(waProp(save, 'appearance')).toBe('accent'));
	});

	it('does not require a completion message', async () => {
		const data = await superValidate(editValues(), zod4(taskEditorFormSchema), { errors: false });
		const { container } = render(TaskFormHarness, { data, submitLabel: 'Save task' });
		await waSettled(container);
		const messages = container.querySelector('wa-textarea[name="completionMessagesText"]');
		expect(waProp(messages, 'required')).toBe(false);
	});
});
