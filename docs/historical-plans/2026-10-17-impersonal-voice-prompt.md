# Make "The rules" daydream voice actually sound like the rules

## Context

When "The rules" (`narrator: 'impersonal'`) is chosen, the model gets one
abstract sentence about the voice
(`describeNarrator`, `src/lib/server/daydream/prompt.ts:151-152`), and
everything else in the prompt points it towards ordinary narrative fiction:

1. **One sentence, no examples.** "Procedural, exact, never personal" is
   abstract. The default model (`hermes-3-llama-3.1-70b`) follows examples much
   more than adjectives, and has none to go on.
2. **It's buried early.** That sentence sits at the top of the setup, then
   comes a kilobyte or more of scene written as prose ("Where", "Tone", the
   characters). By the time it writes, the most recent thing the model has read
   is about scenery.
3. **Other text contradicts it:**
   - `OPENING_REQUEST` says "Set the scene", which asks for a narrator's
     description.
   - `leadLine` says "the characters lead / make the decisions", which makes
     them people rather than the system's functionaries.
   - The suggestion and direction guidance assumes ordinary story turns.
4. **The opening sets the pattern.** Once the first passage comes out as
   narration, every later reply copies it, because the earlier assistant turns
   are the strongest example the model has.

The aim is a voice that comes out as notices, numbered rules, logged compliance
and procedural consequences, from the first passage on. The examples show the
*form* of the writing, and are picked by the scene's heat dial (decision: a tame
set and an adult set). Only this voice gets examples (decision): the other three
voices are ordinary fiction, which the model already writes well.

`prompt.ts` has uncommitted changes in the working tree (`describeSceneDials`,
the new `RULES` opening). Build on them and do not revert them.

## Where the work happens

The work is done in a separate git worktree, made with EnterWorktree from
`HEAD`, on a branch such as `daydream-system-voice`.

- **Setup:** run `npm install` there, and copy `.env` in from the main
  checkout. It is gitignored, and the comparison script needs
  `OPENROUTER_API_KEY` from it.
- **Commit:** commit in the worktree with conventional messages, for example
  `feat(daydream): give the system voice its own guide and examples`.
- **Merge:** when verification passes, merge the branch into `main` in the main
  checkout.
  - The main checkout has uncommitted changes in `src/lib/daydream.ts` and
    `src/lib/server/daydream/prompt.ts`, which this work also touches, so
    `git merge` will refuse while they are there.
  - If that is still the case at merge time, **stop and ask** whether to commit
    them first or to stash, merge and pop. Do not stash someone's in-progress
    work without asking.
  - Afterwards, re-run `npx vitest run src/lib/server/daydream` and
    `npm run check` on main.
- **The worktree's own tests:** `e2e` ports and databases are per checkout
  (`e2e/run-paths.ts`), so the suite can run in the worktree.

## Changes

### 0. Rename the option, and show what it sounds like

"The rules" with the hint "An impersonal authority, no one behind it" does not
tell a user what they will get. Each hint gets a short example line, the way
the narrator choices already show "“You feel the rope tighten…”". This is in
`src/lib/daydream.ts`:

- **Preset** (`DAYDREAM_VOICE_PRESETS`, id `rules`, line ~94): the label
  becomes **"A system in charge"** and the hint becomes **"No narrator, just
  rules giving you orders: “Rule 2 broken. Infraction logged.”"**. The `id`
  stays `rules` and the value stays `impersonal`, so nothing already stored
  changes.
- **Narrator choice** (`DAYDREAM_NARRATORS`, line 56): the label becomes **"A
  system"** and the hint becomes **"“Kneel at the line. Wait for the tone.”"**.
  That matches the other narrator hints, which are quotes.
- Update the shapes table in `docs/daydreams.md` (line 56) to say "A system in
  charge".
- Nothing else uses the label. The picker's hints already wrap
  (`DaydreamVoicePicker.svelte`, `.hint` styles), so a longer hint fits.

### 1. New module: `src/lib/server/daydream/impersonal-voice.ts`

This keeps the guide and its examples out of the already long `prompt.ts`. It
exports:

- `impersonalGuide(characterCount: number, heat: DialValue | null): string`
  returns a `# Writing as the rules` section:
  - **What you are:** the system itself (a house's rules, a facility's protocol,
    an institution's procedures), not a narrator and not a character.
  - **The forms it writes in:** notices, numbered rules and amendments,
    instructions with exact counts, times and durations, records and logs
    ("Compliance recorded.", "Infraction 2 of 3."), and assessments with
    results. Present tense, flat and exact.
  - **How it addresses the user:** "you", or the one term the institution
    would use ("the resident", a number), kept consistent.
  - **Never:** a storyteller's description of the room or the user's feelings
    ("you feel", "you notice"), moods, warm praise, or explanations beyond what
    a rule states.
  - **How it responds to the user:** as procedure. It acknowledges, records,
    rules on what happened, and gives the next step or consequence under the
    rules it has already issued. It keeps those rules consistent and refers to
    them by number.
  - **With characters:** they are functionaries (an attendant, an examiner).
    They appear as the system reports them, or speak in the clipped words of
    someone following procedure.
  - **With no characters:** no one is behind it. Anything physical happens
    through a mechanism or a schedule: a light, a lock, a tone, a timer.
  - **A caveat for the examples:** "The examples show the form only. Do not
    reuse their wording, rules or setting; take everything from the scene
    above."
  - **The examples themselves:** `heat === null || heat <= 2` gets the tame set
    and `heat >= 3` (Steamy and up) gets the adult set. Unset heat falls back to
    tame, because the scene's own words still decide the content.
- There are four short examples in each set. Each covers a moment the model has
  to handle: the opening notice, a reply to compliance, a reply to a breach,
  and a functionary acting. A draft of the tame set:

  ```
  RESIDENCE PROTOCOL — INTAKE
  You have been admitted. The following applies from this moment.
  1. You will answer every question put to you, in full sentences.
  2. You will not leave the marked area without permission.
  3. Permission is requested by raising your hand and waiting. It may be refused.
  Acknowledge these rules by stating your intake number. Your intake number is 14.
  ---
  Acknowledgement received, 14. Logged at 21:04.
  Phase 2: remain standing at the line. Duration: ten minutes. A tone will sound at completion. Movement before the tone resets the count.
  ---
  Rule 2 breached at 21:09. Infraction 1 of 3 recorded.
  Consequence under Rule 2: the count is reset. Questions remaining this session: one.
  ---
  The examiner will now review your conduct. The examiner does not answer questions. Hold the form out at arm's length until it is taken.
  ```

  The adult set uses the same four moments with sexual content at the steamy
  level: clothing surrendered at intake, an inspection by number, and
  unauthorised release logged as an infraction. It stays sensual rather than
  graphic, because the heat dial already tells the model how far to go. Both
  sets live in the module as data, with a comment saying why there are
  examples at all (the bug above) and why there are two sets.

### 2. `prompt.ts`: put the guide where the model will act on it

- Shorten `describeNarrator`'s `impersonal` case to a pointer, such as "You speak
  as the rules themselves — see Writing as the rules, below." It keeps the
  persona name and the functionaries / no-one-behind-it clause.
- In `buildMessages`, insert `impersonalGuide(...)` **after `READING` and before
  the reply format**, only when `setup.voice.narrator === 'impersonal'`. Putting
  it near the end of the system prompt is the fix for point 2 above. Leave it
  out of the stopped-scene branch, because the check-in is plain and out of
  character.
- **Opening request by voice:** add `openingRequest(voice)`. For the impersonal
  voice it is "(Begin. Open with the first notice or rules the system issues to
  me, not a description of the scene, and end where I must respond.)". The
  other voices keep the current text.
- **`leadLine` for the impersonal voice:**
  - `character`: "The system leads: its rules and functionaries set the pace
    and give every instruction."
  - `me`: "The user leads: the system answers what they ask of it, granting or
    refusing it under its rules."
  - `shared`: the same idea, with control traded back and forth.
- **`replyFormat` takes the voice.** For the impersonal voice:
  - The suggestions line says the user's replies to the system: complying,
    asking or petitioning it, or refusing.
  - The direction ideas become things like Stricter, New rule, Inspection and
    Skip ahead.
  - Everything else stays the same.

### 3. Tests: `src/lib/server/daydream/prompt.test.ts`

- An impersonal setup's system message contains `# Writing as the rules`, and
  the guide comes after `# Reading the user's turns` and before
  `# Reply format`.
- Heat `null`, `1` and `2` get the tame examples. Heat `3` to `5` get the adult
  ones. Assert on a marker unique to each set.
- The other three narrators get no guide.
- A stopped impersonal scene gets the check-in, not the guide.
- The opening request for the impersonal voice asks for the system's first
  notice. The other voices still get "Set the scene".
- Lead-line wording for the impersonal voice, and the suggestions wording.
- Update the existing `describeVoice` assertion on line ~304-305 to the new
  wording.

### 4. Docs

- `docs/daydreams.md`, "How it's told": add a short paragraph. The rules voice
  gets its own guide with examples, placed late in the prompt, picked by heat,
  and opens with a notice. Add a line to "The system prompt is the server's"
  about where the guide sits.
- Copy this plan to `docs/historical-plans/2026-10-17-impersonal-voice-prompt.md`.

## Verification

1. `npm run check`, `npm run lint`, and
   `npx vitest run src/lib/server/daydream`.
2. **Compare real output.** A throwaway script in the scratchpad (not
   committed) builds the messages with `buildMessages` for three impersonal
   setups: no characters at SFW, one functionary at Explicit, and a
   user-leads setup. It sends them to OpenRouter with the configured
   `DAYDREAM_MODEL`, using `OPENROUTER_API_KEY` from `.env`. Run it once on the
   current `prompt.ts` (git stash) and once after the change, then read both
   sets. The check is that the openings and the reply to a "I step over the
   line" turn are notices and rules, not narration.
3. `npm run test:e2e -- daydreams` to confirm the stubbed model flow still
   passes.
4. Open the app and check the new label and hint in the voice picker, on a
   phone-width window as well. Then create a daydream with "A system in
   charge" and read the first two passages.
