# Daydream setup: a simpler default, and casting characters into scenes

## Context

Two problems with the daydream setup screen (`DaydreamSetupForm.svelte`):

1. **It is overwhelming.** It shows every control at once:
   - a name field;
   - 4 voice presets, plus two radio groups and a name input;
   - characters and the scene;
   - "who leads", a limits textarea, and three story dials.

   The character and scene dialogs it opens are just as dense. The user wants
   to keep all of that control, but have a much simpler default, with the
   rest one deliberate click away.
2. **Characters and scenes are modelled as independent, but they aren't.** A
   character's "Who they are to you" (`relationship`) depends on the scene. A
   scene's "Who you are" (`yourRole`) is the other half of the same fact. And
   some scenes suit some characters better than others. The user wants
   characters to stay reusable across scenes, so the two must not be merged.

The decisions made with the user:
- **Simplification:**
  - The name field goes on create. The AI names the daydream after the
    opening passage, with the scene title standing in until then. It is
    renamable on the edit screen only.
  - "How it's told" shows only the presets.
  - "Who leads", "Your limits" and the dials go behind "More options".
  - The dialogs are simplified the same way.
- **Casting:** ideas 1, 2 and 3 from the brainstorm:
  - **Actor vs role.** The library character holds what travels between
    stories. A *casting* on the daydream's copy holds who they are in this
    story.
  - **Scenes declare parts.** A scene can list the parts it needs, and
    characters are cast into them.
  - **The AI writes the link.** It drafts a cast character's relationship and
    part from the character and the scene.

## The data model

This is one sealed-version bump per kind, in `src/lib/sealed-kinds/daydreams.ts`.
Each needs a frozen fixture in `src/lib/sealed-fixtures/fixtures.json` and the
README. Types and constants go in `src/lib/daydream.ts`.

**`daydream-character` v2: the actor.**
- Drops `relationship`.
- The v1 upcast moves a non-empty relationship into `notes`
  (`Usually: <relationship>`, joined by a newline and capped at
  `DAYDREAM_LIMITS.characterNotes`), so nothing a user wrote is lost.
- `CHARACTER_TEXT_FIELDS`, `EMPTY_CHARACTER`, `CHARACTER_FIELD_LABELS`,
  `CHARACTER_CHIPS` and `CHARACTER_TEMPLATES` all lose `relationship`.

**`daydream-scene` v2: parts.**
- Adds `parts: { id, name, description }[]`:
  - at most `MAX_DAYDREAM_CHARACTERS` of them;
  - `id` is a client id;
  - `name` is ≤ 60, e.g. "the interviewer";
  - `description` is ≤ 300, e.g. "runs the office; the one asking the
    questions".
- `yourRole` stays as the user's own part, relabelled "Your part".
- The v1 upcast sets `parts: []`.
- The scene templates in `catalog.ts` each gain one or two parts:
  - After hours → the interviewer;
  - The lost bet → the winner;
  - The facility → the instructor and the observer;
  - The cabin → the one who planned it.

**`daydream-setup` v3: the cast.** Each element of `characters` becomes the
character copy (actor fields and `CopySource`) plus a casting:
`casting: { partId: string | null, relationship: string, part: string }`.
- **`relationship`** (≤ 300) is who they are to you in this story. It is the
  old field, moved.
- **`part`** (≤ 500) is what they're doing or want in this scene.
- **`partId`** points into `setup.scene.parts`, or is null for someone cast
  without a part.

The casting is nested, rather than a separate `cast` array, so every existing
reader of `setup.characters` keeps working. v3 also makes `title` optional:
an empty string means "not named yet".

The superRefine gets two new rules, mirrored in `daydreamSetupFormSchema`:
- every non-null `partId` exists in `scene.parts`;
- no part is cast twice.

The v2 upcast:
- `title` is unchanged;
- each character gets `casting = { partId: null, relationship: character.relationship, part: '' }`
  and loses `relationship`;
- `scene.parts = []`.

**Library sync is unaffected.** `copyState` (`daydream/chips.ts`) compares
revisions of the actor only. "Use the latest" and "keep this one" replace the
actor fields and **keep `casting`**, so recasting someone never reads as the
character having drifted, and updating them never wipes their part.

**Changing scene:** when the daydream's scene is swapped, or updated from the
library, castings whose `partId` no longer exists drop to `partId: null` and
keep their text. Part ids are stable across scene edits, so an updated scene
keeps its castings.

**The server sees no difference.** The server only stores sealed envelopes,
so there is no DB migration. The reply endpoint validates against
`daydreamSetupKind.latest`, so it follows v3 automatically. A tab still open
on the old build gets a 400 from the reply endpoint until it reloads; say so
in the docs' known gaps.

## The setup screen

```
How it's told   [4 preset cards]                 ▸ Fine-tune how it's told
The scene       card / Choose saved · New scene · Surprise me
Who's in it     The interviewer   [Mara ▾]      "your new boss · testing you…"
                The observer      [Cast someone ▾]
                + Add someone else
▸ More options  (Who leads · Your limits · Dials)
[Start daydreaming]
```

- **The scene comes before the characters now**, because casting depends on
  it.
- **The create screen has no name field at all.** The edit screen only has an
  optional **Name** field at the top, hinted "Leave empty to have it named
  for you".
- **"Who's in it":**
  - There is one row per scene part, each with a dropdown of library
    characters plus "New character".
  - Unfilled parts are allowed and are left out of the prompt.
  - "Add someone else" adds a character with no part. The total stays at
    most `MAX_DAYDREAM_CHARACTERS`.
  - A scene with no parts shows only the plain list, as today.
  - Each cast card shows the name, the part name, and the relationship and
    part text, and keeps the existing copy-state actions.
- **Disclosures:** `wa-details`, already registered in `webawesome.ts` (the
  iq-test `SetupDialog.svelte` is the precedent).
  - Each **starts open on edit when it holds something non-default**: the
    voice when no preset matches or a protagonist name is set, and More
    options when `lead !== 'character'`, limits are set, or the dials differ
    from `DEFAULT_STORY_DIALS`.
  - A `voice` problem shows under the presets, so it stays visible while
    the pickers are collapsed.
  - A `wa-details` fires a bubbling `wa-after-hide`. Both dialogs already
    check `event.target === dialog`; keep that check.

## The character dialog: two halves

`DaydreamCharacterDialog.svelte` gets an optional `casting` prop. It is given
when opened from a daydream and left out when opened from the library
(`DaydreamLibrary.svelte`).

- **"In this story"** is shown only with `casting`, and comes first. It is
  daydream-only and never saved to the library. It holds:
  - the part (a select of the scene's parts, plus "No particular part");
  - "Who they are to you" (relationship), with the old relationship chips
    moved here;
  - "Their part in this", with a short chip list in `catalog.ts`;
  - **"Write their part"** (idea 3, when suggestions are on).
- **"About <name>"** is the actor. "Save to my characters" applies only to
  this half.
  - **Shown by default:** the templates (new only), Name, Type and
    Personality.
  - **Behind `<wa-details summary="More detail">`:** the tone and sliders,
    speech, appearance, likes and notes. It starts open when any of those
    is filled.
  - "Fill in the rest" still fills hidden fields, and opens the details when
    it does.
- **`onsaved`** hands back `(character, casting, sealed?)`, and
  `putCharacter` stores both.

**Casting from a dropdown,** without opening the dialog, adds the library
character with an empty casting. When suggestions are on, it then **drafts
the casting automatically**, showing "Writing their part…" on the card and
filling only empty fields. On failure it stays silent and leaves the fields
empty, because nobody is waiting on it.

## The scene dialog

- **Shown by default:** the template/surprise header, Title, What's going on,
  and **Parts**.
  - Parts is a compact editor: a list of name and description rows, with
    "Add a part" up to 4 and a remove button on each.
  - It sits in the default view because parts are what casting hangs on.
    It may be left empty.
- **Behind "More detail":** setting, Your part (`yourRole`), tone and notes.
- Add `SCENE_PRIMARY_FIELDS` and `CHARACTER_PRIMARY_FIELDS` to
  `daydream.ts`. The full field lists stay as they are for fill and
  suggestions.
- `surprise-scene` and the scene `fill` also return parts:
  - `parseSurpriseScene` and `parseFill` in `daydream/suggestions.ts` read
    and bound them;
  - the instructions in `server/daydream/suggest-prompt.ts` ask for them.

## The model

**The prompt** (`src/lib/server/daydream/prompt.ts`, `describeCharacter` /
`describeSetup`):
- Each character is introduced as `## Mara — the interviewer` when cast
  into a part.
- Under that come `Who they are to the user: …` (from `casting.relationship`)
  and `Their part in this scene: …`, followed by the actor fields.
- The scene section lists only the parts that were cast, by name and
  description. The user's `yourRole` line is unchanged.

**New suggest tasks**, in `suggest-prompt.ts`, `suggestions.ts` and
`suggest.ts`. Both go through the same endpoint, disclosure check, rate
limiter and no-logging rules, so `api/daydreams/suggest/+server.ts` should
only need its schema:
- **`casting`** gets the actor's fields, the scene's title, premise, setting
  and `yourRole`, the part being filled (if any), the other cast members'
  names and parts, and the voice stance. It answers
  `{ "relationship": "…", "part": "…" }`. Add `parseCasting` to read it.
- **`name`** gets the scene title and premise, the cast names, and the
  opening passage's text (≤ 2000). It answers `{ "title": "…" }`, at most
  `DAYDREAM_LIMITS.title` characters. Add `parseName` to read it.

**Auto-naming:** `DaydreamStory.nameIfUnnamed()` in
`src/lib/daydream/story.svelte.ts`.
- It runs once per visit, when the title is empty, suggestions are on, and
  the path holds a story passage.
- It is triggered from `DaydreamThread.svelte` after `open()`, and on a
  later visit to a daydream that was never named.
- It saves through the existing `saveSetup`. On failure it is silent and
  does not retry.
- Display goes through a new `daydreamTitle(setup)` helper
  (`title.trim() || scene.title`):
  - the list (`daydreams/+page.svelte:48`);
  - the header (`daydreams/[id]/+page.svelte:12`);
  - `DaydreamsWidget.svelte`, and anywhere else that shows a setup's title.

## Docs, roadmap, plan copy
- **`docs/daydreams.md`:**
  - Rewrite "Setup", which is already stale (it still mentions a safeword
    and a single character).
  - Add a **"Characters, scenes and casting"** section: actor vs casting,
    parts, what sync compares, what happens to castings when the scene
    changes, and the automatic drafting and naming.
  - Add the two new tasks to "What the server sees": the `casting` task
    sends the actor and scene text, and the `name` task sends the opening
    passage.
  - Add the stale-tab 400 to the known gaps.
- **Roadmap:** check `src/lib/roadmap/roadmap.json` for a Daydreams entry,
  and add a twig if one fits.
- **Plan copy:** copy this plan to
  `docs/historical-plans/2026-10-16-daydream-setup-casting.md`.

## Tests

**Pure:**
- the sealed fixtures for character v2, scene v2 and setup v3, and each
  upcast:
  - relationship goes into notes on the library character;
  - relationship goes into the casting on the setup;
  - parts default to `[]`;
- the setup superRefine (an unknown `partId`, a part cast twice);
- `daydreamTitle`;
- `parseCasting`, `parseName`, and parts in `parseSurpriseScene` and
  `parseFill`;
- `suggest-prompt` request bounds and instructions for the new tasks;
- `prompt.test.ts`: a cast character's heading, relationship and part, and
  that uncast parts are omitted.

**Server:** `api/daydreams/suggest/server.test.ts` accepts valid `casting` and
`name` requests and refuses oversized ones.

**Component:**
- **`DaydreamSetupForm.svelte.test.ts`:**
  - the create screen has no name field, and edit has one;
  - the disclosures are closed on create and open on edit when non-default;
  - a voice problem shows while the pickers are collapsed;
  - one cast row per part;
  - swapping the scene nulls the `partId`s that no longer exist and keeps
    their text;
  - "use latest" keeps the casting.

  The existing "keeps the spaces typed…" test moves to edit mode, with More
  options open.
- **`DaydreamCharacterDialog.svelte.test.ts`:**
  - "In this story" only appears with `casting`;
  - the library save excludes the casting;
  - the More detail split, and its auto-open.
- **A new `DaydreamSceneDialog.svelte.test.ts`:** the parts editor (add,
  remove, the cap), and the More detail split.

**E2E (`e2e/daydreams.spec.ts` plus `e2e/model-stub.mjs`):**
- The stub learns the `casting` and `name` tasks.
- `startDaydream` stops filling the title, and picks the scene before the
  characters.
- New: create a scene with a part, cast a character into it, and check
  their drafted part shows on the card.
- New: after the opening, the list and the header show the AI's name; with
  the stub failing `name`, the scene title shows.
- The rename test (~426–443) goes through the edit page.
- The specs at ~326, 372 and 380 open the disclosures where they need to.

## Verification
- `npm run check`, `npm run lint` and `npm test` (vitest plus playwright).
- In `npm run dev`, create a daydream from a preset, a template scene and one
  cast character, and check:
  - the default screen is short;
  - the part is drafted;
  - the name appears after the opening;
  - the edit page shows the name and the castings, and opens the customised
    sections.
- In the library, check that editing a character has no "In this story"
  half, and that an existing character's old relationship is now in its
  notes.
