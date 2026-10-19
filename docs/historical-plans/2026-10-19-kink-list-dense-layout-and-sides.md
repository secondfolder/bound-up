# Kink list: a dense one-page list, two filters, and dom/sub contexts

## Context

These changes make the kink list faster to fill in and easier to scan. There
are four of them.

1. **One dense page.** Today each category opens a page of its own, and every
   kink is a card with seven wrapped text pills. Instead:
   - the whole list sits on one page, like
     https://adhesivecheese.github.io/kinklist/
   - categories are collapsible and start open
   - each kink takes one or two lines
   - answers are colour-coded dots, read against a key
2. **Two filters.** The single "Show kinks up to" select becomes two sliders:
   how intense, and how common. Every kink needs a **commonness** rating for
   this.
3. **Contexts on every row.** A kink with a role pair (Giving/Receiving, On
   me/On my partner, …) always shows both contexts, side by side. Compare
   already matches my side against my partner's opposite side.
4. **A dom/sub perspective.**
   - Each context, and each one-sided kink without a role pair, is rated
     dom-leaning, sub-leaning or neutral.
   - A "Your side" control hides whatever leans the other way.
   - **In a partner's view,** it starts from that partnership's "Who's in
     control": me → dom, them → sub, shared → both.
   - **On your own list,** it starts on both.
   - **One-sided kinks are rewritten as neutral kinks with contexts**
     wherever that's possible, as in Bratting → Brattiness, Giving/Handling.

Decisions made with the user:

- **Row layout:** the name is on the left and the dots are on the right.
- **Details:** they go behind a tap on the row.
- **Old category URLs:** deleted, not redirected.
- **The scale's name:** commonness.
- **The yes colours:** Curious, Like and Love are all green, getting stronger
  towards Love.

**Prerequisite.** The per-partner list is now committed (a1afe8c).
The version history is still uncommitted:
- `history.ts`
- the `kink_list_versions` migration
- `playroom/kink-list/history/`
- `paths.history`

This plan builds on it.
- Before starting, check `git status`, and ask you to commit the history
  work if it isn't committed yet, so these changes go in as a separate diff.
- Never revert or overwrite it.

## 1. Colour key and dots

### `AnswerScale.svelte`, rewritten

- **One native radio per level, as now,** so `checked`, keyboard arrows and
  the group semantics stay native. Each radio is drawn as a dot of about
  1.4rem, keeping a touch target of about 24px.
  - The radio's accessible name is still the level's word, through a visually
    hidden `<span>`.
  - It also has a `title` tooltip.
- **Unselected and selected:** an unselected dot is a ring in its level's
  colour, and a selected one is filled, with a check glyph.
- **Inherited:** a dashed ring. An inherited answer is never filled.
- **The "Like, from Spanking" caption and Clear** move into the row's open
  panel.
- **Colour is never the only cue.** Position on a fixed no → yes scale, the
  key and the tooltip all carry the meaning. Update the comment at the site.
- **Colour tokens:** add `--kink-level-*` tokens to `src/lib/theme.css`, built
  from Web Awesome's colour scales.

  | Level       | Colour                        |
  | ----------- | ----------------------------- |
  | Hard limit  | red                           |
  | Not for me  | orange                        |
  | Conditional | yellow                        |
  | Don't mind  | neutral grey                  |
  | Curious     | pale green, low saturation    |
  | Like        | mid green                     |
  | Love        | vivid, saturated bright green |

  Check the contrast against the surface. Make sure the three greens can be
  told apart by lightness alone, in a greyscale check.
- **Optional polish:** the same tokens as small markers in the Deck,
  `CompareView` and `SharedListView`.

### New `LevelKey.svelte`

- **What it is:** the seven dots with their words, in a compact wrapping row,
  `aria-hidden`.
- **Where it sits:** sticky at the top of the list (`position: sticky; top:
  0`), which works in both shells. It sits beside the "Your side" control and
  "Expand all / Collapse all".

## 2. The list on one page

### `KinkRow.svelte`: compact row

- **The closed row:** a grid of `name | dots`.
  - The name is a native `<button aria-expanded>` disclosure (AGENTS.md:
    wa-button forwards no ARIA state).
  - It carries a chevron, an "Intense"/"Extreme" badge, a note icon when
    there's a note, and "›N" when there are specifics.
  - On narrow screens the name wraps before the dots do.
- **A kink with no role pair:** one `<fieldset>`, legend = the kink's name.
- **A kink with a role pair** always shows both contexts.
  - **Wide screens (≥ about 640px):** two dot groups side by side, with the
    context name above each group, for example "Giving" and "Receiving".
  - **A phone:** the two groups stack on two indented lines, each labelled
    with its context.
  - **Each group is its own fieldset,** named "Spanking, giving", as today's
    split groups are.
  - **When "Your side" hides one context,** the row goes back to one group on
    one line, labelled with the context it shows.
- **Answers per side, always.** This is a breaking change, and allowed,
  because nothing is deployed.
  - A role kink's answer lives only in `sides.a` and `sides.b`.
  - A role-less kink's answer lives only in `level` and `detail`.
  - `listPayloadSchema` enforces it with a `superRefine`, against
    `kinkById`.
- **What goes away:**
  - The "Answer … separately" switch, `setSplit`, and `effectiveAnswer`'s
    fallback from a side to the whole-kink `level`.
- **What writes both sides instead:**
  - The Deck's "Both" choice.
  - The import's `combine` for a role kink with no side.
  - `compare.ts`, `history.ts`, `SharedListView` and share-link encoding,
    which drop their whole-kink `level` branches for role kinks.
- **Why the history depends on this:** `history.ts`'s `partsOf` then gives
  `['a', 'b']` for a role kink, so no "whole → sides" conversion ever shows up
  as a change.
- **The open panel:** the description, safety note, inherited/Clear caption,
  detail sliders (per context for a role kink), note, aliases and specifics,
  which are nested compact rows.
- **Partner view:** `partnerControls` (overridden, reset, copy to own, held
  back) moves into the open panel. An overridden row gets a small marker on
  the closed line.
- **Styling:** the card chrome goes. Rows are separated by a hairline, with a
  hover tint.

### `KinkCategory.svelte`: a collapsible section

- **The section:** a `wa-details`, open by default through `startOpen()` from
  `src/lib/components/details.ts`.
  - The summary is an `h3` with the name and the "3 of 12" progress.
    `progress()` moves here from `KinkListHome`.
  - It gets `id="category-{id}"`.
- **Inside:** the description, the rows, then the custom rows with Remove.
  The hidden-kinks note, "N related kinks" and "Add your own" come last,
  unchanged in behaviour.
- **Collapse state is not stored.**

### `KinkListHome.svelte`

- **The categories:** it renders `<KinkCategory>` for every category, in
  place of the link grid.
- **The search results** use the same compact rows.
- **Partner view:** the `minimal` mode keeps working the same way.

### Remove the category pages

- **Routes:** delete `(public)/kink-list/[category]/`,
  `playroom/kink-list/[category]/` and
  `playroom/kink-list/partner/[partnershipId]/[category]/`.
- **Components and helpers:** delete `KinkCategoryPage.svelte` and
  `category-param.ts`.
- **Context:** drop `category` from `KinkListPaths` in `context.ts`, and from
  every layout that sets the context: public, signed-in and partner. Keep
  `history`.
- **The public layout's redirect:** drop the `[category]` branch in
  `(public)/kink-list/+layout.server.ts`.

## 3. Two filters: intensity and commonness

### The catalogue

- **A top-level `commonness` block,** shaped like `intensity`. Higher means
  more common:

  ```json
  "commonness": {
    "levels": { "0": "Rare", "1": "Uncommon", "2": "Fairly common", "3": "Common", "4": "Very common" },
    "defaultMin": 1
  }
  ```

  Rare is hidden by default, the way Extreme is.
- **What each level means.** The rating is about how many people are into a
  kink or know of it, and it's independent of intensity:
  - Very common: kissing, oral, cuddling
  - Common: spanking, blindfolds, dirty talk
  - Fairly common: rope bondage, pet play, CNC
  - Uncommon: sounding, macrophilia, balloons
  - Rare: the rarest fetishes in the catalogue
- **The item field,** `commonness: z.number().int().min(0).max(4)`, is
  required on kinks and specifics, and categories don't have one.
- **New checks in `catalogProblems`:**
  - every kink and specific is rated
  - a category isn't rated
  - a specific is never more common than its kink

### The settings

- **The new field:** `settings` gains `minCommonness: 0–4`. It's required,
  defaults to `defaultMin` in `emptyList()`, and needs no compatibility path
  because nothing is deployed.
- **Merging:** the settings share one `at`.
- **The store:** `setMaxIntensity` becomes `setFilters({ maxIntensity?,
  minCommonness?, side? })` on `KinkListStore`.
  - `PartnerKinkList` passes the filter settings on to `solo`, as it does
    today.
  - `side` is the exception: see section 4.

### One helper

- **`isShown(list, item)`** in `answers.ts` becomes the single filter, for
  intensity, commonness and lean (section 4).
- **Remove the duplicates:** the `shown()` in `deck.ts`, and the inline
  filters in `KinkCategory`, `KinkRow` and `KinkListHome`.
- **Two exceptions:** custom kinks are never hidden, and search ignores every
  filter.

### `ListFilters.svelte` (replaces `IntensitySetting.svelte`)

- **The sliders:** two stepped `wa-slider`s.
  - "How intense" runs Sweet → Extreme, with an "up to Hardcore" readout.
  - "How common" runs Very common → Rare, with a "down to Uncommon" readout.
    Its position is `4 - minCommonness`, so on both sliders moving right
    shows more.
- **Wiring:** each slider has a `valueFormatter`, and its events are wired by
  hand. A value is saved on `change`.
- **Where it's used:** `KinkListHome` and `TriageGrid`.
- **The hidden notes** become "N more are hidden by your filters".

## 4. Dom/sub perspective

### The catalogue

- **A role pair's default lean.** The top-level `roles` entries gain
  `domSide`: `"a"`, `"b"` or `null`.
  - dom-sub and aggressor-target default to `"a"`.
  - give-receive, self-partner, seen-watch and any new pair default to
    `null`, which is neutral.
  - The shape becomes `{ labels: [a, b], domSide }`. Update the `roles`
    schema and `sidesOf()` to match.
- **Per-kink overrides:**
  - `domSide?: "a" | "b" | "neutral"` on a kink with a role pair. Spanking,
    which is give-receive, gets `"a"`. Worship gets `"b"`, because giving
    worship is the submissive side.
  - `lean?: "dom" | "sub"` on a kink without a role pair that stays
    one-sided.
- **New checks in `catalogProblems`:**
  - `domSide` only on a kink with roles, and `lean` only on one without
  - a specific inherits its kink's lean unless it sets its own

### "Your side" setting

The values are `'dom' | 'sub' | 'both'`.

- **What it hides:**
  - for a role kink whose lean isn't neutral, the context that leans the
    other way
  - a role-less kink whose `lean` is the other way
  - neutral kinks and contexts always show
- **Your own list:** `settings.side?`, default `'both'`, stored and merged
  with the other settings.
- **A partner's view:** the default comes from `answerFromControl(control,
  role)` in `src/lib/partnership.ts`.
  - **The data it needs:** `partner/[partnershipId]/+layout.server.ts`
    returns `control` and `role`, which `getPartnershipForUser` already has
    in its `PartnershipView`. The layout passes the result to
    `PartnerKinkList`.
  - **The mapping:** `'me'` → dom, `'them'` → sub, `'mix'` → both.
  - **Changing it:** the control at the top changes it for this partner's
    view only, kept in `PartnerKinkList` state for the visit and not sealed
    or shared. Opening the page again starts from Who's in control again.
- **The control:** a "Your side: Dom · Sub · Both" segmented control beside
  the key.
  - Use `wa-radio-group` with button-appearance `wa-radio`s, added to
    `src/lib/webawesome.ts` if missing, or native radios styled like the
    scale.
  - In partner view, a short line says "Set from who's in control".
- **Quick fill:** the deck's "Answering for" starts on the side that matches
  your side, and hides cards and contexts the same way.

### Compare

- **What compare already does:** `pairings` in `compare.ts` matches my side
  `a` against their `b`, and `b` against `a`, which is the cross-matching
  asked for: my sub context against my partner's dom context, and the other
  way round. Keep that.
- **What changes:** in partner compare, when my side is `dom` or `sub`, keep
  only the pairings whose `mySide` is my side, plus neutral ones. Role-less
  kinks that lean the other way drop out.
- **Where the logic lives:** in a pure `pairingsFor(mine, theirs, side)` in
  `compare.ts`.
- **On screen:** label each pair with both contexts ("You, as sub: Love ·
  Alex, as dom: Like"), using the context labels.

### Rewriting one-sided kinks

Survey findings: almost every one-sided kink already has a role pair. The
one-sidedness comes from names and descriptions written from one side.

**Breaking changes are fine.** The kink list hasn't been deployed anywhere
yet, so there are no saved answers, share links or exports to keep working.
This change may:

- **rename ids,** wherever a neutral name wants a neutral id
- **change a kink's pair or swap its sides,** such as moving the roleplay
  kinks to dom-sub, or moving `crossdressing`/`makeup`/`piercing`/`tattoos`
  to self-partner, or seen-watch kinks like `glory-hole` to give-receive
- **merge near-duplicates.** These are candidates for review, not a decision:
  - `forced-masturbation` and `jerk-off-instructions`
  - `lending`, `cuckolding` and `cheating-fantasy`
  - `grooming-care` and `personal-service`
  - `watching-others` into `exhibition`'s watching side

Some things still have to be kept in step:

- **`share-ids.json`:** regenerate it from the new catalogue, with removed
  ids simply dropped, not tombstoned.
  - It's append-only from the first deploy onwards. Say so in
    docs/kink-list.md.
- **The 7 import snapshots** in `src/lib/kink-list/import/lists/*.json`:
  update every changed or merged id, and every side that flipped.
- **Tests that name ids:** catalog, answers, compare, deck, partner, share
  link, the import tests, KinkRow, Deck and e2e.
- **`ImportExport.svelte`'s `'fetishes'`.**
- **The `kink-list` sealed fixtures** in
  `src/lib/sealed-fixtures/fixtures.json`.
  - If a fixture's ids or the payload shape change, regenerate the fixture
    rather than keep a v1 compatibility path.
  - Check how the fixtures are produced before regenerating, since they are
    meant to be frozen once deployed.
- **The settings** (`minCommonness`, `side`) can be required fields with
  defaults in `emptyList()`, rather than optional ones.

**The work:**

1. **Rename and reword one-sided kinks to neutral,** keeping their pair. Some
   examples:
   - `orders` "Following orders" → "Orders"
   - `ignoring` → "Ignoring"
   - `lending` → "Lending and sharing"
   - `manual-restraint` "Being held down" → "Holding down"
   - `grooming-care` → "Pampering"
   - `head-shaving` → "Head shaving"
   - `forced-masturbation` → "Ordered masturbation"
   - `permission-to-come` → "Permission to come"

   Other kinks only need their description reworded, including the
   humiliation, orgasm-control and service kinks.
2. **Give role-less one-sided kinks a pair,** a new one where none fits:
   - `harem`: dom-sub
   - `gangbang` and `spitroast`: give-receive
   - `pet-names`: a new "Calling"/"Being called" pair
   - `cuckolding`: a new pair
   - `mentorship`: a new "Teaching"/"Learning" pair
3. **Tag `lean` on the few that are truly one-sided,** such as `time-stop`.
4. **New pairs** go in `roles`, with their `domSide`.
   - Check the import column regexes in `import/kinklist-links.ts`
     (`FIRST_SIDE`/`SECOND_SIDE`) against them.
   - Update any import snapshot item that now needs a `side`, and its tests.
     `compare.test.ts` uses `pet-names` as a kink without sides, so that test
     changes.
5. **Descriptions stay original,** and no source list's wording is copied
   (docs/kink-list.md: the share-alike licence).

### Rating pass (commonness, domSide and lean together)

1. **Dump the catalogue:** `id`, `name`, `parent`, `roles`, `description` and
   `tags` go to the scratchpad.
2. **Rate in parallel:** 3–4 subagents, split by section, each with the
   commonness rubric, the lean rules and the anchors above. Each returns
   `{ id, commonness, domSide|lean, proposed name/description rewrite? }`.
3. **Merge and check:**
   - the distribution of each rating
   - specifics never more common than their kink
   - the anchors rated as stated
   - dom-sub kinks all `"a"`
4. **Write the ratings into `catalog.json` with a script.** It inserts the
   new fields after `"intensity"` and applies only the reviewed renames,
   re-pairings and merges, so nothing else is reflowed. Then regenerate
   `share-ids.json` and update the import snapshots.
5. **Your review before committing:**
   - the distributions
   - every rename or reword, before → after
   - every new pair
   - the calls most worth a second look

## Tests

- **`catalog.test.ts`:**
  - commonness: every kink rated, a category not, specific ≤ kink
  - `domSide`/`lean` placement
  - the new `roles` shape
  - pair defaults
- **`answers.test.ts`:**
  - `isShown` with intensity, commonness and side
  - an old payload without the new settings parses with defaults
  - the schema rejects a whole-kink `level` on a role kink, and sides on a
    role-less one
- **`history.test.ts`:** a role kink's changes are per side only. Update any
  catalogue ids that were renamed or merged.
- **`deck.test.ts`:** cards outside the filters are left out, and the deck
  starts on your side's context.
- **`compare.test.ts`:** `pairingsFor` with dom, sub and both. My sub side is
  paired against their dom side, neutral kinks stay in, and role-less kinks
  that lean the other way drop out.
- **`partner.test.ts` or a new test:** the side starts from `control` and
  `role` (me, them, mix).
- **`KinkRow.svelte.test.ts`:**
  - two named groups for a role kink
  - one group when your side hides a context
  - an inherited dot is dashed and not checked
  - the open panel shows the description, Clear and the partner controls
- **`KinkCategory`:** the section starts open, collapses, shows its progress,
  and keeps related kinks and the hidden-kinks count.
- **`ListFilters` / your-side control:** moving a slider or choosing a side
  saves it.
- **`e2e/kink-list.spec.ts`:**
  - replace the category-link clicks and category URLs with groups on the
    home page
  - a category collapses and expands
  - in a partner's view, the side follows Who's in control, and compare
    shows the cross-matched pairings
- **The import tests** whose mapped kinks gained a pair.

## Docs and housekeeping

- **`docs/kink-list.md`:**
  - The catalogue: commonness, `domSide`/`lean`, the new `roles` shape, and
    the rule about renaming and pairs.
  - The screens: one page, the key, the compact row, contexts always shown.
  - The filters and your side.
  - Compare's cross-matching and side filter.
  - The Tests section.
- **`docs/partners.md`:** that the kink list's default side reads `control`.
- **The plan:** copy it to
  `docs/historical-plans/2026-10-19-kink-list-dense-layout-and-sides.md`.
- **The roadmap:** add twigs under `kink-list` in
  `src/lib/roadmap/roadmap.json` for the one-page list, the filters and your
  side.

## Verification

- `npm run check`, `npm run lint` (`npm run format` first) and `npm test`.
- `npm run dev` at desktop width and at about 375px:
  - your own list and the signed-out list are one page, with mostly
    single-line rows
  - the key stays pinned while scrolling
  - the greens can be told apart
  - role kinks show two contexts, side by side on desktop and stacked on a
    phone
  - Your side = Sub hides the dom contexts and the dom-leaning kinks
  - in a partner's view where control is "them", the side starts on Sub
  - compare pairs my sub side against my partner's dom side
  - the old category URLs return 404
