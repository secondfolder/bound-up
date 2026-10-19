# Kink list groundwork: draft catalogue, brainstorm, roadmap

This plan prepares for building the kink list. It doesn't build it. Its main
output is the draft catalogue and the design notes, which the feature plan
(storage, screens, partner inheritance, history, compatibility) will build on.
The roadmap edits are a small side step.

## Context

The kink list is the next big Playroom feature. `kink-list` already exists on the
roadmap, but under **Notebook**, with "Compare kink lists" as a separate leaf
under Partners. The user wants it, and five related items, moved under
**Playroom**. They also want its planned shape on the roadmap: version history
and solo/partner lists, with comparison folded in. The research across ten kink
lists should turn into a draft catalogue to build the feature from later.

Decisions already made with the user:
- **Solo/partner model: inherit + override.** A partner list follows your own
  list except for the answers you change for that partner. An answer set for the
  first time in a partner view is written to the **solo** list, and the partner
  list inherits it.
- **Compare kink lists becomes a twig of Kink list.**
- **Twigs to add:** version history and solo & partner lists. Detail control
  stays as the existing note, with no twig. Emotions and roles stay out of the
  roadmap but go into the draft catalogue.
- **The catalogue is a gitignored draft** in `.local/kinks/`, not committed code.

## 1. Roadmap — `src/lib/roadmap/roadmap.json`

The file already has uncommitted Daydreams edits (`daydreams-easy-start`, a
reworded note). Edit around them and keep them.

- **Move into the `playroom` branch, after `iq-test`, in this order:**
  `kink-list`, `kink-quizzes`, `toy-collection`, `wish-list`, `stats-deck` and
  `report-card`. Move each object verbatim. Notebook keeps contract-rules,
  journal-notes, sticker-book, activity-log and notebook-organisation.
- **Playroom summary:** "Toys and games to play with, alone or together." →
  "Toys, games and lists to play with, alone or together." (it now holds lists)
- **Remove the `compare-kink-lists` leaf from `partners`.**
- **Give `kink-list` its `children`** (twigs carry no `icon`, all `planned`):
  1. `per-partner-kink-list` — "Kink list per partner" — "Your list carries
     over to each partner, and you can change any answer just for them."
     Notes:
     - "Answers follow your own list until you change one for a partner"
     - "Answer something for the first time with a partner and it goes on your
       own list too"
     - "See every answer that's different for a partner, and keep it or put it
       back"
  2. `compare-kink-lists` — "Compare kink lists" — "See where your interests
     overlap." Drop its `icon`, and drop `dependsOn: ["kink-list"]`. The parent
     drawer already lists it as a child, and keeping it would render a second
     "Compare kink lists" link in the same drawer, which breaks the
     unique-accessible-name rule.
  3. `kink-list-history` — "Kink list history" — "See how what you're into
     has changed over time." Notes:
     - "A new version is kept once a week has gone by without changes"
     - "See what moved: curious to favourite, a new limit, something you've
       since tried"
- **Keep everything that points at moved items.** `daydreams-kink-list` and
  `generated-guides` still use `dependsOn: kink-list / toy-collection /
  stats-deck`. Ids don't change, so the references still resolve.
- Copy follows docs/roadmap.md: user-facing, with no encryption language.

**Tests to update:**
- `src/lib/roadmap/roadmap.test.ts:133-136`. `dependents('kink-list')` no
  longer contains `compare-kink-lists`, so assert `daydreams-kink-list`
  (alongside `generated-guides`).
- `src/routes/(public)/roadmap/page.svelte.test.ts:41-53`. The "Compare kink
  lists" link still renders, now as a child. Keep the assertion, and add one
  for the "Kink list history" child link.
- Optional: in the `findItem` test, add that `findItem('kink-list-history')?.parent?.id`
  is `kink-list`, and that its branch is `playroom`.

**Docs:**
- docs/roadmap.md uses "Sessions, Notebook, Partners…" only as example
  branches, so it needs no change.
- Check that docs/playroom.md doesn't list the roadmap's Playroom contents; it
  shouldn't.

## 2. Draft catalogue — `.local/kinks/` (gitignored)

**Source material.** These are already downloaded to the session scratchpad:
- the SpankPls JSON
- the kinkli.st `config` (315 items, with spice level, flags and roles)
- the Duchy xlsx (CC BY-SA 4.0)
- both Google Sheets (as CSV)
- the kinkbdsmtest checklist and types, KinkSheet, KNKI and the Wikipedia
  glossary
- the Tumblr 400-tropes list

The two Reddit posts couldn't be fetched, so they're left out unless the user
pastes them in.

**`catalog.json`** is written by hand rather than by a merge script, because
the hierarchy and the deduplication need judgment. Its shape:

```jsonc
{
  "version": "draft-2026-10-19",
  "roles": { "give-receive": ["Giving", "Receiving"], "dom-sub": [...], "self-partner": [...],
             "do-watch": ["Doing", "Watching"], "aggressor-target": [...], "none": [] },
  "tags": ["degrading", "pain", "fluids", "public", "permanent", "consent-risk", "safety", ...],
  "items": [
    { "id": "impact", "name": "Impact play", "parent": null, "roles": "give-receive",
      "intensity": 2, "tags": ["pain"], "aliases": [], "description": "…", "fantasyOnly": false,
      "alsoUnder": [], "sources": ["kinkli", "duchy", "spankpls"] },
    { "id": "spanking", "parent": "impact", ... },
    { "id": "spanking-paddle", "parent": "spanking", ... }
  ],
  "emotions": [{ "id": "owned", "name": "Owned", "roles": "feel-elicit" }, ...],
  "identities": [{ "id": "brat", "name": "Brat" }, ...]
}
```

- **Hierarchy:** at most 3 levels (category → kink → specific), so "answer at
  any depth" has something to work on. Each item has a primary `parent`;
  `alsoUnder` covers SpankPls-style membership of several categories
  (Rimming: Anal, Oral, Worship).
- **Fields:**
  - `intensity` is 0–5, adapted from kinkli.st's spice level, for the
    intensity gate.
  - `roles` names the pair the item asks about.
  - `fantasyOnly` marks tropes and items that only make sense as fiction.
    These feed Daydreams.
- **Descriptions are our own words**, never copied, because the Duchy's licence
  is share-alike and the others have no stated licence. A short safety note
  goes on risky items (breath play, blood, fisting…).
- **Excluded entirely:** anything sexualising minors (lolicon/shota,
  "underage", sexualised age groups) and bestiality. Real-harm items from the
  Tumblr list (snuff, amputation, mutilation, suicide…) aren't added. They're
  listed in the exclusions file so the user can decide.
- **Out of scope:** profile and stat questions (STI tests, allergies, body
  details) belong to `stats-deck`, so they're listed in the notes for it rather
  than in the catalogue.

**`catalog-coverage.md`** maps every source item to the catalogue id it merged
into, or to "excluded: reason". Nothing from a source is dropped silently. It
also records each source's answer scale and role model, for when the answer
format is designed.

**`brainstorm.md`** keeps the brainstorm from this conversation:
- the detail-control options
- the versioning design: a version per burst of edits, frozen after 7 quiet
  days, and stable ids and aliases so catalogue changes aren't user changes
- the inherit + override rules
- compatibility: role-aware matching, per-category scores, an optional blind
  mode, hard limits that stay sticky
- the other ideas

**A throwaway check script in the scratchpad**, kept out of `.local/` and out
of the repo, runs over the catalogue. It checks that:
- ids are unique, kebab-case
- every `parent` and `alsoUnder` exists
- there are no cycles and depth is at most 3
- every role key and tag is declared

It also prints counts per category.

## 3. Historical plan

Copy this plan verbatim to `docs/historical-plans/2026-10-19-kink-list-roadmap.md`,
following AGENTS.md.

## Verification

- `npx vitest run src/lib/roadmap "src/routes/(public)/roadmap"`: the Zod parse
  and `crossReferenceProblems` (unique ids and titles, dependsOn targets, no
  cycles) plus the updated tests.
- `npm run check` and `npm run lint` (Biome formats the JSON with tabs; run
  `npm run format` if needed).
- `npm run dev`, then open `/roadmap#kink-list`:
  - it sits under Playroom with three twigs
  - the drawer shows "Compare kink lists" once
  - "Leads to" still lists Daydreams from your kink list
- Run the catalogue check script with no errors, and spot-check the coverage
  file against each source's item count:
  - SpankPls: 66 unique
  - kinkli.st: 315
  - the Duchy: about 290
  - your Google Sheet: about 207
- Don't commit unless asked. The working tree already has unrelated
  uncommitted Daydreams work.
