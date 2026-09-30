# Roadmap

`/roadmap` is a public page showing what Bound Up has shipped and what is
coming, drawn as a tree growing up a trunk. The landing page `/` carries a
teaser for it: a few featured upcoming items, the most recently shipped ones,
and a link to the whole thing. Loosely inspired by
[Up's Tree](https://up.com.au/tree/), whose status vocabulary it borrows.

## The data

Everything lives in [src/lib/roadmap/roadmap.json](../src/lib/roadmap/roadmap.json),
read and validated by [src/lib/roadmap/index.ts](../src/lib/roadmap/index.ts).
There is no database table: the roadmap changes with the code, in a commit.

Three levels, and no more:

- A **branch** is a category (Sessions, Notebook, Partners…): `id`, `title`,
  `summary`, `icon`, `items`.
- A **leaf** is a feature: `id`, `title`, `summary`, `status`, and optionally
  `icon`, `notes`, `featured`, `shippedOn`, `dependsOn`, `children`.
- A **twig** is a piece of a leaf, with a leaf's fields except `children`.

| Field       | Meaning                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| `id`        | Kebab-case, unique across the whole file, branches included. It is the URL fragment |
| `status`    | `shipped`, `in-progress`, `planned` or `exploring` (not yet committed to)           |
| `summary`   | One user-facing sentence. Shown on the tree (clamped) and in the drawer             |
| `notes`     | Short bullets, shown only in the drawer                                             |
| `icon`      | A Font Awesome name for `<wa-icon>`, solid variant. Twigs are drawn without one     |
| `featured`  | A candidate for the landing page's "Coming up" tiles                                |
| `shippedOn` | `YYYY-MM-DD`. Drives "Recently added", newest first                                 |
| `dependsOn` | Ids of items this one needs first. The drawer shows them, and the reverse           |

The module parses the JSON with Zod when it loads, so a bad edit fails the
tests, `npm run check` and the dev server rather than rendering something
broken. The objects are strict (a misspelt key is an error, not ignored), and
`crossReferenceProblems()` adds the rules no single item can check:

- ids are unique, and so are **titles**. Every item is a link on `/roadmap`
  named by its title, and two links on one page must not share an accessible
  name.
- `shippedOn` is present exactly when `status` is `shipped`.
- A `featured` item has not shipped. "Coming up" is for things still to come,
  which is also what keeps its links distinct from "Recently added".
- Every `dependsOn` names an existing item, and there are no cycles, because
  the drawer's Needs first / Leads to trail would loop.

### Keeping it current

- **Shipping something:** set `status: "shipped"`, add `shippedOn`, and drop
  `featured` if it had it. It moves into "Recently added" on the landing page
  by itself.
- **Adding something:** give it a unique id and title, and put it under the
  branch a user would look for it in. User-facing copy only: implementation
  notes, library links and internal chores stay out of this file.
- Copy follows the app's rule that encryption is invisible to users: no
  "unlock", and no key or cipher language. "End-to-end encrypted" is fine as a
  feature name.

## The tree

[RoadmapTree.svelte](../src/lib/components/roadmap/RoadmapTree.svelte) renders
nested lists: an `<ol>` of branches, each with a `<ul>` of leaves, each with a
`<ul>` of twigs. The picture is drawn entirely in CSS:

- The **trunk** is a `::before` on the outer list.
- A **bough** is a `::before` on the branch heading, reaching from the trunk's
  centre (`--reach`).
- **Leaves and twigs** use the classic CSS tree, drawn as three stretches per
  item so that each can be dimmed on its own (see the legend, below):
  - **above** (the item's `::before`): the vertical from the line above down
    to where this item's elbow bends off;
  - **elbow** (the node's `::before`): the bend, and the run across to the
    marker;
  - **onward** (the item's `::after`, all but the last): the vertical from the
    bend down to the next item.

  Each overlaps the next by a pixel, and the bend overlaps the vertical it
  leaves, so no join shows a hairline seam. That is only sound because hidden
  stretches are drawn solid and underneath (see the legend, below). The elbow
  ends `0.5lh` down, and
  [RoadmapNode.svelte](../src/lib/components/roadmap/RoadmapNode.svelte)
  centres its marker in a slot one line tall, so the two meet whatever the
  font size.
- **Stems** join an icon or marker to the line under it. A branch head's text,
  and a leaf's summary, run longer than the icon or marker is tall, and the
  list below starts under the text. So the head's `::after`, and the `::after`
  of a leaf node that has twigs, draw a vertical from the icon's or marker's
  lower edge down to the list. They start at the lower edge rather than the
  centre because a positioned pseudo-element paints over the marker.
- **Elbows end on a marker's edge and go no further.** The elbow is placed
  against the node, which starts exactly one indent in, and is exactly one
  indent wide. When the elbow belonged to the item around the node, an
  unpositioned node let it draw across the marker's ring.
- **Every `li` has its margin zeroed.** Web Awesome's native styles indent each
  one by `1.125em`. That left the right-hand boughs 18px short of the trunk and
  set every line 18px off the centre of what it hangs from.

Every connector hangs off the element it joins, so none of them can drift out
of line, and the whole tree renders on the server. The component tests measure
the joins: bough to trunk, stem to icon, line through marker.

**Layout.** On a phone the trunk runs down the left gutter and every branch
grows to the right. From 720px the trunk is centred and the boughs sit either
side of it, the left-hand ones mirrored with logical properties.

On a wide screen, `RoadmapTree` measures the boughs and places them itself.
Each side is packed as its own column, with the same gap (the list's
`row-gap`) between every pair of boughs on that side. Each bough, in order,
goes on whichever side is shorter so far, and the left side starts a little
lower so the first two step up the trunk. CSS cannot do this with the boughs
kept in reading order:

- A shared grid ties the two sides' rows together, so a tall bough on one side
  opens an arbitrary gap on the other.
- Two separate lists would read in a different order, to a screen reader and
  the keyboard, from the one a phone shows.

Strict alternation was tried first, and left one side over 1000px longer than
the other. A `ResizeObserver` re-packs when a bough's size changes (a font
loading, a resize). Until the script runs (without JavaScript, or before
hydration), a CSS grid stands in: each bough spans two rows (`--row`) and the
next starts a row later on the other side.

**Status** is shown three ways: by the marker's shape (a filled disc with a
tick, half-filled and gently pulsing, an outline, a half-transparent outline
with "?"), by a status word, and by colour. It is never shown by colour alone.
The pulse stops under `prefers-reduced-motion`.

**The legend** above the tree doubles as a filter. Its toggles are native
`<button aria-pressed>`, because `wa-button` does not forward ARIA state.
Switching a status off dims its nodes rather than removing them, so the tree
keeps its shape.

There are exactly two levels, full and `--dim-opacity` (0.3):

- **A hidden item's marker and text are dimmed.** The node itself is not, since
  the tree draws connectors on it, and those follow their own rule.
- **A stretch of connector is dimmed only when everything it leads to is
  hidden.** For example, a hidden leaf with a shown twig keeps the elbow into
  it at full strength, because that elbow is the twig's way to the trunk
  too. Similarly, the vertical past a hidden twig stays full while a shown
  twig comes after it.
- **A branch head, and its bough and stem, dim only when the whole branch is
  hidden.** The trunk never dims.

Markers and text fade with opacity, which is set on the marker and the text
rather than on anything that contains another dimmed part, so it never
compounds. Connectors cannot fade that way, because they overlap where they
join, and two translucent lines over each other add up to a third, darker
level. A translucent hidden line drawn over a shown one also left a notch at
the join. So a hidden connector is instead:

- **solid**, in `--line-color-dim` (or `--bark-dim` for a bough). That is the
  line's colour mixed 30% into `--page-wash-floor`, in sRGB, which is how the
  browser composites opacity. It matches a translucent line wherever the page
  behind is the wash's flat floor, which is behind nearly all of the tree.
- **underneath** (`z-index: -1`, inside the tree's own stacking context).
  Where it joins a shown stretch, the shown one is on top, so a hidden
  sibling lower down is never drawn over the branch of a shown one above it.

Connectors colour all four border sides and set only the drawn ones' widths.
A bough that the packing moves to the other side of the trunk then changes
widths, not colours. With one side set, the other side's colour was
`currentColor`, and every moved line faded in from the text's cream on load.

`RoadmapTree` works out which stretches to dim (`dimmed()`). Its tests check
that nothing ends up at a third opacity or colour, and that every hidden
stretch is underneath.

### Why no graph library

The alternatives were weighed when this was built:

- **Up's own tree** is one hand-illustrated SVG with drag and pinch zoom.
  Every new item would need new artwork.
- **Svelte Flow with dagre or ELK** gives a real pan/zoom graph with drawn
  dependency edges. But it adds about 150KB, reads as a node editor, and
  pan-and-pinch is clumsy on a phone.
- **d3-hierarchy** would give a more organic tree, but it is all SVG, which
  makes accessibility, labels on a phone and SSR harder.

Letting the page scroll do the navigation avoids all of that. The one
measurement it needs, packing the boughs on a wide screen, is a few lines
in the component. Dependencies
between branches are listed in the drawer rather than drawn across the tree,
where they would cross everything.

## The drawer

Each node is an `<a href="#id" id="id">`, so it:

- scrolls to itself without JavaScript;
- can be linked to from anywhere (the landing page's tiles do exactly that);
- lets the back button close whatever it opened.

The page derives the selected item from `page.url.hash` and renders a
`wa-drawer` with [RoadmapDetails.svelte](../src/lib/components/roadmap/RoadmapDetails.svelte)
in it. The drawer is a side panel on wide screens and a bottom sheet under
720px. A fragment is never sent to the server, so the drawer only ever opens
after hydration. A fragment that names a branch just scrolls to it.

Closing the drawer uses `goto(resolve('/(public)/roadmap'), { replaceState: true, … })`,
**not** `replaceState` from `$app/navigation`. Shallow routing leaves
`page.url` as it was, so the fragment, and with it the drawer, would come
straight back.

## The landing page teaser

[RoadmapHighlights.svelte](../src/lib/components/roadmap/RoadmapHighlights.svelte)
is the "Coming Up" section: the first six `featuredUpcoming()` items as tiles,
and "See the full roadmap".
[RoadmapRecent.svelte](../src/lib/components/roadmap/RoadmapRecent.svelte) is
"Recently added", the four newest `recentlyShipped()`. It sits apart, under
the landing page's feature overview
([LandingFeatures.svelte](../src/lib/components/landing/LandingFeatures.svelte)),
because what has shipped belongs with what the app does rather than with what
is coming. Both are excluded from the landing page's effects capture, for the
reason given in [page-effects.md](page-effects.md).

## Tests

- **Data:** [roadmap.test.ts](../src/lib/roadmap/roadmap.test.ts) checks that
  the real file passes, has one broken tree per rule, and covers the
  selectors.
- **Components:** `RoadmapTree`, `RoadmapHighlights` and `RoadmapRecent` have
  browser tests.
  The page test, `src/routes/(public)/roadmap/page.svelte.test.ts`, covers the
  fragment-driven drawer and the legend.
- **End to end:** [e2e/roadmap.spec.ts](../e2e/roadmap.spec.ts) covers:
  - public access;
  - going from a landing page tile to an open drawer;
  - a direct fragment, and closing it;
  - following a prerequisite link;
  - no sideways scroll on a phone, with a bottom sheet.
