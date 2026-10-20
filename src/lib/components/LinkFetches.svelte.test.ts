import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { LinkFetch } from '$lib/daydream/suggestions';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import LinkFetches from './LinkFetches.svelte';

const fetches: LinkFetch[] = [
	{
		url: 'https://www.reddit.com/r/Example/',
		read: true,
		httpStatus: 200,
		title: 'r/Example',
		error: '',
		length: 17_748,
		excerpt: 'A place for examples'
	},
	{
		url: 'https://example.invalid/x',
		read: false,
		httpStatus: null,
		title: '',
		error: 'Extract failed: connect_error',
		length: 0,
		excerpt: ''
	}
];

describe('LinkFetches', () => {
	it('says how many links were read, and for each what came back or why not', async () => {
		const { container } = render(LinkFetches, { fetches });
		await waSettled(container);
		expect(waProp(container.querySelector('wa-details'), 'summary')).toBe('Links read: 1 of 2');
		const items = [...container.querySelectorAll('li')];
		expect(items).toHaveLength(2);
		expect(items[0]?.textContent).toContain('https://www.reddit.com/r/Example/');
		expect(items[0]?.textContent).toContain('HTTP 200');
		expect(items[0]?.textContent).toContain('17,748');
		expect(items[0]?.querySelector('pre')?.textContent).toBe('A place for examples\n… (cut)');
		expect(items[1]?.textContent).toContain('Not read: Extract failed: connect_error');
		expect(items[1]?.querySelector('pre')).toBeNull();
		// Shown, never linked.
		expect(container.querySelector('a')).toBeNull();
	});
});
