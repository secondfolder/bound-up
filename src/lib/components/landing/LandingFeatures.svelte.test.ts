import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: LandingFeatures } = await import('./LandingFeatures.svelte');

describe('LandingFeatures', () => {
	it('gives each major feature a heading and a described screenshot', () => {
		render(LandingFeatures);
		expect(screen.getByRole('heading', { level: 2, name: 'Features' })).toBeInTheDocument();
		for (const [title, image] of [
			['Link up with a partner', 'partner'],
			['Tasks that earn credits', 'tasks'],
			['Rewards worth working for', 'rewards'],
			['Messages just for the two of you', 'messages']
		]) {
			const heading = screen.getByRole('heading', { level: 3, name: title });
			const item = heading.closest('li');
			const img = item?.querySelector('img');
			expect(img).toHaveAttribute('src', `/landing/${image}.jpg`);
			// The alt is what a screen reader gets instead of the picture, so it
			// has to say what the screen shows, not just name it.
			expect(img?.getAttribute('alt')?.length).toBeGreaterThan(40);
		}
	});

	it('puts "Recently added" under the overview', () => {
		const { container } = render(LandingFeatures);
		const overview = container.querySelector('.overview');
		const recent = screen.getByRole('heading', { name: 'Recently added' });
		expect(overview?.compareDocumentPosition(recent)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});

	/**
	 * The images are committed files, retaken by `npm run screenshots:landing`.
	 * A renamed or dropped capture would otherwise ship as a broken image.
	 */
	it('points only at screenshots that exist', async () => {
		const { container } = render(LandingFeatures);
		const images = [...container.querySelectorAll('img')];
		expect(images.length).toBeGreaterThan(0);
		// Lazy images below the test frame's fold would never be fetched.
		for (const img of images) {
			img.loading = 'eager';
		}
		await Promise.all(images.map((img) => img.decode()));
		for (const img of images) {
			expect(img.naturalWidth, img.src).toBeGreaterThan(0);
		}
	});
});
