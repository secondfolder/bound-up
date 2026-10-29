/**
 * A daydream's turns as a tree (docs/dreams.md, "Storage"). Every version of
 * a passage — a retry, another take, an edit — is a sibling of the others,
 * so nothing is thrown away, and the page shows one path: the opening down
 * to the turn the user is on.
 *
 * Pure and alias-free: the server uses `pathTo` to choose which turns to send
 * a page, and the page uses all of it.
 */

/** One turn's place in the tree, without its content. */
export type TreeNode = { id: string; parentId: string | null; createdAt: Date };

export type TreeIndex<Node extends TreeNode> = {
	byId: ReadonlyMap<string, Node>;
	/** Children by parent id, oldest first; openings under `null`. */
	children: ReadonlyMap<string | null, readonly Node[]>;
};

/** Oldest first, then by id, so siblings always number the same way (`‹ 2 / 3 ›`). */
function olderFirst(a: TreeNode, b: TreeNode): number {
	const byTime = a.createdAt.getTime() - b.createdAt.getTime();
	if (byTime !== 0) {
		return byTime;
	}
	return a.id < b.id ? -1 : 1;
}

export function indexTree<Node extends TreeNode>(nodes: readonly Node[]): TreeIndex<Node> {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const children = new Map<string | null, Node[]>();
	for (const node of nodes) {
		// A parent older than what was loaded makes the turn an opening of what
		// is shown, rather than losing it.
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

/** The opening down to `id`, inclusive; empty when `id` is not in the tree. */
export function pathTo<Node extends TreeNode>(index: TreeIndex<Node>, id: string | null): Node[] {
	const path: Node[] = [];
	const seen = new Set<string>();
	let node = id === null ? undefined : index.byId.get(id);
	// `seen` guards a cycle, which the server never writes but a bad row could.
	while (node && !seen.has(node.id)) {
		seen.add(node.id);
		path.push(node);
		node = node.parentId === null ? undefined : index.byId.get(node.parentId);
	}
	return path.reverse();
}

/** A turn and its siblings (itself included), oldest first: a passage's versions. */
export function versionsOf<Node extends TreeNode>(index: TreeIndex<Node>, id: string): Node[] {
	const node = index.byId.get(id);
	if (!node) {
		return [];
	}
	const parent = node.parentId !== null && index.byId.has(node.parentId) ? node.parentId : null;
	return [...(index.children.get(parent) ?? [])];
}

/**
 * Where a branch ends if you follow it down from `id`: the newest child at
 * each step, which is where the story was last left on that branch.
 */
export function latestLeafUnder<Node extends TreeNode>(
	index: TreeIndex<Node>,
	id: string
): Node | undefined {
	let node = index.byId.get(id);
	const seen = new Set<string>();
	while (node && !seen.has(node.id)) {
		seen.add(node.id);
		const next: Node | undefined = index.children.get(node.id)?.at(-1);
		if (!next) {
			return node;
		}
		node = next;
	}
	return node;
}

/** The newest turn with no children: where the story was last left, anywhere in the tree. */
export function newestLeaf<Node extends TreeNode>(index: TreeIndex<Node>): Node | undefined {
	let newest: Node | undefined;
	for (const node of index.byId.values()) {
		if ((index.children.get(node.id)?.length ?? 0) > 0) {
			continue;
		}
		if (!newest || olderFirst(newest, node) < 0) {
			newest = node;
		}
	}
	return newest;
}
