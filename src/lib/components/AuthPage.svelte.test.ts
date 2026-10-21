import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: AuthPage } = await import('./AuthPage.svelte');

const children = createRawSnippet(() => ({ render: () => '<p>Body</p>' }));

describe('AuthPage', () => {
	it('titles the page and leads back to the landing page', () => {
		render(AuthPage, { title: 'Log in', children });
		expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Back to Bound Up' })).toHaveAttribute('href', '/');
		expect(screen.getByText('Body')).toBeInTheDocument();
	});

	it('is one column width, so pages built on it share both edges', () => {
		const { container: narrow } = render(AuthPage, { title: 'Log in', children });
		const { container: other } = render(AuthPage, { title: 'Check your email', children });
		const width = (container: HTMLElement) =>
			container.querySelector('.auth-page')?.getBoundingClientRect().width;
		expect(width(narrow)).toBeGreaterThan(0);
		expect(width(narrow)).toBe(width(other));
	});
});
