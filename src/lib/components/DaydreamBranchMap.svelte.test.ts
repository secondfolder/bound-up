import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { DaydreamStory } from '$lib/daydream/story.svelte';
import { childrenOf, indexTree, pathTo } from '$lib/daydream/tree';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import type { DaydreamTreeNodeView } from '$lib/types';
import DaydreamBranchMap from './DaydreamBranchMap.svelte';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

/**
 * The story, as `[id, parent]`, oldest first:
 *
 *   r ─ u1 ─ s1 ─ u2 ─ s2 ─ u3 ─ s3    the longest way: the trunk
 *        │    └─ u2b ─ s2b             forks at s1, and is being read
 *        └─ s1c                        a second take of s1
 */
const TURNS: [string, string | null][] = [
	['r', null],
	['u1', 'r'],
	['s1', 'u1'],
	['u2', 's1'],
	['s2', 'u2'],
	['u3', 's2'],
	['s3', 'u3'],
	['u2b', 's1'],
	['s2b', 'u2b'],
	['s1c', 'u1']
];

function fakeStory(
	turns: [string, string | null][],
	activeTurnId: string,
	bookmarked: string[] = []
) {
	const tree: DaydreamTreeNodeView[] = turns.map(([id, parentId], at) => ({
		id,
		parentId,
		role: id.startsWith('u') ? 'user' : 'story',
		position: 0,
		createdAt: new Date(2026, 0, 1, 0, at)
	}));
	const index = indexTree(tree);
	const story = {
		tree,
		index,
		activeTurnId,
		path: pathTo(index, activeTurnId),
		busy: false,
		marks: bookmarked.map((turnId) => ({ turnId, content: { type: 'bookmark' } })),
		children: (id: string | null) => childrenOf(index, id),
		content: (id: string) => ({ type: 'text', text: `Turn ${id}` }),
		ensureLoaded: vi.fn(() => Promise.resolve()),
		showBranch: vi.fn(() => Promise.resolve()),
		rewindTo: vi.fn(() => Promise.resolve())
	};
	return story;
}

async function renderMap(story: ReturnType<typeof fakeStory>) {
	const onjump = vi.fn();
	const rendered = render(DaydreamBranchMap, {
		story: story as unknown as DaydreamStory,
		onclose: () => undefined,
		onjump
	});
	await waSettled(rendered.container);
	return { ...rendered, onjump };
}

/** What sits on the trunk, in order: `turn` for a node on it, `[…]` for a bough off it. */
function trunkOutline(container: Element): string[] {
	const trunk = defined(container.querySelector('.trunk'), 'the trunk');
	return [...trunk.children].map((item) => {
		const names = [...item.querySelectorAll('.node span')].map((span) =>
			(span.textContent ?? '').replace('Turn ', '')
		);
		return item.classList.contains('trunk-step') ? (names[0] ?? '?') : `[${names.join(' ')}]`;
	});
}

function rowOf(container: Element, id: string): Element {
	const button = [...container.querySelectorAll('.node')].find(
		(node) => node.textContent?.trim() === `Turn ${id}`
	);
	return defined(button?.closest('.turn'), `turn ${id}`);
}

function toggleOf(container: Element, id: string): HTMLButtonElement {
	const node = defined(rowOf(container, id).closest('.tree-node'), `the tree node around ${id}`);
	return defined(node.querySelector<HTMLButtonElement>(':scope > .tree-toggle'), `${id}'s toggle`);
}

describe('DaydreamBranchMap', () => {
	it('runs the trunk along the longest way, with each fork straight after its turn', async () => {
		const { container } = await renderMap(fakeStory(TURNS, 's2b'));
		expect(trunkOutline(container)).toEqual([
			'r',
			'u1',
			'[s1c]',
			's1',
			'[u2b s2b]',
			'u2',
			's2',
			'u3',
			's3'
		]);
	});

	it('gives a tie to the branch being read, then to the newest', async () => {
		// u2 and u2b both go two turns on from s1.
		const tied = TURNS.filter(([id]) => id !== 'u3' && id !== 's3');
		const reading = await renderMap(fakeStory(tied, 's2'));
		expect(trunkOutline(reading.container)).toContain('u2');
		reading.unmount();

		const elsewhere = await renderMap(fakeStory(tied, 's1c'));
		// Neither is being read, so the newer, u2b, carries the trunk.
		expect(trunkOutline(elsewhere.container)).toEqual([
			'r',
			'u1',
			'[s1c]',
			's1',
			'[u2 s2]',
			'u2b',
			's2b'
		]);
	});

	it('marks the branch being read, the turn being read, and bookmarks', async () => {
		const { container } = await renderMap(fakeStory(TURNS, 's2b', ['u3']));
		expect(rowOf(container, 's2b')).toHaveClass('current');
		for (const id of ['r', 'u1', 's1', 'u2b', 's2b']) {
			expect(rowOf(container, id)).toHaveClass('on-path');
		}
		expect(rowOf(container, 's3')).not.toHaveClass('on-path');
		expect(rowOf(container, 'u3').querySelector('wa-icon[name="bookmark"]')).not.toBeNull();
		// The turn being read has nowhere new to carry on from.
		expect(rowOf(container, 's2b').querySelector('wa-button')).toBeNull();
	});

	it('moves to a turn, or carries on from it', async () => {
		const story = fakeStory(TURNS, 's2b');
		const { container, onjump } = await renderMap(story);

		defined(rowOf(container, 's3').querySelector<HTMLButtonElement>('.node'), 'a turn').click();
		await vi.waitFor(() => expect(onjump).toHaveBeenCalledWith('s3'));
		expect(story.showBranch).toHaveBeenCalledWith('s3');
		expect(story.rewindTo).not.toHaveBeenCalled();
	});

	it('carries on from a turn', async () => {
		const story = fakeStory(TURNS, 's2b');
		const { container, onjump } = await renderMap(story);
		const carryOn = defined(
			rowOf(container, 'u2').querySelector<HTMLElement>('wa-button'),
			'carry on'
		);
		carryOn.click();
		await vi.waitFor(() => expect(onjump).toHaveBeenCalledWith('u2'));
		expect(story.rewindTo).toHaveBeenCalledWith('u2');
	});

	it('folds the forks off a trunk turn, and keeps the trunk', async () => {
		const { container } = await renderMap(fakeStory(TURNS, 's3'));
		const toggle = toggleOf(container, 'u1');
		expect(toggle).toHaveAccessibleName('Hide 1 under Turn u1');
		toggle.click();
		await vi.waitFor(() => expect(trunkOutline(container)).not.toContain('[s1c]'));
		expect(trunkOutline(container)).toContain('s1');
		expect(toggle).toHaveAccessibleName('Show 1 more under Turn u1');
	});

	it('folds a side branch to its first turn', async () => {
		const { container } = await renderMap(fakeStory(TURNS, 's3'));
		toggleOf(container, 'u2b').click();
		await vi.waitFor(() => expect(trunkOutline(container)).toContain('[u2b]'));
	});

	it('never folds away the turn being read', async () => {
		const { container } = await renderMap(fakeStory(TURNS, 's2b'));
		// The fork it is on, off s1, and the branch it is on, from u2b.
		expect(toggleOf(container, 's1')).toBeDisabled();
		expect(toggleOf(container, 'u2b')).toBeDisabled();
		// Elsewhere still folds.
		expect(toggleOf(container, 'u1')).toBeEnabled();
	});
});
