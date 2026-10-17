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

[RoadmapTree.svelte](../src/lib/components/roadmap/RoadmapTree.svelte) draws
the roadmap with the generic [Tree](tree.md), which owns the trunk, the
boughs, the connectors, packing, dimming and folding; this section covers
only what the roadmap puts on it.

- **Shape.** No `main`, so the trunk is bare: each branch is a bough, its
  head the bough's node, and leaves and twigs elbow off the head's and the
  leaf's stems. The markup is an `<ol>` of branches with a list of leaves in
  each and of twigs under a leaf.
- **Sizes.** `RoadmapTree` sets the per-depth custom properties: a branch
  head's marker is its 2.75rem icon, centred half the icon down; a leaf's is
  1.25rem and a twig's 0.85rem, each centred `0.5lh` down.
  [RoadmapNode.svelte](../src/lib/components/roadmap/RoadmapNode.svelte)
  sizes its marker from `--tree-marker-size` and centres it in a slot one
  line tall, so marker and elbow agree, and follows `--tree-row` and
  `--tree-justify` so a mirrored bough keeps its marker on the trunk side.
- **Layout.** On a phone the trunk runs down the left gutter and every branch
  grows to the right. From 720px the trunk is centred and the boughs are
  packed either side of it (`spread`; see [tree.md](tree.md#packing)).
- **Folding.** A branch head folds its leaves and a leaf with twigs folds
  them. The page passes the item the drawer shows as `reveal`, so following
  a fragment to an item inside a folded branch opens it.

**Status** is shown three ways: by the marker's shape (a filled disc with a
tick, half-filled and gently pulsing, an outline, a half-transparent outline
with "?"), by a status word, and by colour. It is never shown by colour alone.
The pulse stops under `prefers-reduced-motion`.

**The legend** above the tree doubles as a filter. Its toggles are native
`<button aria-pressed>`, because `wa-button` does not forward ARIA state.
Switching a status off dims its nodes rather than removing them, so the tree
keeps its shape. `RoadmapTree` tells Tree an item is hidden when the legend
hides its status, and that a branch, which has no status, always is, so a
branch head and its bough and stem dim only when everything in the branch is
hidden. How each stretch of connector dims, and why hidden ones are drawn
solid and underneath, is in [tree.md](tree.md#dimming).

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
in [Tree](tree.md#packing). Dependencies
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
  browser tests. `RoadmapTree`'s cover the legend's dimming of real items,
  packing balance, the head and leaf stems and folding; the tree's own
  geometry is tested with Tree (see [tree.md](tree.md#tests)).
  The page test, `src/routes/(public)/roadmap/page.svelte.test.ts`, covers the
  fragment-driven drawer and the legend.
- **End to end:** [e2e/roadmap.spec.ts](../e2e/roadmap.spec.ts) covers:
  - public access;
  - going from a landing page tile to an open drawer;
  - a direct fragment, and closing it;
  - following a prerequisite link;
  - no sideways scroll on a phone, with a bottom sheet.
