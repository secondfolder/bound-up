/**
 * A daydream's turns as a tree: every branch of the story kept in one place.
 *
 * Retrying a reply, rewriting a passage and carrying on from an earlier point
 * all add a turn beside an existing one rather than replacing it, so the
 * story is a tree whose root is the opening (or several, when the opening was
 * retried). The page shows one path through it — the root down to the
 * daydream's active turn — and these functions find that path, its forks, and
 * what the turns on it add up to.
 *
 * Pure and alias-free: the server uses `pathTo` to pick which turns to send
 * a page, and the page uses all of it.
 */

import { MAX_DIRECTIONS } from '../daydream';
import type { DaydreamTurnContent, Direction } from '../sealed-kinds/daydreams';

/** One turn's place in the tree, without its content. */
export type TreeNode = {
	id: string;
	parentId: string | null;
	createdAt: Date;
};

/** Newest first, then by id, so the order is total (AGENTS.md, invariant 8's spirit). */
function newerFirst(a: TreeNode, b: TreeNode): number {
	const byTime = b.createdAt.getTime() - a.createdAt.getTime();
	if (byTime !== 0) {
		return byTime;
	}
	return a.id < b.id ? 1 : -1;
}

/** Oldest first, then by id: the order siblings are numbered in (`‹ 2/3 ›`). */
function olderFirst(a: TreeNode, b: TreeNode): number {
	return -newerFirst(a, b);
}

/** A lookup of the tree, built once per change rather than scanned for every question. */
export type TreeIndex<Node extends TreeNode> = {
	byId: ReadonlyMap<string, Node>;
	/** Children by parent id, oldest first; roots under `null`. */
	children: ReadonlyMap<string | null, readonly Node[]>;
};

export function indexTree<Node extends TreeNode>(nodes: readonly Node[]): TreeIndex<Node> {
	const byId = new Map<string, Node>();
	const children = new Map<string | null, Node[]>();
	for (const node of nodes) {
		byId.set(node.id, node);
	}
	for (const node of nodes) {
		// A parent that is not here (older than what was loaded) makes the turn
		// a root of what is shown, rather than lost.
		const parent = node.parentId !== null && byId.has(node.parentId) ? node.parentId : null;
		const list = children.get(parent) ?? [];
		list.push(node);
		children.set(parent, list);
	}
	for (const list of children.values()) {
		list.sort(olderFirst);
	}
	return { byId, children };
}

/**
 * The path from the root down to `leafId`, root first. Empty when `leafId` is
 * null or not in the tree. Stops rather than looping on a cycle, which only a
 * corrupt row could make.
 */
export function pathTo<Node extends TreeNode>(
	tree: TreeIndex<Node>,
	leafId: string | null
): Node[] {
	const path: Node[] = [];
	const seen = new Set<string>();
	let current = leafId === null ? undefined : tree.byId.get(leafId);
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		path.push(current);
		current = current.parentId === null ? undefined : tree.byId.get(current.parentId);
	}
	return path.reverse();
}

export function childrenOf<Node extends TreeNode>(
	tree: TreeIndex<Node>,
	nodeId: string | null
): readonly Node[] {
	return tree.children.get(nodeId) ?? [];
}

/** A turn and the turns beside it (itself included), oldest first, for the `‹ 2/3 ›` switcher. */
export function siblingsOf<Node extends TreeNode>(
	tree: TreeIndex<Node>,
	nodeId: string
): readonly Node[] {
	const node = tree.byId.get(nodeId);
	if (!node) {
		return [];
	}
	const parent = node.parentId !== null && tree.byId.has(node.parentId) ? node.parentId : null;
	return childrenOf(tree, parent);
}

/**
 * Where to land when moving to `nodeId`: the end of the branch through it
 * that was written most recently. Picking an earlier fork in the switcher or
 * the branch map goes back to where that branch was left, not to its first
 * turn.
 */
export function latestLeafUnder<Node extends TreeNode>(
	tree: TreeIndex<Node>,
	nodeId: string
): string {
	let newest: Node | undefined;
	const stack = [nodeId];
	const seen = new Set<string>();
	while (stack.length > 0) {
		const id = stack.pop() as string;
		if (seen.has(id)) {
			continue;
		}
		seen.add(id);
		const node = tree.byId.get(id);
		if (!node) {
			continue;
		}
		const kids = childrenOf(tree, id);
		if (kids.length === 0 && (!newest || newerFirst(node, newest) < 0)) {
			newest = node;
		}
		for (const kid of kids) {
			stack.push(kid.id);
		}
	}
	return newest?.id ?? nodeId;
}

// ── what a path adds up to ───────────────────────────────────────────────────

/** A turn on the path with its content, or null while it is opening or will not open. */
export type OpenedTurn = { content: DaydreamTurnContent | null };

/**
 * Whether the scene is stopped: the last safety signal on the path is Stop
 * the scene, with nothing since that carries on (Resume, or Ease off, which
 * resumes gently). The server checks the same on what a page sends it, and
 * answers a stopped scene with a check-in whatever was asked for.
 */
export function isHalted(path: readonly OpenedTurn[]): boolean {
	for (let index = path.length - 1; index >= 0; index -= 1) {
		const content = path[index]?.content;
		if (content?.type === 'safety') {
			return content.signal === 'red';
		}
	}
	return false;
}

/**
 * The direction buttons on offer at the end of the path.
 *
 * Each passage says which buttons it adds and removes, rather than restating
 * the set, so the set is the fold of every passage on the path. Kept to
 * `MAX_DIRECTIONS`, dropping the oldest, so a model that only ever adds
 * cannot grow the row without end. A label already present under another id
 * is not added twice.
 */
export function currentDirections(path: readonly OpenedTurn[]): Direction[] {
	let directions: Direction[] = [];
	for (const turn of path) {
		const meta = turn.content?.type === 'text' ? turn.content.meta : undefined;
		if (!meta) {
			continue;
		}
		const removed = new Set(meta.directions.remove);
		directions = directions.filter((direction) => !removed.has(direction.id));
		for (const added of meta.directions.add) {
			const label = added.label.toLowerCase();
			directions = directions.filter(
				(direction) => direction.id !== added.id && direction.label.toLowerCase() !== label
			);
			directions.push(added);
		}
	}
	return directions.slice(-MAX_DIRECTIONS);
}
