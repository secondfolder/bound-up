# A friendlier way to start a daydream

## Goal

`/daydreams/new` asks a newcomer to understand voices, scenes, parts and
casting before anything happens. Give it a friendly default path that still
leads to every control.

## What changes

### 1. The starter page (`/daydreams/new`)

One page, three ways in, in this order:

- **Describe it** (only with suggestions on): one text box, "What do you feel
  like?", with example chips that toggle into it. "Write it" asks the model
  for a whole setup (new suggest task `daydream`): a voice preset, a scene
  with parts and heat/kink, and up to `MAX_DAYDREAM_CHARACTERS` characters
  each cast into a part with who they are to the user. The answer is checked
  in the browser like every suggestion (`parseSuggestedDaydream`) and turned
  into a setup (`suggestedSetup`), falling back to a voice that works when the
  model picks one that cannot.
- **Or pick one**: ready-made stories (`DAYDREAM_STARTERS` in
  `daydream/catalog.ts`), each a scene template, a voice preset and character
  templates cast into the scene's parts with their casting written. Ordered by
  heat, each saying its level. Work without suggestions; nothing leaves the
  device.
- **Build it yourself**: the full form, empty, as today.

Either of the first two lands on the setup in its **sentence** layout. Back to
the ways in is a button on the page (in-page state, no URL change).

### 2. The sentence layout (in `DaydreamSetupForm`)

The setup as a fill-in-the-blanks sentence, built by a pure function
(`setupSentence` in `daydream/sentence.ts`):

> I want a **[steamy]** story where I talk with **[Lady Vale]** in
> **[After hours]**.

with the premise and each character's part on a quieter line beneath. Each
blank is a control: the heat opens a menu of levels, the voice a menu of the
four presets, a character's name their dialog, the scene title the scene
dialog, and "someone" the cast menu. "Anything off the table?" holds the
limits. Buttons: **Start daydreaming**, **Try another** (for a described one),
**Customise everything** (switches the same form to the full layout, nothing
lost). It is the same superform as the full layout, so it shares its dialogs,
its sealing and its submit.

### 3. How it's told, last and inferred (idea 5)

In the full layout "How it's told" moves to the end of the form, just above
the submit button, as a one-line summary with **Change**. Until the user
picks a voice themselves, it follows who is in the story (`inferVoice`): no
characters is "A story told to you", any is "Talk with a character". Watching
and a system are only ever chosen. Choosing one (in the full layout's picker
or the sentence's menu) stops the inferring. The edit page treats the stored
voice as chosen. A voice problem is shown in the summary too, so a closed
picker never hides why the form will not save.

### 4. The voice picker shows one description at a time (idea 7)

The presets become a list of names only (radio semantics), with a panel
beside them (below on a narrow screen) describing the selected one: a
sentence on what it is and two example lines. Choosing another option shows
its description. The fine-tune radios lose their hints the same way; the
panel then describes the selected narrator and stance when no preset matches.
A blocked choice still says why it is blocked. The words live with the
presets in `daydream.ts` (`description`, `examples`).

## Tests

- Pure: `inferVoice`, every starter builds a setup that passes
  `daydreamSetupFormSchema`, `parseSuggestedDaydream` / `suggestedSetup`
  (caps, part matching, voice fallback), `setupSentence` for each voice.
- Server: the suggest prompt accepts and builds the `daydream` task.
- Component: the voice picker's description panel follows the choice; the
  setup form puts the voice last with inference and Change; the sentence
  layout; the starter page.
- e2e: update the existing setup helpers to go through "Build it yourself" and
  the voice's Change; add a ready-made start, a described start (stub model),
  and Customise everything.

## Docs

- `docs/daydreams.md`, "Setting it up": the starter page, the sentence, the
  voice last and inferred, the picker; the idea box keeps no draft (known
  gap).
- Roadmap: a shipped twig under Daydreams.
- This plan into `docs/historical-plans/`.
