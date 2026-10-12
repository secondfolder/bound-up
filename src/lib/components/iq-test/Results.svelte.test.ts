import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { analyse } from '$lib/playroom/iq-test/analysis';
import { percentileOf, type Score } from '$lib/playroom/iq-test/scoring';
import { DEFAULT_SETTINGS, type Settings } from '$lib/playroom/iq-test/settings';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import Results from './Results.svelte';

const history = createRawSnippet(() => ({ render: () => '<p>history goes here</p>' }));

async function renderResults(iq: number, settings: Settings = DEFAULT_SETTINGS) {
	const score: Score = { iq, percentile: percentileOf(iq), correct: 6, attempted: 12, skipped: 0 };
	const onretake = vi.fn();
	const view = render(Results, { score, analysis: analyse(score, settings), history, onretake });
	await waSettled(view.container);
	return { ...view, onretake };
}

describe('Results', () => {
	it('reads like a report for an ordinary score', async () => {
		const { container } = await renderResults(104);
		expect(container.querySelector('[data-simplicity]')).toHaveAttribute('data-simplicity', 'full');
		expect(container.querySelector('[data-testid="iq-score"]')).toHaveTextContent('104');
		expect(container).toHaveTextContent('Percentile');
		expect(container.querySelector('[data-testid="curve-explainer"]')).toBeNull();
		expect(container).toHaveTextContent('history goes here');
	});

	it('says less, in bigger words, for a low score, and explains the curve', async () => {
		const { container } = await renderResults(58);
		expect(container.querySelector('[data-simplicity]')).toHaveAttribute(
			'data-simplicity',
			'very-simple'
		);
		expect(container).not.toHaveTextContent('Percentile');
		expect(container.querySelector('[data-testid="curve-explainer"]')).not.toBeNull();
	});

	it('marks the score on the bell curve', async () => {
		const { container } = await renderResults(73);
		expect(container.querySelector('[data-testid="bell-curve-marker"]')).toHaveAttribute(
			'data-iq',
			'73'
		);
	});

	it('shows the sober and target comparisons when they were given', async () => {
		// From level 1, which is where they are asked for; the plain wording.
		const { container } = await renderResults(80, {
			...DEFAULT_SETTINGS,
			intensity: 1,
			humiliating: false,
			soberIq: 100,
			targetIq: 80
		});
		expect(container).toHaveTextContent('20 points below your reported baseline of 100');
		expect(container).toHaveTextContent('Within 5 points of your target of 80');
	});

	it('names the classification beside the number, at every score', async () => {
		for (const [iq, classification] of [
			[104, 'Average'],
			[75, 'Borderline'],
			[58, 'Extremely low']
		] as const) {
			const { container, unmount } = await renderResults(iq);
			const score = defined(container.querySelector('[data-testid="iq-score"]'), 'the score');
			expect(score.querySelector('[data-testid="iq-classification"]')).toHaveTextContent(
				classification
			);
			unmount();
		}
	});

	it('mocks a sub for skipping in an explicit run, and only then', async () => {
		const explicit: Settings = {
			...DEFAULT_SETTINGS,
			role: 'sub',
			intensity: 2,
			vibe: 'gooner'
		};
		const skipLine = async (settings: Settings, skipped: number) => {
			const score: Score = {
				iq: 80,
				percentile: percentileOf(80),
				correct: 4,
				attempted: 12,
				skipped
			};
			const view = render(Results, {
				score,
				analysis: analyse(score, settings),
				onretake: vi.fn()
			});
			await waSettled(view.container);
			const line = view.container.querySelector('[data-testid="skip-line"]')?.textContent ?? null;
			view.unmount();
			return line;
		};
		expect(await skipLine(explicit, 3)).toContain('skipped 3 questions');
		expect(await skipLine(explicit, 0)).toBeNull();
		expect(await skipLine({ ...explicit, role: 'dom' }, 3)).toBeNull();
		expect(await skipLine(DEFAULT_SETTINGS, 3)).toBeNull();
	});
});
