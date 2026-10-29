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
		const spoiler = screen.getByRole('button', { name: /the card/ });
		expect(spoiler).toHaveAttribute('aria-expanded', 'false');
		await userEvent.click(spoiler);
		expect(screen.queryByRole('button', { name: /the card/ })).toBeNull();
		expect(screen.getByText('It says your name.')).toBeVisible();
	});

	it('asks for a <more> by its place in the passage, and shows what came back', async () => {
		const { onmore } = draw();
		await userEvent.click(screen.getByRole('button', { name: 'her ring' }));
		expect(onmore).toHaveBeenCalledWith('t1:more:0', 'her ring');
		document.body.innerHTML = '';
		draw({ expansions: new Map([['t1:more:0', 'Silver, worn thin.']]) });
		expect(screen.getByText('Silver, worn thin.')).toBeVisible();
	});
});
