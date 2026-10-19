# The kink list

A private record of what someone is into, curious about and won't do. Signed
in, it lives in the Playroom at `/playroom/kink-list`. Each kink is answered
on one scale, with more detail where wanted: the two sides of a role pair
separately, three sliders, and a note.

## The catalogue

[`src/lib/kink-list/catalog.json`](../src/lib/kink-list/catalog.json) holds
every kink, loaded and checked by [`catalog.ts`](../src/lib/kink-list/catalog.ts)
the way the roadmap is. A bad edit fails the tests and the type check rather
than reaching anyone.

- **A tree of at most three levels.** A **category** (Impact play) has
  **kinks** (Spanking), and a kink may have **specifics** (Spanking with an
  implement).
- **Sections.** Every category is in one: Kinks, Who you're into, Stories and
  fantasy, or Community and relationships.
- **One primary category per kink.** It's filed by what is physically
  happening. A meaning category, such as Humiliation or Power exchange, is a
  kink's primary category only when there's no distinctive act. Face slapping
  is under Impact, and verbal humiliation under Humiliation.
- **Related kinks.** A kink that fits other categories lists them in
  `alsoUnder`. Each of those categories shows it behind "N related kinks",
  fully answerable. It's the same item, so the answer is shared, and changing
  it in one place changes it in both.
- **Intensity**, 0–6, from Sweet to Extreme. A list shows kinks up to its own
  maximum, which defaults to `defaultMax` (5), so Extreme is hidden until
  someone asks for it.
- **Other fields:**
  - `roles` names a role pair (giving and receiving, as dom and as sub, …)
    for kinks that can be answered per side
  - `tags` are filters: degrading, public, others present, remote, risky, …
  - `aliases` are search terms: synonyms, slang and abbreviations ("fellatio",
    "BJ")
  - `safety` is a short note on kinks that carry real risk

The content is explicit, and was written for this app from research across
ten public kink lists. That research, the coverage of every source item, and
the review behind the categories are kept outside the repo, in
`.local/kinks/`. **Descriptions are original**: one source list is CC BY-SA,
and copying its wording would put its share-alike licence on ours.

**`share-ids.json` is append-only.** Share links and exports refer to kinks by
their position in it, so an existing id never moves. A new kink goes on the
end, and a removed one stays as a tombstone. The loader fails if a catalogue
id is missing from it.

## Answers

[`answers.ts`](../src/lib/kink-list/answers.ts) holds the shape and the rules.
It's pure, and is shared by the sealed kind, the stores and the tests.

**The scale**, from no to yes: **Hard limit, Not for me, Conditional, Don't
mind, Curious, Like, Love.** Conditional, Curious, Like and Love count as yes
(`isPositive`).

An answer can also have:

- **sides**: `a` and `b` of the kink's role pair, each answered on its own.
  Turning that on starts both sides from the answer as it was. Turning it off
  keeps the first side's answer.
- **a detailed answer**: three sliders from 0 to 4. They are *into it as a
  fantasy*, *into actually doing it*, and *experience*. Each can be left
  unset, and they apply per side when the sides are split.
- **a note**, free text up to 1000 characters, on any kink, answered or not.
  Notes are for conditions ("only with a condom") and anything else.

**Custom kinks** sit in a category beside the catalogue's, under
`custom:<random>` keys.

### What an unanswered kink shows

`effectiveAnswer` decides, in this order:

1. The kink's own answer for that side, then its own answer for both sides.
2. For a specific, its kink's own answer. Answers flow down "kind of" links
   only: spanking with an implement is a kind of spanking.
3. A category's **"Hard limit everything here"**, from quick fill's triage,
   for kinks whose primary category it is.

**Nothing positive flows down from a category, and nothing flows into a
related kink.** If it did, "Love" on Impact would give face slapping a Love
from someone who hates degradation. A hard limit is the one blanket answer
allowed, because a wrong "no" costs little and can be overridden.

On screen, an inherited answer is outlined rather than filled, and its source
is named ("Love, from Spanking"), so it never reads as a choice that was
made. Notes are never inherited.

### Merging

Every answer, triage choice, custom kink and the settings carries `at`, the
time it last changed. `mergeLists` keeps the newer one per key, so two copies
of a list merge without losing either device's work. A cleared answer is kept
as an empty one, so the clearing merges too.

## Privacy

Signed in, the whole list is **one sealed record** (kind `kink-list`,
[`sealed-kinds/kink-list.ts`](../src/lib/sealed-kinds/kink-list.ts)) in the
person's own vault, in the `kink_lists` table. It's one record rather than a
row per kink, so the server cannot tell which kinks were answered, or how
many in a category. Here's what the server does see:

- the envelope
- when the list was last edited
- the size of the ciphertext

The size hints at roughly how much has been filled in.

[`server/kink-lists.ts`](../src/lib/server/kink-lists.ts) checks only these
things:

- the envelope
- that the record is sealed under the vault its scope must use: the owner's
  own vault for `'self'`, or the partnership's for a shared copy, plus
  membership
- who is asking

Edits are compare-and-swap on `revision`.

## Saving

The screens are written once, against `KinkListStore`
([`store.svelte.ts`](../src/lib/kink-list/store.svelte.ts)). The routes are
thin wrappers that pick a store and pass it down through context
([`context.ts`](../src/lib/kink-list/context.ts)), along with where the other
screens are.

- **`AccountKinkList`** ([`account-store.svelte.ts`](../src/lib/kink-list/account-store.svelte.ts))
  opens the sealed list once the vaults are worked out. Until then the layout
  shows the usual "…", never content.
  - It seals and saves through `PUT /api/kink-lists/self` a moment after each
    change.
  - **If another device saved first** (409), it fetches the latest, merges
    per key, and tries again.
  - **A list this device cannot open** is left alone: the store refuses
    changes rather than writing over it with only what was changed here.
- **`DeviceKinkList`** ([`device-store.svelte.ts`](../src/lib/kink-list/device-store.svelte.ts))
  keeps the same payload in `localStorage`, for someone signed out.

The layout builds the store once, so moving between categories never reopens
the list or drops an unsaved answer.

**Nothing typed is lost.** [`SaveStatus`](../src/lib/components/kink-list/SaveStatus.svelte)
shows Saved, Saving… or the failure with a retry. While anything is unsaved,
leaving the page asks first: a note typed and the tab closed at once, or a
failed save.

## The screens

- **`/playroom/kink-list`**
  ([`KinkListHome`](../src/lib/components/kink-list/KinkListHome.svelte)):
  - search over names and aliases (`searchKinks`) and custom kinks
  - the intensity maximum
  - every category by section, with how much of it is answered
- **`/playroom/kink-list/[category]`**
  ([`KinkCategory`](../src/lib/components/kink-list/KinkCategory.svelte)):
  - the category's kinks
  - its custom kinks, with "Add your own"
  - "N related kinks"
- **Each kink** ([`KinkRow`](../src/lib/components/kink-list/KinkRow.svelte)):
  - the scale ([`AnswerScale`](../src/lib/components/kink-list/AnswerScale.svelte),
    native radios, because the state is `checked`)
  - "More detail and notes", for the per-side switch, the three sliders
    (`OptionalSlider`, shared with Daydreams) and the note
  - "Get specific" for its specifics

## Quick fill

`/playroom/kink-list/quick`, in four steps on one page
([`QuickFill`](../src/lib/components/kink-list/QuickFill.svelte)). The steps
are page state rather than separate URLs: the deck is worked out from the
list, so a reload loses nothing and lands back on triage.

1. **Triage** ([`TriageGrid`](../src/lib/components/kink-list/TriageGrid.svelte)).
   Every category is a tile, in by default, and tapping one out skips it.
   "Hard limit everything here" answers a whole category, and the intensity
   maximum is set here too.
2. **The deck** ([`Deck`](../src/lib/components/kink-list/Deck.svelte)): one
   card per kink.
   - Every answer is always a button under the card, so the deck works
     without gestures, from the keyboard (1–7, the arrows, Backspace to undo,
     S to skip), and with a screen reader.
   - Swiping is a shortcut on top: right for Like, left for Not for me, up for
     Love, down for Hard limit. A swiped card flies off over 180ms, or not at
     all under `prefers-reduced-motion`, and taps are ignored while it does,
     so one cannot land on the card that is leaving.
   - A kink with a role pair shows **Answering for: Both / Giving /
     Receiving** on the card, already set to Both. Choosing a side first costs
     nothing in the usual case, where asking after the answer would cost a tap
     on most cards.
   - **Conditional** keeps the card on screen with a note field until Next.
3. **Drill down only after yes.** A yes of any kind (`isPositive`) on a kink
   deals its specifics in straight after it, as "Specifically, for …". A no or
   Don't mind leaves them to inherit that answer.
4. **Review** ([`DeckReview`](../src/lib/components/kink-list/DeckReview.svelte)):
   - your hard limits, with each category limited wholesale shown as one line
     rather than every kink in it
   - conditional answers, with their notes
   - skipped cards, with "Go through skipped"

[`deck.ts`](../src/lib/kink-list/deck.ts) is the pure part. `deckCards`
lists the cards still to go:

- included categories in catalogue order, each category's kinks, then the
  person's own kinks
- a kink's specifics only once it has a yes
- nothing above the intensity maximum, and nothing answered or skipped

Answering a card is what moves the deck on, and Undo puts the answer (or
skip) back, so the card returns. Nothing about the deck's position is ever
stored.

## Tests

- **`kink-list/catalog.test.ts`:** the catalogue's checks, search, and the
  tree.
- **`kink-list/answers.test.ts`:** the effective answer (sides, specifics,
  category limits, related kinks), merging, and the stored shape.
- **`kink-list/deck.test.ts`:** the deck's order, drill-down after yes,
  triage, intensity, custom kinks, and the review.
- **`server/kink-lists.test.ts`:** saving, compare-and-swap, vaults, and who
  may write a scope.
- **`components/kink-list/KinkRow.svelte.test.ts`:** answering, inherited
  answers, the sides, notes, related kinks and the intensity setting.
- **`components/kink-list/Deck.svelte.test.ts`:** buttons, keys, undo, skip,
  one side, a held Conditional card, and the end of the deck.
- **`e2e/kink-list.spec.ts`:** answers that are sealed and survive a reload,
  search by alias, a related kink answered in either place, and quick fill on
  a phone (triage, a real swipe, a button, and a category ruled out).
- **The sealed fixture** for `kink-list` v1 is in `sealed-fixtures/`.
