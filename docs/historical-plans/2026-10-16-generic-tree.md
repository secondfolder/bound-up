# Generic Tree component, shared by the roadmap and the daydream branch map

## Context

`RoadmapTree.svelte` draws a real tree in CSS: a bark trunk, boughs packed
either side of it on wide screens, branch heads, and leaves and twigs joined by
elbow connectors that dim stretch by stretch when the legend hides things. The
daydream branch map (`DaydreamBranchMap.svelte`) is a plain indented outline.
The goal is one generic `Tree` component that holds all of the drawing (trunk,
boughs, packing, connectors, dimming) and collapsing, and that both screens
use.

Decisions taken with the user:
- **The whole tree is generic, including the trunk** (and boughs, packing and
  ground), not just the leaf and twig connectors.
- **In the daydream, the trunk is the story's longest path.** Each run of turns
  is a straight line with its turns on it. At a fork the longest child carries
  the line on, and every other child grows off it as a side branch. The same
  rule applies recursively inside each side branch.

## Workflow

- Work in a separate git worktree on a new branch (`EnterWorktree`, branch
  `feat/generic-tree`), so `main` and its uncommitted `src/lib/daydream.ts`
  change stay untouched.
- Commit there with conventional messages (`feat(tree): …`,
  `refactor(roadmap): …`, `feat(daydreams): …`).
- Once the full verification loop passes in the worktree, merge the branch
  into `main` (fast-forward if possible), then remove the worktree. The
  uncommitted `src/lib/daydream.ts` change on `main` does not conflict with
  the files this touches. If a merge would touch it, stop and ask.

## The model (one rule covers both)

A node has children. At most one child is the **main** child, which continues
its parent's line straight on. Every other child **branches off**:
- At the top level a child branching off is a **bough**: a straight bark
  connector from the trunk.
- Deeper down it is an **elbow** off a thin stem under its parent's marker.

The **trunk** is the line of main children starting from the roots. When there
is no main root, the trunk has no nodes on it and every root is a bough.

- **Roadmap:** `main` is never set. The trunk is bare, the branches are boughs
  (the head is the bough's node), the leaves are elbows off the head's stem,
  and the twigs are elbows off the leaf's stem. It looks exactly as it does
  today.
- **Daydream:** `main` picks the child with the deepest subtree. Ties go to the
  child on `story.path`, then to the newest by `createdAt`. That produces the
  longest-path trunk with the turns on it. Side branches are drawn straight
  after the turn they fork from, before the trunk carries on. A side branch's
  own longest path runs straight, and its forks are elbows.

## Collapsing (part of the generic tree, used by both)

- **What folds.**
  - Collapsing a node hides the side branches that fork from it.
  - When the node *starts* a branch (a bough or an elbowed child rather than
    a node further down a line), the rest of its own line folds as well, so
    the whole branch folds to its first node.
  - A node on the trunk only folds its side branches, and the trunk always
    carries on.
  - On the roadmap, a head folds its leaves and a leaf folds its twigs. In the
    daydream, a side branch folds to its first turn, and a trunk turn folds
    the forks off it.
- **The toggle.**
  - Tree renders it beside every node that has something to fold, outside
    the consumer's snippet. It is a native `<button aria-expanded
    aria-controls>`, because `wa-button` forwards no ARIA state; a comment at
    the site says so.
  - Its icon is a chevron. When the node is collapsed, the button also shows
    how many nodes are folded away ("+12"), and its accessible name says
    "Show 12 more under …" or "Hide …".
  - `collapsible?: (node) => boolean` lets a consumer opt nodes out.
- **State.**
  - `collapsed` is a bindable set of keys. `initiallyCollapsed?: (node) =>
    boolean` sets the default.
  - Both consumers start fully expanded, so server-rendered and no-JS output
    is the whole tree.
  - The state is kept in memory only.
- **Revealing.** Every ancestor of a key in `reveal?: readonly string[]` is
  forced open, which keeps a target from being folded out of sight.
  - The roadmap passes the URL fragment's node, so a deep link or the
    details drawer opens its branch.
  - The daydream passes `story.activeTurnId`, so the current turn is always
    visible.
- **Rendering.** Folded content is not rendered (`{#if}`). That keeps a large
  story's map cheap.
  - The stem under a folded node goes with its children.
  - The `above` and `onward` stretches are unaffected.
  - Dim flags still come from the data, not from what is showing.
  - The packing `ResizeObserver` already re-packs boughs when one changes
    height.

## Files

**New: `src/lib/tree.ts`.** Pure and alias-free; it is the `run()`/`dimmed()`
logic, lifted out and generalised.
- `layoutTree<T>({ roots, children, key, main })` returns a render model.
  - The trunk is a sequence of `{ kind: 'node' | 'bough' }` entries.
  - Each branch holds its `line` (the chain of main children) and, per node on
    the line, the side branches that fork from it.
- `longestChild(children, …)` is the daydream's `main`: it computes subtree
  depths once (O(n)) and applies the tie-break above.
- The dimming flags generalise the current rules from two levels to any depth.
  - A node is "all hidden" when it and its whole subtree are hidden.
  - The `above`, `elbow`, `onward` and `stem` stretches dim exactly as now.
  - A chain link between two nodes on a line dims when everything from the
    lower node on is hidden.
  - A bough dims when its whole subtree is hidden. The trunk never dims.
- For collapsing:
  - `foldedBy(model, collapsed, reveal)` gives what each collapsed node
    hides, and how many nodes that is.
  - `ancestorsOf(key)` serves `reveal`.
- Unit tests in `src/lib/tree.test.ts` (node project) cover the collapse
  model, the reveal override and the counts, and also:
  - the trunk with no main child (the roadmap) and with one (the daydream);
  - longest-path tie-breaks and several roots;
  - dim flags at depth 3+ and on chain links.

**New: `src/lib/components/tree/Tree.svelte`** (plus a recursive
`TreeBranch.svelte` if a snippet gets unwieldy).
- Generic `T` props:
  - `roots`, `children`, `key`
  - `main?`
  - `hidden?: (node) => boolean`
  - `spread?: boolean`: two-sided packing on wide screens
  - `node: Snippet<[T, { depth; onTrunk; hidden; allHidden; side }]>`
  - `ground?: boolean`
  - `collapsed` (bindable), `initiallyCollapsed?`, `collapsible?` and
    `reveal?` (see Collapsing)
- Moves in from `RoadmapTree.svelte`, together with their why-comments:
  - the CSS (trunk `::before`, bough, stem, the three-stretch elbows, dimming
    drawn solid at `z-index: -1`, mirrored start-side rules);
  - the packing `$effect`;
  - the staggered-grid fallback.
- New in it:
  - **Chain links:** a straight segment from one marker to the next on a line.
  - **Nodes on the trunk:** their marker is centred on the trunk's x.
  - **Per-depth metrics** as CSS custom properties that consumers set on
    `[data-depth]`: `--tree-marker-size`, `--tree-marker-y` (default `0.5lh`;
    the roadmap head uses half its icon), `--tree-gap`, `--tree-indent`,
    `--tree-line`, `--tree-trunk-width`, `--tree-line-color` and `--tree-bark`.
    The roadmap's current values are the defaults.
- `spread` packing applies only to a trunk with no nodes on it (documented in a
  comment). The daydream never sets it, and a drawer is too narrow for it.
- The consumer renders the marker inside its snippet, at the node's
  inline-start, sized by `--tree-marker-size`. The tree wraps each snippet in
  its own positioned `.tree-node` and hangs the elbows on that.
- Tree puts `data-side` on each bough. Mirroring a node's *content* (as
  `RoadmapNode` does with `row-reverse`) stays with the consumer. Tree exports
  the spread breakpoint so the consumer does not duplicate it.

**`src/lib/components/roadmap/RoadmapTree.svelte`** becomes a thin wrapper.
- It passes `roots = branches` and `children` (branch → items, item → twigs).
- `hidden`: a branch is always `true` (it has no status), and an item is
  hidden when the legend hides its status.
- It turns on `spread` and `ground`.
- Its snippet renders the branch head at depth 1 using `allHidden` (which
  gives today's `dim-all`), and `RoadmapNode` deeper down.
- Its CSS keeps only the head's look and the per-depth metric values.

**`RoadmapNode.svelte`** reads `--tree-marker-size`, not its own
`--marker-size`, so there is one source.

**`DaydreamBranchMap.svelte`** keeps the drawer, labels, jump and carry-on
logic, and the `ensureLoaded` effect. It drops its own `run()` and nested
lists and renders `<Tree roots={story.children(null)} children={(n) =>
story.children(n.id)} main={longestChild…}>`.
- Its node snippet has a small marker:
  - filled when the turn is on `story.path`;
  - an accent ring for `activeTurnId`;
  - a bookmark icon when the turn is marked.
- Beside the marker are today's label `<button>` and the "carry on"
  `wa-button`.
- It sets smaller sizes for the drawer: thinner bark and a small indent.

## Tests

- **`src/lib/components/tree/Tree.svelte.test.ts`** (browser) covers the
  generic geometry, using a synthetic tree four deep with chains and forks:
  - every connector ends on a marker's edge;
  - chain links join marker centres;
  - trunk nodes centre on the trunk;
  - stems meet the first child;
  - mirrored boughs under `spread`;
  - dimming at two levels only;
  - collapsing: the toggle folds and unfolds, `aria-expanded` and the count
    are right, a branch start folds its line while a trunk node keeps the
    trunk, connectors still end on markers when folded, `reveal` forces
    ancestors open, and a folded bough re-packs.

  It moves the structural assertions from `RoadmapTree.svelte.test.ts` here.
- **`RoadmapTree.svelte.test.ts`** is updated to the new class names
  (`.leaves > li` and `.twigs > li` become the tree's item selectors). It
  keeps the roadmap-specific checks: legend dimming of real items, the branch
  head dimming, packing balance, and the head and leaf stem alignment. A new
  check makes sure a fragment inside a collapsed branch opens it.
- **A new `DaydreamBranchMap.svelte.test.ts`** checks, against a fake `story`:
  - the longest path renders as the trunk, and side branches come straight
    after their fork turn;
  - picking a turn calls `showBranch`, and carry-on calls `rewindTo`;
  - the current turn and bookmarks are marked;
  - the active turn is never folded away.
- **e2e:** `e2e/daydreams.spec.ts` (the "Branches" step around line 160) must
  still pass. Adjust its locators if they relied on the old outline. No new
  spec, because nothing new needs a whole page.

## Docs and housekeeping

- **New `docs/tree.md`:** the model (main child, boughs, elbows, chain links),
  the per-depth custom properties, packing and its no-trunk-nodes limit, and
  the dimming rules, and collapsing (what folds, the toggle, `reveal`). The
  drawing material moves out of the "The tree" section of
  `docs/roadmap.md`, which keeps the legend and status specifics and links
  across.
- Add it to the feature-doc table in `AGENTS.md`, and add
  `src/lib/components/tree/` and `src/lib/tree.ts` to the repo map.
- Update the branch-map bullet in `docs/daydreams.md`: the trunk is the
  longest path, with the tie-break.
- Copy this plan to `docs/historical-plans/2026-10-16-generic-tree.md`.
- No migration, and no roadmap.json change unless an entry for the branch map
  exists. Check `src/lib/roadmap/roadmap.json`.
- Leave the unrelated uncommitted change in `src/lib/daydream.ts` untouched.

## Verification

1. `npm run check`, `npm run lint`, and `npm test` (vitest node + browser, then
   Playwright).
2. Open `/roadmap` and the landing teaser with the `run` skill or `npm run
   dev`, and compare with `main` by screenshot at phone and wide widths.
   Toggle each legend status, and confirm the boughs pack and the mirrored
   side looks the same. Collapse a branch head and a leaf, check that the
   boughs re-pack, and open a `#fragment` inside a collapsed branch.
3. Open a daydream that has forks inside forks, then open Branches:
   - the longest path is the trunk;
   - side branches sit right after their fork turn;
   - jump and carry-on still work;
   - folding a side branch and a trunk turn's forks works, and the active
     turn's branch stays open.
