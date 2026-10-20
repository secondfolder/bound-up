# The kink list

A private record of what someone is into, curious about and won't do. Signed
in, it lives in the Playroom at `/playroom/kink-list`, and signed out at
`/kink-list`. Each kink is answered
on one scale, with more detail where wanted: the two sides of a role pair
separately, fantasy and reality, experience, and a note.

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
- **Intensity**, 0–6, from Sweet to Extreme. It is not shown anywhere
  and hides nothing: what a list shows is its level of detail (see
  [The level of detail](#the-level-of-detail)). It stays in the catalogue
  as a rating of each kink.
- **Commonness**, 0–4, from Rare to Very common: how many people are into a
  kink or know of it. It is independent of intensity: balloons are mild and
  rare, choking intense and well known. It sets a kink's level of detail.
  Every kink and specific has one, a category has none, and a specific is
  never more common than its kink, since a narrower act is never more widely
  known than the act it narrows. The anchors the ratings were made against:
  - Very common: kissing, oral, cuddling
  - Common: spanking, blindfolds, dirty talk
  - Fairly common: rope bondage, pet play, CNC
  - Uncommon: sounding, macrophilia, balloons
  - Rare: the rarest fetishes in the catalogue
- **Role pairs.** `roles` names a pair of contexts for a kink that two people
  do differently: Giving and Receiving, As dom and As sub, On me and On my
  partner, and narrower ones such as As teacher and As student. Each pair in
  the top-level `roles` has its two labels and a default `domSide`. Side `a`
  is the active, giving, dom or self one, which is also how imports read a
  column ("Giving", "Self", "As Dom" go to `a`).
- **Which side leans dom.** The "Answer as" filter needs to know which
  context a dominant usually takes. dom-sub and aggressor-target say `a` for
  every kink in them. Every other pair is neutral by default, and a kink sets
  `domSide` itself where it leans: spanking's Giving is `a`, but giving
  worship is the sub's, `b`. A specific with the same pair follows its kink.
  A kink with no pair that is only ever one person's takes `lean` instead;
  none needs it today, because the one-sided kinks were rewritten as neutral
  kinks with a pair ("Following orders" became "Orders", "Being held down"
  became "Pinning down"). Prefer that rewrite to a `lean`.
- **Other fields:**
  - `tags` are filters: degrading, public, others present, remote, risky, …
  - `aliases` are search terms: synonyms, slang and abbreviations ("fellatio",
    "BJ")
  - `safety` is a short note on kinks that carry real risk

The content is explicit, and was written for this app from research across
ten public kink lists. That research, the coverage of every source item, and
the review behind the categories are kept outside the repo, in
`.local/kinks/`. **Descriptions are original**: one source list is CC BY-SA,
and copying its wording would put its share-alike licence on ours.

**Every item has a `share` number, and it never changes.** Share links refer
to kinks by number to stay short, and a link is a snapshot nobody can update.
- Numbers run from 0 with no gaps, one per item, and the loader fails
  otherwise. A new kink takes the next number.
- [`share-numbers.fixture.json`](../src/lib/kink-list/share-numbers.fixture.json)
  is every number given out. A test fails if one is renumbered or its item
  deleted, and asks for a new item to be added to it. From the first deploy
  it only grows.
- Until the kink list is deployed anywhere, ids may still be renamed in place,
  as three were when the one-sided kinks were rewritten.

### Retiring a kink

**Kinks are retired, never deleted.** `retiredOn` (`YYYY-MM-DD`) takes a kink
or specific off the list while keeping it in the catalogue. Changing what a
kink means — splitting it in two, say — is retiring it and adding new kinks
with the next numbers.

- **Saved answers to it are kept, unseen.** Nothing that shows, answers,
  counts, compares, searches, exports or shares a list includes it, and a
  partner's copy leaves it out. `liveItems`, `childrenOf`, `categories` and
  `liveKinkById` are the live views; `kinkById` still finds it.
- **Why not delete it:** an answer whose kink is unknown is read as having no
  role pair, which dropped one side of it on the next save. A retired kink is
  still known, so its answers keep their shape.
- **Version history still shows it**, marked "No longer on the list since …",
  for changes made before it was retired. A change between versions edited
  after that date is left out, since only an older build could make one.
- **An old export or share link** that answers it: a share link drops it; a
  JSON or CSV import lists it under what didn't match, under its old name,
  rather than writing an answer nothing shows.
- **A category can be retired**, with every kink in it: nothing live may sit
  under a retired category or kink, and no live kink may list a retired
  category in `alsoUnder`. Its wholesale limit is kept in the list but, like
  its kinks, shown and shared nowhere.
- An import list in `import/lists/` may not map to a retired kink.

### Changing the catalogue

Saved answers, partner copies, share links and exports all refer to a kink by
its `id` (lists) or its `share` number (links), never by its name, position or
parent. So most edits are safe for lists already filled in, and the ones that
aren't are below. `npm test` runs every rule the loader checks, plus the
frozen share numbers; `catalog.json` is edited by hand
(`.local/kinks/tools/export.py` predates share numbers and retiring, and must
not be run over it).

- **Adding a kink:** give it the next `share` number (the item count before
  it) and add it to `share-numbers.fixture.json` with that number. It can go
  anywhere in the file. It needs `commonness`, and a specific needs `adds`.
- **Rewording** (`name`, `description`, `aliases`, `tags`, `safety`): answers
  are untouched, and still read as answers to the new wording.
  - If the meaning changes rather than the phrasing, retire the kink and add
    a new one instead, or old answers silently become answers to a question
    nobody was asked.
  - A spreadsheet from elsewhere is matched by name and alias, so keep a
    renamed kink's old name as an alias. Bound Up's own CSV matches by id, and
    the `import/lists/` snapshots by id, so neither cares.
  - Side labels belong to the pair in `roles`; see role pairs below.
- **Reordering** within `catalog.json` changes only the order the list, quick
  fill and the review show kinks in. Share numbers don't follow the order, so
  nothing else moves.
- **Moving a kink** to another parent (another category, or under another
  kink as a specific):
  - Its answers go with it, wherever it is listed.
  - **Wholesale limits follow the primary category.** A kink moved into a
    category someone limited with "Hard limit everything here" shows an
    inherited hard limit there, to them and in their partner's compare; one
    moved out loses it. Its own answer always wins over either.
  - **Quick fill deals a specific only after its kink gets a yes,** so a
    specific moved under a kink someone answered no won't come up for them.
    A specific never inherits its kink's answer, so the move changes nothing
    it shows on the list.
  - Version history compares only answers given, so a kink that gains or
    loses an inherited limit by moving isn't listed as a change.
  - Becoming a specific means gaining `adds` and being no more common than
    its new kink; becoming a kink means losing `adds`. The loader says which.
- **`alsoUnder`** only changes where a kink is also shown. It is one item, so
  the answer stays one answer.
- **`commonness` and `adds`** change the level of detail a kink shows from.
  Raising it may hide a kink someone answered; the answer is kept and counted
  in "N more kinks are hidden by your level of detail".
- **`intensity`** is not shown or used anywhere, so it changes nothing.
- **`domSide` and `lean`** change only what the "Answer as" filter hides.
- **Role pairs** (`roles`, and the labels in the top-level `roles`): answers
  are stored per side as `a` and `b`, so a change here can change what
  someone said.
  - **Swapping a pair's sides, or relabelling it so `a` means something
    else, flips every saved answer on it.** After the first deploy a pair may
    only change where `a` keeps its meaning, and the `import/lists/`
    snapshots have to follow.
  - **Giving a kink a pair** turns a saved whole answer into the same answer
    on each side, which is safe.
  - **Taking a kink's pair away** keeps only side `a`'s answer (`a`'s, or
    `b`'s if only `b` was answered), and the other side is gone on the next
    save. Prefer retiring it and adding a kink without a pair.
- **Splitting or merging kinks, or changing what one means:** retire the old
  kink and add the new ones. Old answers stay with the old kink, unseen and
  in history, rather than being guessed onto the new ones. There is no
  mapping of answers from a retired kink to its replacements.
- **Deleting:** never. Retire it (above). The loader fails on a gap in the
  share numbers, and the fixture test names the deleted id.
- **Renaming an `id`:** only before the first deploy. After it, an id is
  as permanent as its share number: retire it and add a new kink.
- **Renumbering:** never. The fixture test fails on any number that moved.

## Answers

[`answers.ts`](../src/lib/kink-list/answers.ts) holds the shape and the rules.
It's pure, and is shared by the sealed kind, the stores and the tests.

**The scale**, from no to yes: **Hard limit, Not for me, Conditional, Don't
mind, Curious, Like, Love.** Conditional, Curious, Like and Love count as yes
(`isPositive`).

An answer can also have:

- **sides**: `a` and `b` of the kink's role pair. **A kink with a pair is
  answered per side only, and one without is answered whole only**
  (`normaliseAnswer`). A whole answer on a role kink — quick fill's "Both", an
  import with no sides — becomes the same answer on each side. It is applied
  when a list is parsed and when an answer is set, so everything past those
  two points (comparing, history, exports) reads one shape.
- **a detailed answer**, per side for a kink with a pair:
  - *into it as a fantasy* and *into actually doing it* (`fantasy`,
    `doing`), on the same seven levels as the answer. They **are the answer
    until they part**: an answer is stored either as one `level` with no
    `fantasy` or `doing`, or with the two apart and `level` following
    reality (fantasy's while reality is unsaid), because everything that
    reads one answer — compare, progress, the exports, the history — is
    asking whether someone would do it. `settleSide` puts every context in
    one of those two shapes when a list is parsed and when an answer is set,
    so two that agree again fold back into one. Setting the answer as a whole
    (`withLevel`, which the row and quick fill use) makes the two follow it
    again.
  - *experience*, 0 to 4 from Never to All the time, or unset.
- **a note**, free text up to 1000 characters, on any kink, answered or not.
  Notes are for conditions ("only with a condom") and anything else.

**Every kink on a list is the catalogue's.** There are no kinks of one's own:
they once came from an import's unmatched rows, and were removed so that
everything on a list can be shown, compared, shared and retired by the same
rules. A way to suggest a kink for the catalogue is to come instead. Lists
saved in development may still hold some (`custom:<random>` keys); they are
dropped as a list is read (docs/temporary-code.md).

### What an unanswered kink shows

`effectiveAnswer` decides, in this order:

1. The kink's own answer for that side, then its own answer for both sides.
2. A category's **"Hard limit everything here"**, from quick fill's triage,
   for kinks whose primary category it is.

**A specific does not take its kink's answer.** It once did, but a specific
is listed because its answer can differ (loving spanking says little about
paddles), and an answer shown on a specific nobody rated read as one they
had given. Unanswered, it is unanswered.

**Nothing positive flows down from a category, and nothing flows into a
related kink.** If it did, "Love" on Impact would give face slapping a Love
from someone who hates degradation. A hard limit is the one blanket answer
allowed, because a wrong "no" costs little and can be overridden.

On screen, that inherited limit is a dashed ring rather than filled, and its
tooltip names its source, so it never reads as a choice that was made. Notes
are never inherited.

### Merging

Every answer, triage choice and the settings carries `at`, the
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
    [`UnreadableList`](../src/lib/components/kink-list/UnreadableList.svelte)
    shows instead, with a way out for each likely cause, mildest first:
    reload, sign out and back in (this device's keys are not the ones the
    list is sealed with), and last, start a new list. Starting over sends
    `keepVersion` with its first save, so the server keeps the list it
    replaces as a version however recently it changed: nothing is lost that a
    later fix could not bring back.
  - **Why it would not open** is worked out by `openRecordDiagnosed`
    (`crypto/sealed.ts`): the wrong format, a failed decryption, bad JSON, an
    unknown version, or a schema that refused it, with where it did: the
    path, Zod's issue code, what the schema expected there, and the type of
    what it found ("number"). It is logged to the console and shown in debug
    mode — never a value, since those are the sealed content. The server
    cannot read a list, so it cannot say why; it logs only that one was
    replaced and kept.
  - New settings are defaulted in the schema rather than required, so a list
    saved before one existed still opens.
- **`DeviceKinkList`** ([`device-store.svelte.ts`](../src/lib/kink-list/device-store.svelte.ts))
  keeps the same payload in `localStorage`, for someone signed out.

The layout builds the store once, so moving between the list and quick fill
never reopens it or drops an unsaved answer.

**Nothing typed is lost.** [`SaveStatus`](../src/lib/components/kink-list/SaveStatus.svelte)
shows Saved, Saving… or the failure with a retry. While anything is unsaved,
leaving the page asks first: a note typed and the tab closed at once, or a
failed save.

## The screens

**The whole list is one page**, `/playroom/kink-list`
([`KinkListHome`](../src/lib/components/kink-list/KinkListHome.svelte)), dense
enough to fill in without a click per category:

- Quick fill, Share (a dialog that makes a link), Import or export, and
  History, on one row
- pinned above the list as it scrolls, under that row: search over names
  and aliases (`searchKinks`), which narrows the list in
  place (see [Search](#search)), the level of detail
  ([`ListFilters`](../src/lib/components/kink-list/ListFilters.svelte)), the key to the answer colours
  ([`LevelKey`](../src/lib/components/kink-list/LevelKey.svelte)), "Your
  side" ([`YourSideControl`](../src/lib/components/kink-list/YourSideControl.svelte)),
  and Expand all / Collapse all. It has no background of its own until it
  sticks; then one fades in, reaching from edge to edge of the page, so rows
  scrolling under it are hidden right across. A sentinel above it, watched
  with an `IntersectionObserver`, says when it has stuck.
- every category by section, each a `wa-details`
  ([`KinkCategory`](../src/lib/components/kink-list/KinkCategory.svelte))
  that starts open and folds away, with how much of it is answered, and
  "N related kinks". Folding is not
  stored. A category has no page of its own: `id="category-<id>"` is the
  anchor.

**Each kink is one line**, two at most
([`KinkRow`](../src/lib/components/kink-list/KinkRow.svelte)): its name on
the left, and on the right a row of dots per context
([`AnswerScale`](../src/lib/components/kink-list/AnswerScale.svelte)).

- **The dots** are native radios, because the state is `checked`, coloured
  by level from the `--kink-level-*` tokens in `theme.css`. The no side runs
  red, orange, yellow, then grey for Don't mind; the yes side is one green
  that gets stronger toward Love, so the yeses read as more of one answer.
  Colour is never the only cue: each radio is named by its word, each dot
  has it as a tooltip, the position on the scale is fixed, and the key says
  which is which. A chosen dot is filled with a check; choosing it again
  clears it. An inherited hard limit is a dashed ring whose tooltip says where
  it comes from.
- **A kink with a role pair always shows both contexts**, side by side with
  their labels, or stacked under the name on a phone. "Answer as" can narrow
  it to one.
- **The ratings sit in two columns of one width on every row**, so the first
  context (Giving) is always in the first and the second (Receiving) in the
  second. A kink narrowed to one context leaves the other column empty
  rather than moving into it, and a kink with no contexts is centred across
  both, so neither reads as the other's column when skimming. Too narrow for
  two (a container query on the category's rows), the contexts stack in one
  right-aligned column. A size container adds nothing to its parent's
  fitted width, so the page column around the list must be full width up to
  its maximum, not shrink to fit, or it collapses and every pair stacks.
- **A context whose fantasy and reality have parted shows the two** in place
  of its one row of dots, labelled Fantasy and Reality, and goes back to one
  when they agree again.
- **A context's experience shows on the line once it is set**, as
  "Experience: Often" under its rating, so it is seen without opening the row.
- **The name opens the rest** under the row: the description and safety
  note, then a fieldset per context (none for a kink without contexts)
  holding its fantasy and reality as dots and its experience as a slider
  (`OptionalSlider`, shared with Daydreams; see [sliders.md](sliders.md)),
  each titled on the left with its control on the right, the slider as wide
  as a row of dots,
  the note, a partner view's controls and aliases. The closed row flags a
  note and an answer that is just for a partner.
- **A kink's specifics are always shown**, as nested rows under it, open or
  not, rather than inside its panel, where most went unseen.

### The level of detail

One slider, from Essentials to Everything (`catalog.detail`, 1–5), saved in
the list's `settings.detail` and shared by every screen through one helper,
`isShown`. It is for someone who wants a short list of the commonest kinks as
much as for someone who wants every specific: a kink shows when its own level
(`detailOf`) is at most the slider's.

- **A kink's level is its commonness**, turned round: very common at 1,
  rare at 5.
- **A specific's level is at least its kink's**, since it is only seen under
  it, and at least its own commonness's, **plus how little its answer adds**
  to its kink's (`adds`: much +0, some +1, little +2), up to 5. Kissing on the
  mouth tells little that an answer to kissing did not, so it waits for
  someone who wants the detail; blindfolds, which people answer apart from
  sensory deprivation, shows as soon as its commonness allows. `adds` is set
  on every specific, and only on specifics (`catalogProblems`).
- **New lists start at Very detailed** (`catalog.detail.default`, 4): all
  but the rarest kinks, and the specifics that add most. A list saved with
  the intensity and commonness filters it replaced opens on the default.

Intensity no longer hides anything. An Extreme kink shows by how common it
is, like any other.

It sits beside the search when the page is wide enough, at a fixed width
rather than one taken from the content, since the reading beside its title
changes width as the slider moves.

A category says how many of its kinks the
level of detail hides. A category it hides every kink of is left out
altogether rather than shown as an empty heading, and the foot of the list
says how many categories went and how many kinks were in them. While
searching that line gives way to the search's own count.

**In debug mode, "Only this level"** under the slider shows the kinks at
exactly its level instead of every one up to it, to check what each level
adds (`exactDetail` in `Filters`, applied by `atDetail`). A kink with a
specific at that level stays, since specifics only show under their kink,
and its name is dimmed to say it is there for context. It lives on the store
for the visit and is never saved.

### Search

Search narrows the list the way the level of detail does, rather than swapping it for a
list of results, so a match is seen where it lives: cuddling under Intimacy
and affection, a paddle under Spanking. `searchView` (`answers.ts`) works out
what stays:

- **a kink or specific that matches**, by name or alias, and **the kink
  above a matching specific**, as its place
- **not a matching kink's other specifics**: a specific shows only if it
  matches too
- **only what the level of detail shows.** A match they hide is counted instead,
  once, and the page says "N kinks match but are hidden by your level of
  detail", so a search that seems to find nothing says why. A
  specific whose kink is filtered out counts as hidden with it.

Categories and sections with nothing left are dropped; the rest are opened, so
no match sits in one folded earlier. While searching, a category leaves out
its related kinks (each is shown in its own category) and its own count of
hidden kinks (the page gives one for the search). Its "3 of 12" is still of
everything the level of detail shows.

### Answer as

Dom, Sub or Both. Dom or Sub hides the context of a kink that leans the other
way (`shownSides`), and any one-sided kink for the other side; neutral kinks
and contexts always show. The store's `filters` carry it, so the list, quick
fill (which starts each card on your context) and comparing all follow it.
An info button beside it says what it does, in a popover so a tap opens it
on a phone.

- **On your own list** it is a setting, `settings.side`, and starts on Both:
  there is nothing to guess it from.
- **In a partner's view** it starts from that partnership's "Who's in
  control" (`sideFromControl`, from `answerFromControl` in `partnership.ts`):
  whoever holds control starts on Dom, the other on Sub, and shared control
  on Both. Changing it lasts for the visit, kept in `PartnerKinkList`: it is
  a lens on the list, not part of it, so it is neither sealed nor shared, and
  the next visit starts from control again.

## Quick fill

`/playroom/kink-list/quick`, in four steps on one page
([`QuickFill`](../src/lib/components/kink-list/QuickFill.svelte)). The steps
are page state rather than separate URLs: the deck is worked out from the
list, so a reload loses nothing and lands back on triage.

1. **Triage** ([`TriageGrid`](../src/lib/components/kink-list/TriageGrid.svelte)).
   Every category is a tile, in by default, and tapping one out skips it.
   "Hard limit everything here" answers a whole category, and the level of
   detail is set here too.
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
   deals its specifics in straight after it, as "Specifically, for …". After a no
   or Don't mind they are not asked, and stay unanswered.
4. **Review** ([`DeckReview`](../src/lib/components/kink-list/DeckReview.svelte)):
   - your hard limits, with each category limited wholesale shown as one line
     rather than every kink in it
   - conditional answers, with their notes
   - skipped cards, with "Go through skipped"

[`deck.ts`](../src/lib/kink-list/deck.ts) is the pure part. `deckCards`
lists the cards still to go:

- included categories in catalogue order, each category's kinks
- a kink's specifics only once it has a yes
- nothing past the level of detail, and nothing answered or skipped

Answering a card is what moves the deck on, and Undo puts the answer (or
skip) back, so the card returns. Nothing about the deck's position is ever
stored.

## Without an account

Like the IQ test, the kink list works signed out, at `/kink-list/…`
(`(public)/kink-list/`).

- **The same screens** run on a `DeviceKinkList`, which keeps the list in this
  browser's `localStorage` (key `kink-list.device`, in `device-key.ts`).
  - There is no key to seal it with until there is an account, so it is kept
    as it is.
  - Anything that fails to parse counts as no list, as it does for the IQ
    test's device storage.
  - The list opens after hydration, and the server renders a placeholder.
- **A banner** ([`DeviceBanner`](../src/lib/components/kink-list/DeviceBanner.svelte))
  says the list is on this device only. It makes the case for an account
  (keeping it, and comparing with a partner) and links to sign up or log in,
  with `redirectTo` set to the list in the account.
- **Someone signed in** who opens `/kink-list/…` is sent to the same screen
  under `/playroom/kink-list/`, rather than shown an empty list on the device.
  A shared link is the exception.
- **Signing in or up brings the device's list along.** Once the vaults are
  open, the app shell checks for a device list. Only if there is one does it
  load [`adopt.svelte.ts`](../src/lib/kink-list/adopt.svelte.ts) through
  `await import()`, so the shell carries no sealing code for everyone else.
  - The device list is merged into the account's per kink (newest wins) and
    saved.
  - The device copy is removed only after that save succeeds; a failure
    leaves it for the next load.
  - The kink list then says how many answers were added (`adopted.svelte.ts`).

## Sharing

A list can be shared as a link, `/kink-list/shared#k1.<data>`
([`share-link.ts`](../src/lib/kink-list/share-link.ts),
[`ShareLink`](../src/lib/components/kink-list/ShareLink.svelte)). The same
panel works signed in and signed out.

- **The answers are in the fragment**, which a browser never sends to a
  server, so a shared list never reaches this one, or a log on the way.
- **`<data>`** is the answers, deflated (`deflate-raw`) and base64url'd. They
  are keyed by `share` number with short keys, and include notes
  unless the person unticks them. Also included:
  - categories limited wholesale (they change what other kinks show)
  - an optional name

  Quick-fill skips, the level of detail and your side stay on the device. A list
  answered all the way through is under 4,000 characters.
- **`k1` is the format.** A new shape gets `k2`, and readers keep reading every
  format ever written. A kink number this build does not know is dropped, not
  fatal.
- **The link is a snapshot.** It doesn't follow the list, and its answers
  carry `at: 0`, so they lose to anything the reader has answered themselves
  if the two are ever merged.
- **Decoding** treats the fragment as untrusted input: Zod-parsed, never cast.

**The shared page** (`/kink-list/shared`,
[`SharedListView`](../src/lib/components/kink-list/SharedListView.svelte))
lists every kink with an answer of its own, by category, with sides, the
detailed answer and notes, plus any category ruled out wholesale. It is
`noindex`, and works for anyone.

## Comparing

[`compare.ts`](../src/lib/kink-list/compare.ts) puts two lists side by side,
using effective answers.

- **Role-aware.** For a kink with a role pair, my giving is compared with
  their receiving, my "as dom" with their "as sub", and my "on me" with their
  "on my partner" ("On you"). A kink answered for both sides yields both
  pairings, each labelled with its sides.
- **Answer as narrows it** (`pairingsFor`). Comparing as a sub keeps only the
  pairings where my half is the sub one — my being spanked against their
  spanking — and leaves out the kinks only a dom has. Neutral contexts are
  always compared, and limits always listed.
- **Groups** ([`CompareView`](../src/lib/components/kink-list/CompareView.svelte)):
  - **You both want this:** both Like or Love
  - **Worth exploring:** both a yes, one only Curious
  - **With conditions:** both a yes, one Conditional
  - **Worth a talk:** a yes against Don't mind
  - **Not a match:** a yes against Not for me, folded away
- **Their hard limits** are always listed, and a limit never appears in a
  group.
- **Specifics** count only when either person answered them.
- **"Where you overlap most"** counts kinks, not pairings, per category.

**Signed in**, a shared link's "Compare with mine" opens
`/playroom/kink-list/compare#k1.…`, against the person's sealed list. **Signed
out**, it compares on the shared page itself, against the list on the device.

## Import and export

`/playroom/kink-list/transfer` (and `/kink-list/transfer` signed out),
[`ImportExport`](../src/lib/components/kink-list/ImportExport.svelte). An
import is always previewed first: what matched, what didn't, and how to
apply it.

- **Keep my answers** (the default) fills only kinks with no answer yet.
- **Use the imported ones** replaces answers.
- **What didn't match** is listed in the preview, and left out.

[`applyImport`](../src/lib/kink-list/import/result.ts) is the one place an
import joins a list. Every importer produces the same `ImportResult`.

**Export** ([`import/files.ts`](../src/lib/kink-list/import/files.ts)):

- **JSON** is everything but retired kinks' answers, exactly: `{ format:
  'bound-up-kink-list', version: 1, list }`, read back by `readExportJson`.
- **CSV** is one row per kink with an answer or a note. It has an `Id` column,
  so a re-import matches by id, plus words for the sides, fantasy and
  reality (filled in only once they part from the answer), experience and the
  note.

**Import from:**

- **Bound Up's own** share links, JSON exports and CSV.
- **The KinkList family of sites.** These are Goctionni's KinkList (v1 and
  later), adhesiveCheese's kinklist (Classic, Detailed and Please Don't),
  KinkSheet, and Not Lewd Just Kinky (both lists).
  - Their links keep every answer in the hash, by position in the site's own
    list. [`kinklist-hash.ts`](../src/lib/kink-list/import/kinklist-hash.ts)
    is a port of their decoder, which is identical on all of them.
  - **Their encoder is lossy.** It drops zero digits inside a chunk, so a link
    doesn't always hold exactly what was picked, and the site itself shows
    whatever its decoder makes of it. The port reproduces that decoder, and
    its tests pin fixtures made by running the sites' own code in Node.
  - Each site's list is a snapshot in `import/lists/*.json`, with every item
    mapped to the catalogue kink it means. The snapshots are loaded only when
    a link from that site is imported.
  - They are generated by `.local/kinks/tools/gen_import_lists.py`. That
    script matches item names against the catalogue's names, aliases and
    source spellings, applies a hand-made map for the rest, reads a
    "(Giving)" or "(Receiving)" suffix as a side, and ignores categories
    about how someone role-plays rather than what they're into (post length,
    reply speed).
  - **Answer words** map like this:

    | Their answer | Ours |
    | --- | --- |
    | Favorite | Love |
    | Like | Like |
    | Okay, Indifferent | Don't mind |
    | Maybe, Interested | Curious |
    | No | Not for me |
    | Limit | Hard limit |

  - **Columns** headed like a side ("Giving", "Self", "As Dominant") fill
    that side of a kink with a role pair. Otherwise they are folded into one
    answer, the most positive, with a note saying what each was.
  - **adhesiveCheese's links** don't say which preset they were made on. The
    sites write exactly as many 8-character chunks as the list needs, so the
    length picks the preset (`fitOf`), and the person can switch if two fit.
- **Any spreadsheet saved as CSV.** This includes kinkbdsmtest.com's export,
  the Duchy's checklist, or anyone's own.
  - The kink is the column headed like a name, or else the first; the answer
    is the column headed like one, or else the next; a note column is used if
    there is one.
  - Names match the catalogue's names and aliases.
  - Answer words match generously, but numbers don't: a 1 to 5 means opposite
    things on different lists.

**Not importable, and the page says why:**

- kinkli.st keeps answers on its own server.
- KNKI's links are undocumented and expire after 24 hours.
- bdsmtest.org gives role percentages, not a kink list.

## Partners

`/playroom/kink-list/partner/[partnershipId]`, linked from the partner page as
"Kink lists". It is built on your own list
([`partner.ts`](../src/lib/kink-list/partner.ts) holds the rules,
[`partner-store.svelte.ts`](../src/lib/kink-list/partner-store.svelte.ts) the
store).

- **Sharing is explicit, once.** Nothing is sealed for a partner until
  "Share my list with …" makes a copy for them, so being shared with never
  comes as a surprise. That page explains what sharing means, and appears
  only once your own list has something in it; before that it starts you on
  your own list. There is no "stop sharing": while you are linked, sharing is
  what the partnership is for, and unlinking deletes the copies with the
  partnership (`ON DELETE CASCADE`).
- **A shared copy follows your own list.** It stores only what differs for
  that partner:
  - **overrides**: answers changed just for them
  - **held back**: kinks not shown to them yet
  - **blind**: whether comparing is blind

  Kind `kink-list-partner`, in the `kink_lists` row whose `scope` is the
  partnership, sealed in the partnership's vault.
- **Answering in a partner's view** (`answerTarget`):
  - It writes an override when your own list has an answer for the kink.
  - When it has none, the answer **goes on your own list**, and the copy
    follows it. So a list filled in from a partner's view is still yours
    everywhere.
  - Triage and settings are always your own list's.
- **Your partner can't open your own list**, which is in your own vault. So
  the copy also carries `resolved`: your own list, with the overrides
  applied, minus anything held back, plus wholesale limits, without
  quick-fill skips. That is what your partner reads.
  - It is worked out again on every save of the copy.
  - After your own list saves, the layout re-seals every shared copy with it
    ([`partner-sync.ts`](../src/lib/kink-list/partner-sync.ts)). It does the
    same once when the list opens, in case your list changed on another
    device.
  - `soloRevision` records which version of your own list a copy reflects, so
    a copy already up to date is left alone.
  - A copy that changed elsewhere in the meantime is left for next time
    rather than overwritten. An open partner view merges per kink on a lost
    race, like your own list.
- **In the partner view**, each kink is marked "Just for …" (with "Back to
  my own answer" and "Copy to my own list") or "From your own list".
  "Don't show … this yet" holds it back. **Just for …** lists every
  override.
- **Compare** (`…/compare`) puts your effective list against the `resolved`
  list your partner shares with you, through `compareLists`.
  - **Blind comparing**, if either of you turns it on, shows only what you
    both want and each other's limits.
  - It is a courtesy of the screen, not a seal: the copy your partner shares
    is in a vault you both hold, so blind mode cannot keep its contents from
    you, and the copy is honest about that.
  - A link goes to your messages with that partner. Starting a thread from a
    match isn't built: the composer has no way to be handed a draft.
- **The server** lets a member read only the other member's copy in a
  partnership they belong to (`getPartnerKinkList`). Anyone else gets a 404,
  however the partnership id was got.

## Version history

Your own list, signed in, keeps a version once it has gone a week without
changes. **A version is a burst of edits**, not every save: answering is
done in sittings, and a version per save would bury the one change that
mattered under dozens that only moved a slider back and forth.

- **Freezing happens on the next save**, in `saveKinkList`
  ([`server/kink-lists.ts`](../src/lib/server/kink-lists.ts)): if the list's
  `edited_at` is more than `VERSION_QUIET_DAYS` (7) old, the list as it
  stood is copied into `kink_list_versions` before the save applies. No cron
  is needed, because a list nobody edits has nothing new to keep.
- **The copy is an `INSERT … SELECT` batched with the save**, conditioned on
  the same revision, rather than a read and then a write. A save that loses
  the compare-and-swap therefore freezes nothing, so two devices racing after
  a quiet week leave one version, not two.
- **A version is the list's ciphertext, as it was.** It stays sealed in your
  own vault and opens with the list's id as its record id, which is what it
  was sealed to. The server reads nothing in it, as with the list.
- Each version has `edited_from` (where the previous version ended, or when
  the list was made) and `edited_to` (its last edit).
- **Only your own list keeps a history.** A partner's copy follows your own
  list, so its history would be the same one again.

**`/playroom/kink-list/history`** opens the versions in the browser and
compares any two, defaulting to the last version against now
([`history.ts`](../src/lib/kink-list/history.ts), `changesBetween`):

- new hard limits, more into, less into, limits dropped, more experience,
  and notes changed
- each side of a role pair on its own
- only what was **answered**, never what was inherited: a kink that moved
  only because its category was made a hard limit is not a change someone
  made
- "Over time" on any change shows that kink's answer at each version where it
  changed (`kinkTimeline`)

Before the first version the page says when one will be kept. The home page
offers History only signed in, and only once a version has been kept: the
signed-in layout's load says whether there is one (`hasKinkListVersions`,
one row at most), and `paths.history` is set from it. A version kept during a
visit shows the button from the next load.

## Tests

- **`kink-list/catalog.test.ts`:** the catalogue's checks (commonness,
  `adds`, `domSide`, `lean`, share numbers and retiring included), the frozen
  share numbers, each item's level of detail (`detailOf`), search, and the
  tree.
- **`kink-list/retired.test.ts`:** one real kink retired by a mock
  (`$lib/testing/retired-kink`): gone from browsing, search, counts, the
  review, share links, exports and a partner's copy; both sides of its answer
  kept; an old export listing it as not matched; history before and after;
  and a whole category retired with its kinks and wholesale limit.
- **`kink-list/answers.test.ts`:** the effective answer (sides, specifics,
  category limits, related kinks), merging, the stored shape, normalising an
  answer to its kink's shape, fantasy and reality parting and folding back,
  defaulted settings, and the filters
  (`isShown`, `shownSides`), and what a search leaves (`searchView`).
- **`kink-list/deck.test.ts`:** the deck's order, drill-down after yes,
  triage, the level of detail, and the review.
- **`kink-list/share-link.test.ts`:** the round trip (sides, detail, notes,
  wholesale limits, a name), notes left out, the length of a
  full list, broken links, and unknown kink numbers.
- **`kink-list/compare.test.ts`:** the groups, role-aware pairing, limits,
  overlap, and pairing by your side (`pairingsFor`).
- **`kink-list/partner.test.ts`:** following your own list, overrides taken
  back, what the partner sees (held back, limits), where an
  answer goes, differences, merging, and the side who is in control starts
  you on.
- **`kink-list/import/*.test.ts`:**
  - the hash against the sites' own outputs
  - link detection and sides
  - mapping, folding and ignored categories
  - preset fitting, and coverage of the most used lists
  - JSON and CSV round trips, other spreadsheets, and answer words
  - applying an import
- **`server/kink-lists.test.ts`:** saving, compare-and-swap, vaults, and who
  may write a scope; reading a partner's copy (members only, and only the
  other member's), and listing shared copies; versions kept after a quiet
  week (with an injected `now`), none within one, none for a lost race or a
  partner's copy, and each version starting where the last ended; and a
  fresh start keeping the list it replaced, however recent.
- **`kink-list/history.test.ts`:** changes grouped by direction, limits, each
  side on its own, experience and notes, and a kink's timeline.
- **`components/kink-list/KinkRow.svelte.test.ts`:** answering and clearing
  from the dots, both contexts of a role kink, your side narrowing one,
  specifics not taking their kink's answer, the open panel's fieldsets, fantasy and reality parting
  and folding back, notes, a category starting open and
  folding, related kinks, the level of detail and its slider, the side
  control, and
  search narrowing the page in place and counting what the level of detail
  hides.
- **`components/kink-list/Deck.svelte.test.ts`:** buttons, keys, undo, skip,
  one side, a card starting on your side, a held Conditional card, and the
  end of the deck.
- **`e2e/kink-list.spec.ts`:** answers that are sealed and survive a reload,
  a category folding and opening, your side hiding contexts and surviving a
  reload, search by alias finding a kink in its own category, a related kink answered in either place, and quick
  fill on a phone (triage, a real swipe, a button, and a category ruled out).
  - Signed out: a list kept on the device, shared as a link and opened
    elsewhere, then compared; the device's answers joining the account at
    sign-up; the public list redirecting someone signed in; and a shared link
    compared with a signed-in list.
  - Importing a KinkSheet link, exporting JSON, and reading it back.
  - A partner view starting you on your own list while it is empty.
  - Two partners: sharing, an override and a held-back kink for one partner,
    an answer from the partner view going on your own list, comparing, and
    blind comparing set by the other side.
  - A partner view starting on the dom side for whoever is in control.
  - A list aged a week with `sql()`, edited, and the version kept and shown
    on the history page.
- **The sealed fixture** for `kink-list` v1 is in `sealed-fixtures/`. Its
  `expected` moved when answers began to be normalised and settings
  defaulted: v1 has never been deployed, the README's one exception.
