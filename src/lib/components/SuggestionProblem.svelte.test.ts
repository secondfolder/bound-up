import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { waSettled } from '$lib/testing/web-awesome';
import SuggestionProblem from './SuggestionProblem.svelte';

const problem = {
	error: 'No ideas came back that time. Try again.',
	detail: 'The reply was not JSON:\nSorry'
};

describe('SuggestionProblem', () => {
	it('says only why, out of debug mode', async () => {
		const { container, getByRole } = render(SuggestionProblem, { problem });
		await waSettled(container);
		expect(getByRole('alert').textContent).toBe(problem.error);
		expect(container.textContent).not.toContain('Sorry');
	});

	it('shows what came back in debug mode, when there is something to show', async () => {
		const shown = render(SuggestionProblem, { problem, debug: true });
		await waSettled(shown.container);
		expect(shown.container.querySelector('pre')?.textContent).toBe(problem.detail);
		shown.unmount();

		const bare = render(SuggestionProblem, { problem: { error: problem.error }, debug: true });
		await waSettled(bare.container);
		expect(bare.container.querySelector('wa-details')).toBeNull();
	});

	it('shows the links it read, in debug mode only', async () => {
		const withFetches = {
			...problem,
			fetches: [
				{
					url: 'https://example.invalid/x',
					read: false,
					httpStatus: null,
					title: '',
					error: 'Extract failed: connect_error',
					length: 0,
					excerpt: ''
				}
			]
		};
		const shown = render(SuggestionProblem, { problem: withFetches, debug: true });
		await waSettled(shown.container);
		expect(shown.container.textContent).toContain('Extract failed: connect_error');
		shown.unmount();

		const hidden = render(SuggestionProblem, { problem: withFetches });
		await waSettled(hidden.container);
		expect(hidden.container.textContent).not.toContain('example.invalid');
	});
});
