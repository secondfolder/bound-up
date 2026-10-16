import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import {
	type ChoiceQuestion,
	GENERATORS,
	type MultiQuestion,
	type PointQuestion,
	pickResponse,
	TIMED_OUT,
	withClock
} from '$lib/playroom/iq-test/questions';
import { createRng } from '$lib/playroom/iq-test/random';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import QuestionCard from './QuestionCard.svelte';
import { INK } from './question/ink';

function waButton(container: HTMLElement, text: string): HTMLElement {
	return defined(
		[...container.querySelectorAll<HTMLElement>('wa-button')].find(
			(button) => button.textContent?.trim() === text
		),
		`the "${text}" button`
	);
}

/** The first question of a kind whose prompt passes the test. */
function dealt(kind: 'stroop' | 'matrix', wanted: (question: ChoiceQuestion) => boolean) {
	for (let seed = 1; seed < 200; seed += 1) {
		const question = GENERATORS[kind](createRng(seed), 3, { vibe: null }, 'q') as ChoiceQuestion;
		if (wanted(question)) {
			return question;
		}
	}
	throw new Error(`No ${kind} question matched`);
}

async function renderCard(question: ChoiceQuestion) {
	const onanswer = vi.fn();
	const view = render(QuestionCard, { question, previous: null, onanswer });
	await waSettled(view.container);
	return { ...view, onanswer };
}

describe('QuestionCard', () => {
	it('answers "what does this word say" with blocks of colour, named for a screen reader', async () => {
		const question = dealt('stroop', (q) => q.prompt.startsWith('What does this word say'));
		const { container, onanswer } = await renderCard(question);
		const buttons = [...container.querySelectorAll<HTMLButtonElement>('button.answer-card')];
		expect(buttons).toHaveLength(question.choices.length);
		for (const [index, button] of buttons.entries()) {
			const choice = defined(question.choices[index], 'the choice');
			// A block, not the word: nothing written but its letter.
			expect(button.textContent?.trim()).toBe(String.fromCharCode(65 + index));
			expect(button).toHaveAccessibleName(choice.label);
			const swatch = defined(button.querySelector<HTMLElement>('.swatch'), 'the swatch');
			expect(swatch.style.background).not.toBe('');
			// Actually visible: it once had no width at all inside the button.
			expect(swatch.getBoundingClientRect().width).toBeGreaterThan(
				button.getBoundingClientRect().width / 2
			);
			expect(INK[defined(choice.swatch, 'the swatch colour')]).toBeDefined();
		}
		defined(buttons[0], 'a choice').click();
		expect(onanswer).toHaveBeenCalledWith(question.choices[0]?.id);
	});

	it('keeps word answers for "what colour is the ink"', async () => {
		const question = dealt('stroop', (q) => q.prompt.startsWith('What colour is the ink'));
		const { container } = await renderCard(question);
		expect(container.querySelector('.swatch')).toBeNull();
		expect(container).toHaveTextContent(defined(question.choices[0], 'a choice').label);
	});

	it('draws matrix answers as big as the grid’s own cells, centred under it', async () => {
		const question = dealt('matrix', () => true);
		const { container } = await renderCard(question);
		const grid = defined(container.querySelector<HTMLElement>('.matrix'), 'the grid');
		const choices = defined(container.querySelector<HTMLElement>('.answer-cards'), 'the answers');
		const cell = defined(
			grid.querySelector<HTMLElement>('.cell'),
			'a cell'
		).getBoundingClientRect();
		const answerSvg = defined(choices.querySelector('svg'), 'an answer').getBoundingClientRect();
		// Within a padding's width of the grid's own pieces, not shrunk to a sliver.
		expect(answerSvg.width).toBeGreaterThan(cell.width * 0.7);
		// Square, and holding its shape: not clipped to a control's height.
		const button = defined(
			choices.querySelector('button'),
			'an answer button'
		).getBoundingClientRect();
		expect(button.height).toBeCloseTo(button.width, 0);
		expect(answerSvg.height).toBeLessThanOrEqual(button.height);
		const gridBox = grid.getBoundingClientRect();
		const choicesBox = choices.getBoundingClientRect();
		expect(
			Math.abs(gridBox.left + gridBox.width / 2 - (choicesBox.left + choicesBox.width / 2))
		).toBeLessThan(2);
	});

	it('heads every set of answers, and letters each one, without changing its name', async () => {
		for (const question of [
			dealt('matrix', () => true),
			dealt('stroop', (q) => q.prompt.startsWith('What does this word say')),
			dealt('stroop', (q) => q.prompt.startsWith('What colour is the ink'))
		]) {
			const { container, unmount } = await renderCard(question);
			expect(container.querySelector('.answers-heading')).toHaveTextContent('Answers');
			const buttons = [...container.querySelectorAll<HTMLButtonElement>('button.answer-card')];
			expect(buttons.map((button) => button.querySelector('.letter')?.textContent)).toEqual(
				question.choices.map((_, index) => String.fromCharCode(65 + index))
			);
			for (const [index, button] of buttons.entries()) {
				expect(button).toHaveAccessibleName(defined(question.choices[index], 'a choice').label);
			}
			unmount();
		}
	});

	it('shows the colour words to count only for their time, with the answer box there throughout', async () => {
		vi.useFakeTimers();
		try {
			const question = withClock(GENERATORS['stroop-count'](createRng(1), 2, { vibe: null }, 'q'));
			const { seconds } = defined(question.timed, 'its time');
			const { container } = render(QuestionCard, { question, previous: null, onanswer: vi.fn() });
			const words = defined(
				container.querySelector<HTMLElement>('[data-testid="stroop-words"]'),
				'the words'
			);
			const countdown = defined(
				container.querySelector('[data-testid="countdown"]'),
				'the countdown'
			);
			expect(countdown).toHaveTextContent(`${seconds}s`);
			expect(getComputedStyle(words).visibility).toBe('visible');
			expect(container.querySelector('.text-answer wa-input')).not.toBeNull();

			await vi.advanceTimersByTimeAsync(1000);
			expect(countdown).toHaveTextContent(`${seconds - 1}s`);
			await vi.advanceTimersByTimeAsync(seconds * 1000);
			expect(getComputedStyle(words).visibility).toBe('hidden');
			expect(container).toHaveTextContent('answer from memory');
			// Still answerable.
			expect(container.querySelector('.text-answer wa-input')).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('counts the memorising time down large', async () => {
		const question = GENERATORS['digit-span'](createRng(1), 2, { vibe: null }, 'q');
		const { container } = render(QuestionCard, { question, previous: null, onanswer: vi.fn() });
		await waSettled(container);
		const number = defined(
			container.querySelector<HTMLElement>('[data-testid="countdown"] .number'),
			'the seconds'
		);
		expect(number).toHaveTextContent(`${defined(question.memorise, 'its items').seconds}s`);
		expect(Number.parseFloat(getComputedStyle(number).fontSize)).toBeGreaterThanOrEqual(30);
	});

	it('ticks all that apply, then answers with every tick on Done, and keeps them when returned to', async () => {
		const question = GENERATORS.synonyms(createRng(2), 3, { vibe: null }, 'q') as MultiQuestion;
		const onanswer = vi.fn();
		const [first, second] = question.answers;
		const view = render(QuestionCard, { question, previous: null, onanswer });
		await waSettled(view.container);
		const card = (id: string | undefined) =>
			defined(
				view.container.querySelectorAll<HTMLButtonElement>('button.answer-card')[
					question.choices.findIndex((choice) => choice.id === id)
				],
				`card ${id}`
			);
		expect(view.container.querySelector('.answers-heading')).toHaveTextContent(
			'Tick all that apply'
		);
		card(first).click();
		card(second).click();
		card(second).click();
		await tick();
		expect(card(first)).toHaveAttribute('aria-pressed', 'true');
		expect(card(second)).toHaveAttribute('aria-pressed', 'false');
		// Nothing is sent until Done.
		expect(onanswer).not.toHaveBeenCalled();
		waButton(view.container, 'Done').click();
		expect(onanswer).toHaveBeenCalledWith(pickResponse([first ?? '']));
		view.unmount();

		const back = render(QuestionCard, {
			question,
			previous: pickResponse([first ?? '']),
			onanswer: vi.fn()
		});
		await waSettled(back.container);
		const pressed = [...back.container.querySelectorAll('button.answer-card[aria-pressed="true"]')];
		expect(pressed).toHaveLength(1);
	});

	it('draws a rotation question’s shapes at one size, and names each by its letter alone', async () => {
		const question = GENERATORS['mental-rotation'](
			createRng(5),
			3,
			{ vibe: null },
			'q'
		) as MultiQuestion;
		const { container } = render(QuestionCard, { question, previous: null, onanswer: vi.fn() });
		await waSettled(container);
		const boxes = [...container.querySelectorAll('svg')].map((svg) => svg.getAttribute('viewBox'));
		expect(new Set(boxes).size).toBe(1);
		const cards = [...container.querySelectorAll<HTMLButtonElement>('button.answer-card')];
		expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(
			question.choices.map((_, index) => `Shape ${String.fromCharCode(65 + index)}`)
		);
		expect(container.querySelector('[data-testid="polyomino-shown"] svg')).not.toBeNull();
	});

	it('shows a board to remember, then has its squares shaded back', async () => {
		vi.useFakeTimers();
		try {
			const question = GENERATORS['visual-memory'](
				createRng(3),
				2,
				{ vibe: null },
				'q'
			) as MultiQuestion;
			const onanswer = vi.fn();
			const { container } = render(QuestionCard, { question, previous: null, onanswer });
			const shownBoard = defined(container.querySelector('[data-testid="board"]'), 'the board');
			expect(shownBoard.querySelectorAll('.marked')).toHaveLength(question.answers.length);
			expect(shownBoard.querySelector('button')).toBeNull();

			await vi.advanceTimersByTimeAsync((question.memorise?.seconds ?? 0) * 1000);
			const squares = [
				...container.querySelectorAll<HTMLButtonElement>('[data-testid="board"] button')
			];
			expect(squares).toHaveLength(30);
			// Nothing shaded for them: that is the memory being tested.
			expect(container.querySelectorAll('[data-testid="board"] .marked')).toHaveLength(0);
			defined(squares[Number(question.answers[0])], 'a shaded square').click();
			await vi.advanceTimersByTimeAsync(0);
			expect(squares[Number(question.answers[0])]).toHaveAttribute('aria-pressed', 'true');
		} finally {
			vi.useRealTimers();
		}
	});

	it('picks a central point with one click on the board, the points marked and named', () => {
		const question = GENERATORS['central-point'](
			createRng(8),
			2,
			{ vibe: null },
			'q'
		) as PointQuestion;
		const onanswer = vi.fn();
		const { container } = render(QuestionCard, { question, previous: null, onanswer });
		const squares = [
			...container.querySelectorAll<HTMLButtonElement>('[data-testid="board"] button')
		];
		expect(squares).toHaveLength(question.grid.columns * question.grid.rows);
		const point = defined(squares[question.points[0] ?? 0], 'a point');
		expect(point.getAttribute('aria-label')).toMatch(/, marked$/);
		defined(squares[Number(question.answer)], 'the centre').click();
		expect(onanswer).toHaveBeenCalledWith(question.answer);
	});

	it('shows the pictures to remember one at a time, then asks which were shown', async () => {
		vi.useFakeTimers();
		try {
			const question = GENERATORS['exposure-memory'](
				createRng(4),
				1,
				{ vibe: null },
				'q'
			) as MultiQuestion;
			const { container } = render(QuestionCard, { question, previous: null, onanswer: vi.fn() });
			const items = question.memorise?.items ?? [];
			const interval = question.memorise?.intervalMs ?? 0;
			const showing = () =>
				container.querySelector('[data-testid="memorise-items"]')?.textContent?.trim();
			expect(showing()).toBe(items[0]);
			await vi.advanceTimersByTimeAsync(interval);
			expect(showing()).toBe(items[1]);
			await vi.advanceTimersByTimeAsync(interval * items.length);
			expect(container.querySelector('section.question')).toHaveAttribute('data-phase', 'answer');
			expect(container.querySelectorAll('button.answer-card')).toHaveLength(8);
		} finally {
			vi.useRealTimers();
		}
	});

	it('answers an anagram question with whatever is ticked when its time runs out', async () => {
		vi.useFakeTimers();
		try {
			const question = withClock(
				GENERATORS.anagrams(createRng(6), 1, { vibe: null }, 'q')
			) as MultiQuestion;
			const onanswer = vi.fn();
			const { container } = render(QuestionCard, { question, previous: null, onanswer });
			const { seconds } = defined(question.limit, 'its limit');
			expect(container.querySelector('[data-testid="countdown"]')).toHaveTextContent(`${seconds}s`);
			defined(container.querySelector<HTMLButtonElement>('button.answer-card'), 'a set').click();
			await vi.advanceTimersByTimeAsync(seconds * 1000);
			expect(onanswer).toHaveBeenCalledWith(defined(question.choices[0], 'the first').id);
		} finally {
			vi.useRealTimers();
		}
	});

	it('fails a question read once and answered against the clock, when the time runs out', async () => {
		vi.useFakeTimers();
		try {
			const question = withClock(GENERATORS['odd-one-out'](createRng(2), 3, { vibe: null }, 'q'));
			const { seconds } = defined(question.limit, 'its limit');
			expect(question.timed).toBeUndefined();
			const onanswer = vi.fn();
			const { container } = render(QuestionCard, { question, previous: null, onanswer });
			expect(container.querySelector('[data-testid="countdown"]')).toHaveTextContent(`${seconds}s`);
			await vi.advanceTimersByTimeAsync(seconds * 1000);
			expect(onanswer).toHaveBeenCalledWith(TIMED_OUT);
		} finally {
			vi.useRealTimers();
		}
	});

	it('hides a word problem, prompt and all, when its time to read is up, the answer box staying', async () => {
		vi.useFakeTimers();
		try {
			const question = withClock(GENERATORS['word-problem'](createRng(2), 3, { vibe: null }, 'q'));
			const { seconds } = defined(question.timed, 'its time');
			const { container } = render(QuestionCard, { question, previous: null, onanswer: vi.fn() });
			const prompt = defined(container.querySelector<HTMLElement>('.prompt'), 'the prompt');
			expect(getComputedStyle(prompt).visibility).toBe('visible');
			await vi.advanceTimersByTimeAsync(seconds * 1000);
			expect(getComputedStyle(prompt).visibility).toBe('hidden');
			expect(container).toHaveTextContent('answer from memory');
			expect(container.querySelector('.text-answer wa-input')).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('takes the marked points off a central point board when its time to look is up', async () => {
		vi.useFakeTimers();
		try {
			const question = withClock(GENERATORS['central-point'](createRng(3), 2, { vibe: null }, 'q'));
			const { seconds } = defined(question.timed, 'its time');
			const { container } = render(QuestionCard, { question, previous: null, onanswer: vi.fn() });
			expect(container.querySelectorAll('[data-testid="board"] .marked').length).toBeGreaterThan(0);
			await vi.advanceTimersByTimeAsync(seconds * 1000);
			expect(container.querySelectorAll('[data-testid="board"] .marked')).toHaveLength(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('says a question lost to the clock is lost when it is returned to, with nothing to answer', () => {
		const question = withClock(GENERATORS.analogy(createRng(2), 3, { vibe: null }, 'q'));
		const { container } = render(QuestionCard, {
			question,
			previous: TIMED_OUT,
			onanswer: vi.fn()
		});
		expect(container).toHaveTextContent('ran out of time');
		expect(container.querySelector('button.answer-card')).toBeNull();
		expect(container.querySelector('[data-testid="countdown"]')).toBeNull();
	});

	it('carries on from the seconds left before a reload, and reports them as they run', async () => {
		vi.useFakeTimers();
		try {
			const question = withClock(GENERATORS['odd-one-out'](createRng(2), 3, { vibe: null }, 'q'));
			const onanswer = vi.fn();
			const onclock = vi.fn();
			const { container } = render(QuestionCard, {
				question,
				previous: null,
				resume: { limit: 2 },
				onanswer,
				onclock
			});
			expect(container.querySelector('[data-testid="countdown"]')).toHaveTextContent('2s');
			await vi.advanceTimersByTimeAsync(1000);
			expect(onclock).toHaveBeenLastCalledWith({ phase: 'answer', limit: 1 });
			await vi.advanceTimersByTimeAsync(1000);
			expect(onanswer).toHaveBeenCalledWith(TIMED_OUT);
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps a display hidden that had run down before a reload', () => {
		const question = withClock(GENERATORS['central-point'](createRng(3), 2, { vibe: null }, 'q'));
		const { container } = render(QuestionCard, {
			question,
			previous: null,
			resume: { timed: 0 },
			onanswer: vi.fn()
		});
		expect(container.querySelectorAll('[data-testid="board"] .marked')).toHaveLength(0);
		expect(container).toHaveTextContent('answer from memory');
	});

	it('never resumes with more time than the clock has', () => {
		const question = withClock(GENERATORS['odd-one-out'](createRng(2), 3, { vibe: null }, 'q'));
		const { seconds } = defined(question.limit, 'its limit');
		const { container } = render(QuestionCard, {
			question,
			previous: null,
			resume: { limit: seconds + 60 },
			onanswer: vi.fn()
		});
		expect(container.querySelector('[data-testid="countdown"]')).toHaveTextContent(`${seconds}s`);
	});

	it('runs no clock with the timer cleared: nothing hidden, nothing run out, no countdown', async () => {
		vi.useFakeTimers();
		try {
			const timed = withClock(GENERATORS['central-point'](createRng(3), 2, { vibe: null }, 'q'));
			const first = render(QuestionCard, {
				question: timed,
				previous: null,
				untimed: true,
				onanswer: vi.fn()
			});
			await vi.advanceTimersByTimeAsync(60_000);
			expect(first.container.querySelector('[data-testid="countdown"]')).toBeNull();
			expect(
				first.container.querySelectorAll('[data-testid="board"] .marked').length
			).toBeGreaterThan(0);
			first.unmount();

			const limited = withClock(GENERATORS['odd-one-out'](createRng(2), 3, { vibe: null }, 'q'));
			const onanswer = vi.fn();
			const { container, rerender } = render(QuestionCard, {
				question: limited,
				previous: null,
				untimed: true,
				onanswer
			});
			await vi.advanceTimersByTimeAsync(60_000);
			expect(onanswer).not.toHaveBeenCalled();
			// Turned off again, the clock starts from where it was stopped.
			const { seconds } = defined(limited.limit, 'its limit');
			await rerender({ question: limited, previous: null, untimed: false, onanswer });
			expect(container.querySelector('[data-testid="countdown"]')).toHaveTextContent(`${seconds}s`);
			await vi.advanceTimersByTimeAsync(seconds * 1000);
			expect(onanswer).toHaveBeenCalledWith(TIMED_OUT);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves memorising to “I’ve got them” with the timer cleared', async () => {
		vi.useFakeTimers();
		try {
			const question = GENERATORS['digit-span'](createRng(1), 2, { vibe: null }, 'q');
			const { container } = render(QuestionCard, {
				question,
				previous: null,
				untimed: true,
				onanswer: vi.fn()
			});
			await vi.advanceTimersByTimeAsync(60_000);
			expect(container.querySelector('[data-phase="memorise"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="countdown"]')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('carries on memorising from the seconds left before a reload, and reports where it is', async () => {
		vi.useFakeTimers();
		try {
			const question = GENERATORS['working-memory'](createRng(1), 2, { vibe: null }, 'q');
			const { seconds } = defined(question.memorise, 'its memorising');
			expect(seconds).toBeGreaterThan(2);
			const onclock = vi.fn();
			const { container } = render(QuestionCard, {
				question,
				previous: null,
				resume: { phase: 'memorise', memorise: 2 },
				onanswer: vi.fn(),
				onclock
			});
			expect(container.querySelector('[data-phase="memorise"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="countdown"]')).toHaveTextContent('2s');
			// Where it stands is saved straight away, then on every tick.
			expect(onclock).toHaveBeenLastCalledWith({ phase: 'memorise', memorise: 2 });
			await vi.advanceTimersByTimeAsync(1000);
			expect(onclock).toHaveBeenLastCalledWith({ phase: 'memorise', memorise: 1, at: 0 });
			await vi.advanceTimersByTimeAsync(1000);
			expect(container.querySelector('[data-phase="interference"]')).not.toBeNull();
			expect(onclock).toHaveBeenLastCalledWith({ phase: 'interference' });
		} finally {
			vi.useRealTimers();
		}
	});

	it('carries a one-at-a-time sequence on from the item it was on', () => {
		const question = GENERATORS['exposure-memory'](createRng(1), 2, { vibe: null }, 'q');
		const { items } = defined(question.memorise, 'its memorising');
		const { container } = render(QuestionCard, {
			question,
			previous: null,
			resume: { phase: 'memorise', at: 2 },
			onanswer: vi.fn()
		});
		expect(container.querySelector('[data-testid="memorise-items"]')).toHaveTextContent(
			defined(items[2], 'the third item')
		);
	});

	it('does not show the items again after a reload past memorising', () => {
		const question = GENERATORS['working-memory'](createRng(1), 2, { vibe: null }, 'q');
		const sum = render(QuestionCard, {
			question,
			previous: null,
			resume: { phase: 'interference' },
			onanswer: vi.fn()
		});
		expect(sum.container.querySelector('[data-phase="interference"]')).not.toBeNull();
		sum.unmount();

		const answering = render(QuestionCard, {
			question,
			previous: null,
			resume: { phase: 'answer' },
			onanswer: vi.fn()
		});
		expect(answering.container.querySelector('[data-phase="answer"]')).not.toBeNull();
		answering.unmount();

		// A phase the question does not have is ignored: digit span has no sum.
		const span = GENERATORS['digit-span'](createRng(1), 2, { vibe: null }, 'q');
		const { container } = render(QuestionCard, {
			question: span,
			previous: null,
			resume: { phase: 'interference' },
			onanswer: vi.fn()
		});
		expect(container.querySelector('[data-phase="memorise"]')).not.toBeNull();
	});
});
