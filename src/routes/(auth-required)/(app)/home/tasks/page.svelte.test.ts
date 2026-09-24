import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import type { PageData } from './$types';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: Page } = await import('./+page.svelte');

function data(partnerTasks: PageData['partnerTasks'] = []): PageData {
	return {
		user: {
			id: 'u1',
			name: 'Ada',
			email: 'ada@example.com',
			image: null,
			timezone: 'Europe/London'
		},
		partners: [{ id: 'p1', name: 'Jun', image: null }],
		helpRequests: [],
		selfTasks: {
			tasks: [],
			completions: [
				{
					id: 'c1',
					taskTitle: 'Nap',
					taskDescription: null,
					creditsAwarded: 2,
					completionMessage: 'Done',
					createdAt: new Date()
				}
			]
		},
		partnerTasks
	} as PageData;
}

describe('/home/tasks/+page.svelte', () => {
	it('shows self task actions directly when there are no partner task sections', () => {
		const { container } = render(Page, { data: data() });
		const buttons = Array.from(container.querySelectorAll('wa-button')).map((node) =>
			node.textContent?.trim()
		);
		expect(buttons).toContain('Add a task');
		expect(buttons).toContain('Completion History');
		expect(container.textContent).not.toContain('Your Recent Task Completions');
		expect(container.querySelectorAll('.panel')).toHaveLength(0);
	});

	it('wraps sections in panels once partner task sections exist', () => {
		const { container } = render(Page, {
			data: data([{ partnershipId: 'p1', name: 'Jun', image: null, tasks: [] }])
		});
		expect(container.textContent).toContain("Jun's Tasks");
		expect(container.textContent).toContain('Open full task list');
		expect(container.querySelectorAll('.panel')).toHaveLength(2);
	});
});
