# Tree

[Tree.svelte](../src/lib/components/tree/Tree.svelte) draws any
parent/children data as a tree in CSS: a bark trunk, boughs off it, and lines
and branches off those, joined by connectors that dim when what they lead to
is filtered out, and that fold. Two screens draw with it:

- **The roadmap** ([RoadmapTree.svelte](../src/lib/components/roadmap/RoadmapTree.svelte);
  see [roadmap.md](roadmap.md)): branches, leaves and twigs.
- **The daydream branch map**
  ([DaydreamBranchMap.svelte](../src/lib/components/DaydreamBranchMap.svelte);
  see [daydreams.md](daydreams.md#the-story-is-a-tree)): every way a story has
  gone, its longest path as the trunk.

The shape is worked out in [src/lib/tree.ts](../src/lib/tree.ts), which is
pure and alias-free, so the rules are unit-tested without a DOM. The component
renders what it returns.

## The model

A node has children. At most one child is its **main** child, which carries
its parent's line straight on; every other child **branches off**. The
consumer's `main(children, parent)` picks it, and is called with the roots and
`null` for the trunk.

- A **line** is a node and its chain of main children. Consecutive nodes on a
  line are joined by **chain links**: a straight segment from one marker down
  to the next.
- The **trunk** is the line that starts at the main root. Its nodes' markers
  are centred on the bark.
- A branch off the trunk, or a root that is not on it, is a **bough**: a
  straight bark connector from the trunk to its first node. Roots off the
  trunk form the **crown**, drawn above the trunk's first node.
- A branch anywhere deeper is an **elbow** off a thin **stem** under its
  parent's marker.
- Every branch is itself a line, so the same rule repeats inside it: its own
  main child runs straight on and its other children elbow off.

The branches off a node are drawn straight after it, before its line carries
on, so a fork reads next to the node it forks from.

Without a `main`, nothing continues a line: the trunk is bare, every root is
a bough and every child a branch of one node. That is the roadmap's shape.

**The longest path.** `longestChild(children, prefer)` is a ready-made `main`
that picks the child with the most generations under it, breaking ties with
`prefer`, then by order. Heights are computed once per call, iteratively, so
a story hundreds of turns long neither re-walks itself nor overflows the
stack. Make a new one whenever the data changes, since it remembers heights.

## Drawing

Every connector is a border or background on the element it leads to, so
none can drift out of line, the markup is ordinary nested lists that read in
order without the picture, and the whole tree renders on the server. The
consumer renders each node through the `content` snippet, with its marker at
the inline-start; Tree wraps it in a positioned `.tree-node`, which is what
the connectors hang from, and puts the fold toggle beside it.

- The **trunk** is a `::before` on the outer list, fading in at the crown.
- A **bough** is a `::before` on its first node, reaching `--tree-reach` from
  the trunk's centre to the marker.
- Each **branch off a line** is drawn as three stretches, so each can be
  dimmed on its own:
  - **above** (the branch item's `::before`): the vertical from the line
    above down to where this branch's elbow bends off. It leads to this
    branch and every one after it.
  - **elbow** (the first node's `::before`): the bend, and the run across to
    the marker. It leads to this branch only.
  - **onward** (the item's `::after`, all but the last): the vertical from
    the bend on down to the next branch.
- A line of more than one node adds three more:
  - **below** (a node's `::after`): from the lower edge of its marker down
    past its text, to its forks or the next node. It is also the stem the
    node's forks hang from. It starts at the lower edge rather than the
    centre because a positioned pseudo-element on the node paints over the
    marker.
  - **through** (the forks list's `::before`): past the forks, when the line
    carries on after them.
  - **into** (a later node's step `::before`): down to its marker's centre,
    under the marker.

Each stretch overlaps the next by a pixel, and a bend overlaps the vertical it
leaves, so no join shows a hairline seam. That is only sound because a hidden
stretch is drawn solid and underneath (see Dimming).

- **Elbows end on a marker's edge and go no further.** The elbow is placed
  against the node, which starts exactly one indent in, and is exactly one
  indent wide; the positioned node paints its marker over it.
- **Every `li` has its margin zeroed.** Web Awesome's native styles indent
  each one by `1.125em`, which left the right-hand boughs 18px short of the
  trunk and set every line 18px off the centre of what it hangs from.
- Connectors colour all four border sides and set only the drawn ones'
  widths, so a bough the packing moves to the other side of the trunk changes
  widths, not colours. With one side set, the other's colour was
  `currentColor`, and every moved line faded in from the text's cream.

### Sizes

A consumer sets public custom properties, which Tree reads into private
`--_*` ones so its defaults never need out-specifying. The defaults are the
roadmap's.

Per depth, read on each `.tree-branch[data-depth]` (and `.trunk-step` for the
trunk's nodes), so a value set on a depth is inherited by the depths under it:

| Property             | Default      | Meaning                                              |
| -------------------- | ------------ | ---------------------------------------------------- |
| `--tree-marker-size` | `1.25rem`    | The marker's width and height                        |
| `--tree-marker-y`    | `0.5lh`      | How far down the node the marker's centre is         |
| `--tree-gap`         | `0.9rem`     | Space above each branch off a line                   |
| `--tree-step-gap`    | `--tree-gap` | Space between consecutive nodes on a line            |
| `--tree-indent`      | `1.5rem`     | How far a branch sits in from the line it elbows off |

`0.5lh` is where a marker slot one line tall centres it, so the elbow meets
the marker whatever the font size. The roadmap's branch head sets it to half
its icon instead.

Anywhere above the tree: `--tree-line`, `--tree-line-color`, `--tree-bark`,
`--tree-trunk-width`, `--tree-bough-width`, `--tree-reach`,
`--tree-trunk-gap`, `--tree-trunk-x`, `--tree-trunk-pad-start` and `-end`,
`--tree-elbow-radius` and `--tree-dim-opacity`. The daydream's drawer sets a
slimmer set of all of these.

### Packing

With `spread`, on a screen 720px wide or more, the trunk runs up the middle
and the boughs sit either side of it, the left-hand ones mirrored with logical
properties. Tree puts `data-side` on each bough and sets `--tree-row`
(`row-reverse`), `--tree-justify` and `--tree-flip` on a mirrored one, for
the consumer's node content to follow; mirroring that content is the
consumer's job.

Tree measures the boughs and places them itself. Each side is packed as its
own column, with the same gap between every pair of boughs on that side. Each
bough, in order, goes on whichever side is shorter so far, and the left side
starts a little lower so the first two step up the trunk. CSS cannot do this
with the boughs kept in reading order:

- A shared grid ties the two sides' rows together, so a tall bough on one side
  opens an arbitrary gap on the other.
- Two separate lists would read in a different order, to a screen reader and
  the keyboard, from the one a phone shows.

Strict alternation was tried first, and left one side of the roadmap over
1000px longer than the other. A `ResizeObserver` re-packs when a bough's size
changes: a font loading, a resize, or a bough folding. Until the script runs
(without JavaScript, or before hydration), a CSS grid stands in: each bough
spans two rows (`--row`) and the next starts a row later on the other side.

**Packing needs a bare trunk.** `spread` is ignored when the trunk has nodes
on it, since their text would run into the boughs either side. The daydream's
map never sets it, and a drawer is too narrow for it anyway.

## Dimming

`hidden(node)` marks a node as filtered out (the roadmap's legend). It is
still drawn, so the tree keeps its shape, at one of exactly two levels, full
and `--tree-dim-opacity` (0.3):

- **A hidden node's marker and text are dimmed**, by the consumer, from the
  snippet's `hidden` flag. The node element itself is not dimmed, since the
  tree draws connectors on it, and those follow their own rule.
- **A stretch of connector is dimmed only when everything it leads to is
  hidden.** A hidden node with a shown child keeps the line into it at full
  strength, because that line is the child's way to the trunk too.
  - above: this branch and every one after it are wholly hidden;
  - elbow, and a bough: this branch is wholly hidden;
  - onward: every branch after it is wholly hidden;
  - below: the node's forks and the rest of its line are wholly hidden;
  - through: the rest of the line is wholly hidden;
  - into: this node and the rest of its line are wholly hidden.
- **The trunk never dims.** It carries everything.

The flags come from the data, not from what is showing, so folding changes
none of them. The snippet's `allHidden` says a node and everything under it
are hidden, which is when the roadmap dims a branch head.

Markers and text fade with opacity, set on the marker and the text rather
than on anything that contains another dimmed part, so it never compounds.
Connectors cannot fade that way, because they overlap where they join, and
two translucent lines over each other add up to a third, darker level; a
translucent hidden line drawn over a shown one also left a notch at the join.
So a hidden connector is instead:

- **solid**, in the line's colour (or the bark's, for a bough) mixed 30% into
  `--page-wash-floor`, in sRGB, which is how the browser composites opacity.
  It matches a translucent line wherever the page behind is the wash's flat
  floor.
- **underneath** (`z-index: -1`, inside the tree's own stacking context).
  Where it joins a shown stretch, the shown one is on top, so a hidden sibling
  lower down is never drawn over the branch of a shown one above it.

## Folding

Any node with something under it can fold, unless `collapsible(node)` says
otherwise.

- **What folds.** Folding a node hides the branches that fork from it. If the
  node *starts* a branch (a bough, or a node an elbow leads to), the rest of
  its own line folds too, so the whole branch folds to its first node. A node
  further down a line folds only its forks, and the line carries on; so does a
  node on the trunk, so the trunk always runs to the end.
  - On the roadmap, a branch head folds its leaves and a leaf folds its twigs.
  - In the daydream, a side branch folds to its first turn, and a trunk turn
    folds the forks off it.
- **The toggle** sits beside the node, outside the consumer's snippet. It is a
  native `<button aria-expanded aria-controls>`, because `wa-button` forwards
  no ARIA state. Its icon is a chevron; folded, it also shows how many nodes
  are hidden ("+12"), and its accessible name is "Show 12 more under …" or
  "Hide 12 under …", from the consumer's `label(node)`.
- **State.** `collapsed` is a bindable `SvelteSet` of keys, in memory only.
  `initiallyCollapsed(node)` folds a node the first time it appears, and
  unfolding it then sticks. Both screens start fully open, so server-rendered
  and no-JavaScript output is the whole tree.
- **Reveal.** Whatever would fold a key in `reveal` out of sight is held
  open, and its toggle disabled (`forcedOpen`). A node further down a line is
  held open only when the way to the revealed node leaves its line by one of
  its forks. The roadmap reveals the item its drawer shows, so a deep link
  opens its branch; the daydream reveals the turn being read.
- **Folded content is not rendered** (`{#if}`), which keeps a large story's
  map cheap. The stem under a folded node goes with its children; the above
  and onward stretches are unaffected.

## Tests

- **Rules:** [tree.test.ts](../src/lib/tree.test.ts): a bare trunk and one
  with nodes, the crown, fold counts, dim flags at depth and on chain links,
  `forcedOpen`, and `longestChild`'s tie-breaks.
- **Geometry:** [Tree.svelte.test.ts](../src/lib/components/tree/Tree.svelte.test.ts)
  renders a synthetic tree through
  [TreeHarness.svelte](../src/lib/testing/TreeHarness.svelte) and measures:
  trunk nodes centred on the trunk, boughs and chain links ending on markers,
  markers over their lines, dimming, and folding and reveal.
- The roadmap's and the branch map's own tests cover what each puts on the
  tree: packing balance, the head and leaf stems, legend dimming, and the
  longest-path trunk.
