# Share numbers and retired kinks in the catalogue

## Context

Share links number kinks by their position in `src/lib/kink-list/share-ids.json`, a
second file beside `catalog.json`. The two can drift apart, and the only thing
keeping a removed kink's number reserved is a tombstone in a file nobody reads.
Separately, changing a kink's meaning (splitting it, say) currently means deleting
its id, which leaves saved answers orphaned. `normaliseAnswer` then treats the
unknown id as a kink with no role pair, and side `b` is lost on the next save.

Intended outcome:
- Each catalogue item carries its own share number.
- Kinks are never deleted from the catalogue, only retired with a date. A retired
  kink disappears from the list, quick fill, compare, search, imports, exports and
  share links, but its answers stay intact and still show in version history,
  marked as retired.
- The kink list is still undeployed (confirmed 2026-10-20), so numbers can be
  assigned now. They keep today's `share-ids.json` positions so links made in dev
  keep working.

## Catalogue shape — `src/lib/kink-list/catalog.ts`, `catalog.json`

- Add `share: z.number().int().nonnegative()` to `itemSchema`, required on every item.
- Add `retiredOn: z.iso.date().optional()` (`YYYY-MM-DD`), with a comment saying why
  kinks are retired rather than deleted.
- Populate `share` in `catalog.json` with a one-off node script (in the scratchpad):
  set `share` = the id's index in `share-ids.json`. Then delete `share-ids.json`.
- `catalogProblems(parsed)` drops its `shareIds` parameter and gains these checks:
  - share numbers are unique and together cover exactly `0..items.length-1`
  - no live item has a retired parent
  - no live item's `alsoUnder` names a retired category
  - a retired item keeps a valid `parent` (it already must, since nothing is deleted)
- New exports, replacing `SHARE_IDS`:
  - `kinkByShare(n)` and `shareOf(id)` (maps built once at load)
  - `isRetired(item)`
  - `kinkById` still returns retired items, because history and names need them
- **Live-only views:** `childrenOf`, `categories`, `relatedKinks` and the search
  index (`catalog.ts:337`) skip retired items. These drive the list, quick fill
  (`deck.ts`), compare (`kinksToCompare`) and the CSV export, so most consumers need
  no change.

## Consumers that look items up directly

- `share-link.ts`:
  - drop `INDEX` / `SHARE_IDS` and use `shareOf` / `kinkByShare`
  - encode skips retired kinks and retired categories in `t`
  - decode drops numbers that are unknown or retired (it already drops unknown ones)
  - update the header comment, which mentions `share-ids.json`
- `answers.ts`:
  - `answeredCount` counts only live catalogue kinks and non-removed custom kinks.
    That fixes the share panel's count, the adopt count and the partner page's
    `hasOwnList`.
  - `effectiveAnswer` and `normaliseAnswer` are unchanged. They now find retired
    items, so a retired kink's sides are no longer collapsed.
- `import/files.ts`:
  - CSV name and id matching (lines ~232 and ~293) ignore retired items
  - `importList` (Bound Up JSON) and `applyImport` in `import/result.ts` skip
    retired ids rather than offering them as matched
  - JSON export (`exportJson`) leaves out retired answers
- `partner.ts`: the `resolved` copy (line ~80) leaves out retired answers, so a
  partner never receives them.
- `deck.ts:113` builds `ORDER` from `catalog.items`. That's harmless, since only
  live keys reach it, but switch it to a live-only list for clarity.
- **History** (`history.ts`, `history/+page.svelte`):
  - `changesBetween` keeps retired kinks.
  - The page's `nameOf` shows the name plus "No longer on the list" with the
    retirement date. The timeline works unchanged.
  - Backstop: drop a retired kink's change when the *earlier* side of the
    comparison ends after `retiredOn`. A change after retirement shouldn't be
    possible anyway.
- **Import snapshots** (`import/lists/*.json`): add a test that no snapshot maps to
  a retired id.

## Guard against renumbering — frozen snapshot

- Add `src/lib/kink-list/share-numbers.fixture.json`, `{ id: number }` for every
  item, generated once from the catalogue.
- Its test in `catalog.test.ts` fails if any recorded id is missing from the
  catalogue (deleted) or has a different `share`, and names the fix ("retire it
  with `retiredOn` instead").
- The test also fails if a catalogue item is missing from the fixture, and says to
  add it with its new number. That keeps the fixture complete without letting it
  decide anything.
- A comment says the fixture is append-only from the first deploy, mirroring
  `src/lib/sealed-fixtures/`.

## Tests

- `catalog.test.ts`: replace the share-ids tests with
  - unique and contiguous numbers
  - the frozen snapshot
  - `catalogProblems` refusing duplicate or missing numbers, a live child of a
    retired parent, and `alsoUnder` naming a retired category (hand-made catalogues,
    as the existing `"k3" is missing` test does)
- `share-link.test.ts`:
  - a retired kink's answer is not encoded
  - an old link carrying a retired number decodes without it
  - tighten the size bound to a realistic ~3000, per the earlier measurement
- `answers.test.ts`:
  - `answeredCount` ignores retired answers
  - a retired role kink keeps both sides through `normaliseAnswers`
- `history.test.ts`: a retired kink's change before retirement is reported, and
  the backstop drops one after it.
- `import` tests: CSV and JSON imports skip retired ids; snapshots never map to one.
- `partner.test.ts`: `resolved` leaves out retired answers.
- Component tests: `KinkCategory` / `KinkListHome` don't render a retired kink. Use
  a test catalogue only if one already exists; otherwise cover this through the
  pure functions above.

Retirement needs a retired item in the real catalogue for some tests. Prefer
`catalogProblems` and pure functions that take hand-made catalogues. Where a test
has to use the real module, mock `./catalog` in that test rather than retiring a
real kink.

## Docs

- `docs/kink-list.md`:
  - rewrite the "`share-ids.json` is append-only" paragraph: the `share` field,
    never deleting, `retiredOn` and what it hides, the snapshot fixture
  - add a short "Retiring a kink" note: retire the old kink and add the new ones
    with the next numbers; answers to the old one are kept but no longer shown
  - update the Sharing section (`keyed by share-ids.json number`) and the Testing
    list
- Comments in `catalog.ts` and `share-link.ts`.
- Copy this plan to `docs/historical-plans/2026-10-20-kink-share-numbers-and-retirement.md`.
- `.local/kinks/tools/export.py` writes `share-ids.json`, but it is outside the repo
  and already stale (`catalog.ts` says the catalogue is hand-edited now), so leave it.
- No roadmap entry, since this is internal.

## Verification

- `npm run check`, `npm run lint`, `npm test`, then `npm run test:e2e`, which
  covers sharing and import through the UI.
- Manually, with a kink temporarily retired in a scratch edit (not committed):
  - answer it before retiring
  - after retiring, it is gone from the list, search, quick fill and compare
  - the share link and the exports omit it
  - history shows the earlier change labelled as retired
  - re-opening and saving the list keeps both sides in the stored answer (check
    with debug mode's raw view)
