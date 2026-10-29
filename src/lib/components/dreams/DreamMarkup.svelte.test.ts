import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import DreamMarkup from './DreamMarkup.svelte';

/** The passage renderer (docs/dreams.md, "The markup"). */

const SOURCE = `<say who="ines">"Again,"</say> Ms Varga says. *Slowly.*
<beat/>
<hidden label="the card">It says your name.</hidden> You notice <more>her ring</more>.
<after>
{"next":"She waits."}
</after>`;

function draw(overrides: Partial<Parameters<typeof render<typeof DreamMarkup>>[1]> = {}) {
	const onref = vi.fn();
	const onmore = vi.fn();
	render(DreamMarkup, {
		source: SOURCE,
		turnId: 't1',
		names: [{ id: 'ines', name: 'Ms Varga' }],
		expansions: new Map<string, string>(),
		filling: new Set<string>(),
		onref,
		onmore,
		...overrides
	});
	return { onref, onmore };
}

describe('DreamMarkup', () => {
	it('links names, draws emphasis, and never shows the footer', async () => {
		const { onref } = draw();
		await userEvent.click(screen.getByRole('button', { name: 'Ms Varga' }));
		expect(onref).toHaveBeenCalledWith('ines');
		expect(screen.getByText('Slowly.').tagName).toBe('EM');
		expect(document.body.textContent).not.toContain('She waits.');
	});

	it('keeps a spoiler covered until it is tapped', async () => {
		draw();
		const spoiler = screen.getByRole('button', { name: 'Reveal: the card' });
		expect(spoiler).toHaveAttribute('aria-expanded', 'false');
		await userEvent.click(spoiler);
		expect(screen.queryByRole('button', { name: 'Reveal: the card' })).toBeNull();
		expect(screen.getByText('It says your name.')).toBeVisible();
	});

	it('asks for a <more> by its place in the passage, and shows what came back', async () => {
		const { onmore } = draw();
		await userEvent.click(screen.getByRole('button', { name: 'Read more: her ring' }));
		expect(onmore).toHaveBeenCalledWith('t1:more:0', 'her ring');
		document.body.innerHTML = '';
		draw({ expansions: new Map([['t1:more:0', 'Silver, worn thin.']]) });
		expect(screen.getByText('Silver, worn thin.')).toBeVisible();
	});

	it('cycles a choice through its options, named for what it changes', async () => {
		const setChoice = vi.fn();
		draw({
			source: 'You wear <cycle id="wear" label="what you wear">the collar|nothing</cycle>.',
			inputs: { live: true, choices: {}, values: {}, setChoice }
		});
		await userEvent.click(
			screen.getByRole('button', { name: 'Change: what you wear, now the collar' })
		);
		expect(setChoice).toHaveBeenCalledWith('wear', 'nothing');
	});

	it('draws a contract with real fields, and sends them with Done', async () => {
		const setValue = vi.fn();
		const done = vi.fn();
		draw({
			source:
				'<block kind="contract" title="Terms"><field id="c1" type="initial">You will kneel.</field><field id="sig" type="sign">Sign here</field></block>',
			inputs: { live: true, choices: {}, values: { 'terms/sig': 'signed' }, setValue, done }
		});
		expect(screen.getByRole('region', { name: 'Terms' })).toBeVisible();
		const initial = screen.getByRole('button', { name: 'Initial: You will kneel.' });
		expect(initial).toHaveAttribute('aria-pressed', 'false');
		await userEvent.click(initial);
		expect(setValue).toHaveBeenCalledWith('contract-1/c1', 'initialled');
		await userEvent.click(screen.getByText('Sign and return'));
		expect(done).toHaveBeenCalled();
	});

	it('shows what was sent on an earlier passage, and takes no input', () => {
		draw({
			source: '<block kind="contract"><field id="c1" type="initial">Kneel.</field></block>',
			inputs: { live: false, choices: {}, values: { 'contract-1/c1': 'initialled' } }
		});
		expect(screen.getByRole('button', { name: 'Initial: Kneel.' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Initial: Kneel.' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.queryByText('Sign and return')).toBeNull();
	});

	it('puts texts in bubbles, the user’s on their own side', () => {
		draw({ source: '<texts><say who="ines">Well?</say><say who="you">Done.</say></texts>' });
		const mine = screen.getByText('Done.').closest('.say');
		expect(mine).toHaveAttribute('data-you', 'true');
	});

	it('shows one beat at a time in tap-through, with Next and Back', async () => {
		// Present rather than visible: the newest beat fades in.
		draw({ source: 'One.<beat/>Two.<beat/>Three.', view: 'tap' });
		expect(screen.getByText('One.')).toBeInTheDocument();
		expect(screen.queryByText('Two.')).toBeNull();
		await userEvent.click(screen.getByText('Next'));
		expect(screen.getByText('Two.')).toBeInTheDocument();
		await userEvent.click(screen.getByText('One.'));
		expect(screen.getByText('Three.')).toBeInTheDocument();
		await userEvent.click(screen.getByText('Back'));
		expect(screen.queryByText('Three.')).toBeNull();
	});

	it('works from the keyboard: every interactive part is a button in reading order', async () => {
		const setChoice = vi.fn();
		const setValue = vi.fn();
		const onmore = vi.fn();
		draw({
			source:
				'Ms Varga waits. <cycle id="w" label="the word">yes|no</cycle> <hidden label="the card">Inside.</hidden> <more>the ring</more>\n<block kind="lines"><field type="tap-count" target="3">I will listen.</field></block>',
			inputs: { live: true, choices: {}, values: {}, setChoice, setValue },
			onmore
		});
		const order = [
			'Ms Varga',
			'Change: the word, now yes',
			'Reveal: the card',
			'Read more: the ring',
			'Once more: I will listen., 0 of 3'
		];
		for (const name of order) {
			await userEvent.keyboard('{Tab}');
			expect(document.activeElement).toBe(screen.getByRole('button', { name }));
		}
		await userEvent.keyboard('{Enter}');
		expect(setValue).toHaveBeenCalledWith('lines-1/f1', '1');
		screen.getByRole('button', { name: 'Change: the word, now yes' }).focus();
		await userEvent.keyboard(' ');
		expect(setChoice).toHaveBeenCalledWith('w', 'no');
	});
});
