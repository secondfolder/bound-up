/**
 * The shape of a drawn tree, worked out from any parent/children data: which
 * nodes sit on the trunk, which grow off it as boughs, which continue a line
 * and which branch off it, which connectors to dim, and what folding a node
 * hides. Rendered by `components/tree/Tree.svelte`; see docs/tree.md.
 *
 * Pure and alias-free, so it can be tested without a DOM.
 */

export type TreeSource<T> = {
	roots: readonly T[];
	children: (node: T) => readonly T[];
	key: (node: T) => string;
	/**
	 * Which of a node's children carries its line straight on; every other
	 * child branches off it. Called with the roots and `null` for the trunk.
	 * Without it nothing continues a line: the trunk is bare and every child
	 * is a branch of its own (the roadmap's shape).
	 */
	main?: (children: readonly T[], parent: T | null) => T | undefined;
	/** Filtered out: still drawn, but dimmed, along with what leads only to it. */
	hidden?: (node: T) => boolean;
};

/** One node, in its place on a line. */
export type LaidNode<T> = {
	node: T;
	key: string;
	/** 0 on the trunk, 1 on a bough, one more for every branch further out. */
	depth: number;
	/** The first node of a branch (a bough or an elbow leads to it), rather than one further down a line. */
	start: boolean;
	/** The branches growing off this node. On the trunk, these are boughs. */
	forks: LaidBranch<T>[];
	/** Every node under this one, whichever line it is on. */
	descendants: number;
	/** What folding this node hides, counted: see `foldCount`. */
	folds: number;
	hidden: boolean;
	/** This node and everything under it are hidden. */
	allHidden: boolean;
	dim: {
		/**
		 * The line on down from this node's marker: to its forks and to the
		 * next node on its line. Dimmed when all of that is hidden.
		 */
		below: boolean;
		/** The line from the node before on this line down to this one. Dimmed when this node and everything after it are hidden. */
		into: boolean;
		/** The line past this node's forks to the next node on its line. Dimmed when everything after it is hidden. */
		through: boolean;
	};
};

/** A branch: a line of nodes, each a main child of the one before. */
export type LaidBranch<T> = {
	key: string;
	depth: number;
	line: LaidNode<T>[];
	/** Everything on and under this branch is hidden. */
	allHidden: boolean;
	dim: {
		/** The vertical from the line above down to where this branch's elbow bends off. */
		above: boolean;
		/** The elbow (or, on a bough, the bough itself) into this branch. */
		elbow: boolean;
		/** The vertical on past this branch to the next one beside it. */
		onward: boolean;
	};
};

/** What `Tree` tells the snippet that draws a node. */
export type TreeNodeContext = {
	depth: number;
	/** On the trunk itself, rather than on a branch off it. */
	onTrunk: boolean;
	/** Filtered out: the node's own marker and text should be dimmed. */
	hidden: boolean;
	/** It and everything under it are filtered out. */
	allHidden: boolean;
	/** Folded: what it hides is not on screen. */
	folded: boolean;
};

export type TreeLayout<T> = {
	/** Boughs from roots that are not on the trunk; drawn before the trunk's first node. */
	crown: LaidBranch<T>[];
	/** The nodes on the trunk, root first. Empty when nothing continues a line. */
	trunk: LaidNode<T>[];
	/** Every node by key, with what the reveal rule needs to walk back up. */
	byKey: ReadonlyMap<string, { laid: LaidNode<T>; parent: string | null; onLine: boolean }>;
};

export function layoutTree<T>(source: TreeSource<T>): TreeLayout<T> {
	const { children, key } = source;
	const isHidden = source.hidden ?? (() => false);
	const byKey = new Map<string, { laid: LaidNode<T>; parent: string | null; onLine: boolean }>();
	const pickMain = (kids: readonly T[], parent: T | null) => {
		const picked = source.main?.(kids, parent);
		return picked !== undefined && kids.includes(picked) ? picked : undefined;
	};

	// Bottom-up facts about every node, once each: a long story calls this
	// for hundreds of turns, so nothing is re-walked per stretch of line.
	const facts = new Map<T, { descendants: number; allHidden: boolean }>();
	function factsOf(node: T): { descendants: number; allHidden: boolean } {
		const known = facts.get(node);
		if (known) {
			return known;
		}
		// Iteratively, deepest first: a single line hundreds of turns long
		// would overflow the stack recursing.
		const stack: [T, boolean][] = [[node, false]];
		while (stack.length > 0) {
			const top = stack.pop();
			if (!top) {
				break;
			}
			const [at, expanded] = top;
			if (facts.has(at)) {
				continue;
			}
			const kids = children(at);
			if (!expanded) {
				stack.push([at, true]);
				for (const kid of kids) {
					if (!facts.has(kid)) {
						stack.push([kid, false]);
					}
				}
				continue;
			}
			let descendants = 0;
			let allHidden = isHidden(at);
			for (const kid of kids) {
				const kidFacts = facts.get(kid) ?? { descendants: 0, allHidden: true };
				descendants += kidFacts.descendants + 1;
				allHidden &&= kidFacts.allHidden;
			}
			facts.set(at, { descendants, allHidden });
		}
		return facts.get(node) ?? { descendants: 0, allHidden: isHidden(node) };
	}

	/** Lays out the line that starts at `first`, and everything off it. */
	function layLine(first: T, depth: number, parent: string | null): LaidNode<T>[] {
		const line: LaidNode<T>[] = [];
		let at: T | undefined = first;
		let parentKey = parent;
		while (at !== undefined) {
			const node: T = at;
			const kids = children(node);
			const next = pickMain(kids, node);
			const nodeKey = key(node);
			const { descendants, allHidden } = factsOf(node);
			const laid: LaidNode<T> = {
				node,
				key: nodeKey,
				depth,
				start: line.length === 0,
				forks: [],
				descendants,
				folds: 0,
				hidden: isHidden(node),
				allHidden,
				dim: { below: false, into: false, through: false }
			};
			byKey.set(nodeKey, { laid, parent: parentKey, onLine: line.length > 0 });
			laid.forks = layForks(
				kids.filter((kid) => kid !== next),
				depth + 1,
				nodeKey
			);
			line.push(laid);
			parentKey = nodeKey;
			at = next;
		}
		// Dimming along the line, from the end back.
		let afterHidden = true;
		for (let index = line.length - 1; index >= 0; index -= 1) {
			const laid = line[index];
			if (!laid) {
				continue;
			}
			const forksHidden = laid.forks.every((fork) => fork.allHidden);
			laid.dim.through = afterHidden;
			laid.dim.below = forksHidden && afterHidden;
			laid.dim.into = laid.hidden && laid.dim.below;
			afterHidden = laid.dim.into;
			laid.folds = laid.start
				? laid.descendants
				: laid.forks.reduce((sum, fork) => sum + branchSize(fork), 0);
		}
		return line;
	}

	function layForks(heads: readonly T[], depth: number, parent: string | null): LaidBranch<T>[] {
		const branches = heads.map((head): LaidBranch<T> => {
			const line = layLine(head, depth, parent);
			return {
				key: key(head),
				depth,
				line,
				allHidden: factsOf(head).allHidden,
				dim: { above: false, elbow: false, onward: false }
			};
		});
		let onwardHidden = true;
		for (let index = branches.length - 1; index >= 0; index -= 1) {
			const branch = branches[index];
			if (!branch) {
				continue;
			}
			branch.dim.onward = onwardHidden;
			branch.dim.elbow = branch.allHidden;
			branch.dim.above = branch.allHidden && onwardHidden;
			onwardHidden = branch.dim.above;
		}
		return branches;
	}

	const trunkRoot = pickMain(source.roots, null);
	const crown = layForks(
		source.roots.filter((root) => root !== trunkRoot),
		1,
		null
	);
	const trunk = trunkRoot === undefined ? [] : layLine(trunkRoot, 0, null);
	for (const laid of trunk) {
		// The trunk never dims, and its first node starts nothing it could
		// fold away: folding a node on it folds only its boughs.
		laid.start = false;
		laid.dim = { below: false, into: false, through: false };
		laid.folds = laid.forks.reduce((sum, fork) => sum + branchSize(fork), 0);
	}
	return { crown, trunk, byKey };
}

/** Every node on a branch and under it. */
function branchSize<T>(branch: LaidBranch<T>): number {
	const [first] = branch.line;
	return first ? first.descendants + 1 : 0;
}

/**
 * The keys that must not be folded, so that every key in `reveal` is on
 * screen. A node at the start of a branch hides everything under it; any
 * other node hides only what branches off it, so it is forced open only when
 * the way to a revealed node leaves its line.
 */
export function forcedOpen<T>(layout: TreeLayout<T>, reveal: readonly string[]): Set<string> {
	const open = new Set<string>();
	for (const target of reveal) {
		let child = layout.byKey.get(target);
		while (child && child.parent !== null) {
			const parent = layout.byKey.get(child.parent);
			if (!parent) {
				break;
			}
			// The child is on its parent's line unless it starts a branch.
			if (parent.laid.start || !child.onLine) {
				open.add(child.parent);
			}
			child = parent;
		}
	}
	return open;
}

/**
 * A `main` that follows the longest path: the child with the most
 * generations under it. `prefer` breaks a tie, best first. Heights are
 * worked out once per call, so make one per change to the data.
 */
export function longestChild<T>(
	children: (node: T) => readonly T[],
	prefer: (a: T, b: T) => number = () => 0
): (kids: readonly T[]) => T | undefined {
	const heights = new Map<T, number>();
	function height(node: T): number {
		const known = heights.get(node);
		if (known !== undefined) {
			return known;
		}
		// Iteratively, like the facts in layoutTree, for very long lines.
		const stack: [T, boolean][] = [[node, false]];
		while (stack.length > 0) {
			const top = stack.pop();
			if (!top) {
				break;
			}
			const [at, expanded] = top;
			if (heights.has(at)) {
				continue;
			}
			const kids = children(at);
			if (!expanded) {
				stack.push([at, true]);
				for (const kid of kids) {
					if (!heights.has(kid)) {
						stack.push([kid, false]);
					}
				}
				continue;
			}
			heights.set(at, 1 + Math.max(0, ...kids.map((kid) => heights.get(kid) ?? 0)));
		}
		return heights.get(node) ?? 1;
	}
	return (kids) => {
		let best: T | undefined;
		for (const kid of kids) {
			if (
				best === undefined ||
				height(kid) > height(best) ||
				(height(kid) === height(best) && prefer(kid, best) < 0)
			) {
				best = kid;
			}
		}
		return best;
	};
}
