import { describe, expect, it, vi } from 'vitest';
import { isCorrect } from '$lib/testing/iq-test';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Question } from '$lib/playroom/iq-test/questions';
import { rightAnswer } from '$lib/playroom/iq-test/questions';
import {
	answer,
	createRun,
	dismissEnough,
	MIN_FOR_SCORE,
	RUN_LENGTH,
	type Run,
	skip
} from '$lib/playroom/iq-test/run';
import { DEFAULT_SETTINGS } from '$lib/playroom/iq-test/settings';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import QuestionView from './QuestionView.svelte';

function handlers() {
	return {
		onanswer: vi.fn(),
		onskip: vi.fn(),
		onback: vi.fn(),
		onexit: vi.fn(),
		onreturn: vi.fn(),
		ondismiss: vi.fn(),
		onfinish: vi.fn()
	};
}

const copy = {
	enoughBanner: 'Enough for a score',
	skippedNote: (count: number) => `You skipped ${count}.`
};

async function renderView(
	run: Run,
	extra: { answerButton?: boolean; timersCleared?: boolean } = {}
) {
	const on = { ...handlers(), ontimerscleared: vi.fn(), onclock: vi.fn() };
	const view = render(QuestionView, { run, ...copy, ...extra, ...on });
	await waSettled(view.container);
	return { ...view, ...on };
}

function waButton(container: HTMLElement, text: string): HTMLElement {
	return defined(
		[...container.querySelectorAll<HTMLElement>('wa-button')].find(
			(button) => button.textContent?.trim() === text
		),
		`the "${text}" button`
	);
}

/** A fresh run whose first question is of the given shape. */
function runAt(predicate: (question: Question) => boolean): Run {
	const seed = Array.from({ length: 500 }, (_, i) => i).find((candidate) => {
		const [first] = createRun(DEFAULT_SETTINGS, candidate).questions;
		return first !== undefined && predicate(first);
	});
	return createRun(DEFAULT_SETTINGS, defined(seed, 'a seed dealing a matching question'));
}

function skipped(count: number): Run {
	let run = createRun(DEFAULT_SETTINGS, 1);
	for (let i = 0; i < count; i += 1) {
		run = skip(run);
	}
	return run;
}

describe('QuestionView', () => {
	it('shows where the taker is and how far from a score', async () => {
		const { container } = await renderView(createRun(DEFAULT_SETTINGS, 1));
		expect(container).toHaveTextContent('Question 1 of 36');
		expect(container).toHaveTextContent(`${MIN_FOR_SCORE} more for a score`);
		expect(container.querySelector('[data-testid="enough-banner"]')).toBeNull();
	});

	it('skips, and goes back out to the intro from the first question', async () => {
		const { container, onskip, onexit, onback } = await renderView(createRun(DEFAULT_SETTINGS, 1));
		waButton(container, 'Skip').click();
		expect(onskip).toHaveBeenCalledTimes(1);
		const backButton = waButton(container, 'Back') as HTMLElement & { disabled: boolean };
		expect(backButton.disabled).toBe(false);
		backButton.click();
		expect(onexit).toHaveBeenCalledTimes(1);
		expect(onback).not.toHaveBeenCalled();
	});

	it('goes back a question from any later one', async () => {
		const { container, onback, onexit } = await renderView(
			answer(createRun(DEFAULT_SETTINGS, 1), 'x')
		);
		waButton(container, 'Back').click();
		expect(onback).toHaveBeenCalledTimes(1);
		expect(onexit).not.toHaveBeenCalled();
	});

	it('offers to finish once enough has been attempted, and to go back to the skips', async () => {
		const { container, onfinish, onreturn } = await renderView(skipped(MIN_FOR_SCORE));
		const banner = container.querySelector('[data-testid="enough-banner"]');
		expect(banner).toHaveTextContent('Enough for a score');
		expect(banner).toHaveTextContent(`You skipped ${MIN_FOR_SCORE}.`);
		waButton(container, 'Finish and see my score').click();
		expect(onfinish).toHaveBeenCalledTimes(1);
		waButton(container, 'Go back to them').click();
		expect(onreturn).toHaveBeenCalledTimes(1);
	});

	it('offers "Return to skipped" beside Back and Skip once a question was skipped', async () => {
		const fresh = await renderView(createRun(DEFAULT_SETTINGS, 1));
		expect(fresh.container).not.toHaveTextContent('Return to skipped');
		fresh.unmount();

		const { container, onreturn } = await renderView(skipped(1));
		// Beside Skip, at the end, with Back alone at the start.
		const left = (name: string) => waButton(container, name).getBoundingClientRect();
		expect(left('Return to skipped').right).toBeLessThanOrEqual(left('Skip').left);
		expect(left('Skip').left - left('Return to skipped').right).toBeLessThan(20);
		expect(left('Back').right).toBeLessThan(left('Return to skipped').left - 50);
		waButton(container, 'Return to skipped').click();
		expect(onreturn).toHaveBeenCalledTimes(1);
	});

	it('leaves a small "Finish early" once the banner is dismissed', async () => {
		const run = skipped(MIN_FOR_SCORE);
		const open = await renderView(run);
		const dismiss = defined(
			open.container.querySelector<HTMLElement>('[data-testid="enough-banner"] wa-button.dismiss'),
			'the dismiss button'
		);
		// In the banner's top right corner, as a close button is.
		const banner = defined(
			open.container.querySelector('[data-testid="enough-banner"]'),
			'the banner'
		).getBoundingClientRect();
		const corner = dismiss.getBoundingClientRect();
		expect(banner.right - corner.right).toBeLessThan(12);
		expect(corner.top - banner.top).toBeLessThan(12);
		dismiss.click();
		expect(open.ondismiss).toHaveBeenCalledTimes(1);
		open.unmount();

		const { container, onfinish } = await renderView(dismissEnough(run));
		expect(container.querySelector('[data-testid="enough-banner"]')).toBeNull();
		waButton(container, 'Finish early').click();
		expect(onfinish).toHaveBeenCalledTimes(1);
	});

	it('shows no banner on the last page, which has a finish button of its own', async () => {
		const { container, onfinish } = await renderView(skipped(RUN_LENGTH));
		expect(container).toHaveTextContent("That's every question.");
		expect(container.querySelector('[data-testid="enough-banner"]')).toBeNull();
		expect(container).toHaveTextContent('Return to skipped');
		waButton(container, 'See my score').click();
		expect(onfinish).toHaveBeenCalledTimes(1);
	});

	it('answers a multiple-choice question with one click, and marks the previous answer', async () => {
		const run = runAt((candidate) => candidate.format === 'choice' && !candidate.memorise);
		const question = run.questions[run.index];
		if (question?.format !== 'choice') {
			throw new Error('Expected a choice question');
		}
		const responses = [...run.responses];
		responses[run.index] = question.answer;
		const { container, onanswer } = await renderView({ ...run, responses });

		const pressed = container.querySelectorAll('button.answer-card[aria-pressed="true"]');
		expect(pressed).toHaveLength(1);
		(pressed[0] as HTMLButtonElement).click();
		expect(onanswer).toHaveBeenCalledWith(rightAnswer(question));
	});

	it('offers "Correct answer" only when asked to, and it answers correctly', async () => {
		const plain = await renderView(createRun(DEFAULT_SETTINGS, 1));
		expect(plain.container).not.toHaveTextContent('Correct answer');
		plain.unmount();

		const run = runAt((candidate) => candidate.kind === 'working-memory');
		const view = await renderView(run, { answerButton: true });
		const { onanswer } = view;
		// Even mid-memorise: it does not wait for the words to go.
		waButton(view.container, 'Correct answer').click();
		const question = defined(run.questions[run.index], 'the question');
		expect(onanswer).toHaveBeenCalledWith(rightAnswer(question));
		expect(isCorrect(question, onanswer.mock.calls[0]?.[0] ?? null)).toBe(true);
	});

	it('offers "Incorrect answer" beside it, which submits a wrong answer rather than a skip', async () => {
		const run = runAt((candidate) => candidate.format === 'text');
		const view = await renderView(run, { answerButton: true });
		const { onanswer, onskip } = view;
		waButton(view.container, 'Incorrect answer').click();
		const question = defined(run.questions[run.index], 'the question');
		const given = defined(onanswer.mock.calls[0]?.[0], 'the answer given');
		expect(given.trim()).not.toBe('');
		expect(isCorrect(question, given)).toBe(false);
		expect(onskip).not.toHaveBeenCalled();

		waButton(view.container, 'Skip question').click();
		expect(onskip).toHaveBeenCalledTimes(1);
	});

	it('offers none of the testing buttons without the feature', async () => {
		const { container } = await renderView(createRun(DEFAULT_SETTINGS, 1));
		for (const name of ['Correct answer', 'Incorrect answer', 'Skip question', 'Clear timer']) {
			expect(container).not.toHaveTextContent(name);
		}
	});

	it('offers "Clear timer" beside them, which takes the clock off the question', async () => {
		const sub = { ...DEFAULT_SETTINGS, role: 'sub' as const };
		const seed = Array.from({ length: 500 }, (_, i) => i).find((candidate) => {
			const [first] = createRun(sub, candidate).questions;
			return first?.limit !== undefined;
		});
		const run = createRun(sub, defined(seed, 'a seed dealing a question with a limit'));
		const timed = await renderView(run, { answerButton: true });
		expect(timed.container.querySelector('[data-testid="countdown"]')).not.toBeNull();
		const toggle = defined(
			timed.container.querySelector<HTMLElement & { checked: boolean }>(
				'.answer-buttons wa-switch'
			),
			'the switch'
		);
		expect(toggle).toHaveTextContent('Clear timer');
		toggle.checked = true;
		toggle.dispatchEvent(new Event('change', { bubbles: true }));
		expect(timed.ontimerscleared).toHaveBeenCalledWith(true);
		timed.unmount();

		const cleared = await renderView(run, { answerButton: true, timersCleared: true });
		expect(cleared.container.querySelector('[data-testid="countdown"]')).toBeNull();
		cleared.unmount();

		// Left on, it does nothing once the feature has gone.
		const without = await renderView(run, { timersCleared: true });
		expect(without.container.querySelector('[data-testid="countdown"]')).not.toBeNull();
	});

	it('keeps "Correct answer" above the banner, so it does not move when the banner appears', async () => {
		const props = { ...copy, answerButton: true, ...handlers() };
		const run = skipped(MIN_FOR_SCORE - 1);
		const { container, rerender } = render(QuestionView, { ...props, run });
		await waSettled(container);
		const before = waButton(container, 'Correct answer').getBoundingClientRect().top;

		await rerender({ ...props, run: skip(run) });
		await waSettled(container);
		expect(container.querySelector('[data-testid="enough-banner"]')).not.toBeNull();
		expect(waButton(container, 'Correct answer').getBoundingClientRect().top).toBe(before);
	});

	it('shows words to memorise first, then the sum, then asks for them back', async () => {
		const run = runAt((candidate) => candidate.kind === 'working-memory');
		const { container } = await renderView(run);
		const section = defined(
			container.querySelector<HTMLElement>('section.question'),
			'the question'
		);
		expect(section.dataset.phase).toBe('memorise');
		expect(container.querySelector('[data-testid="memorise-items"]')).not.toBeNull();

		waButton(container, "I've got them").click();
		await tick();
		expect(section.dataset.phase).toBe('interference');
		expect(container.querySelector('[data-testid="memorise-items"]')).toBeNull();
	});
});
