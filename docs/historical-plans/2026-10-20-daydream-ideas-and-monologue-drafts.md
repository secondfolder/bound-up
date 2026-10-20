# Ideas, not scenes, and drafts that can be monologues

## The problem

A brief like "take inspiration from these subreddits, list the common
themes and ideas and build on them" came back as a story: a private estate,
a new arrival, a handler, told in the characters' own words. What was
wanted was a monologue built from the sayings. The monologue voice only
existed once passages were being written; everything before it — the brief,
the draft, its summary — was built to produce a plot.

## Review: where it goes wrong

1. **The voice is chosen last, and defaults to `talk`.** The `daydream`
   prompt says "the user wants a story like this", gives the story-craft
   checklist (who the people are to each other, where, why now), and only
   then asks for a voice, with "Choose talk unless what they wrote asks for
   another". By then the plot is written.
2. **Every scene field asks for a plot**: a setting, "what is going on as it
   starts", who the user is in it, at least one part and one character.
3. **The summary is written as a plot description**: "what the story is",
   the scene blank as "the story's situation".
4. **The sayings have nowhere to go.** The draft's answer has no field for
   them; the setup's scene notes, which the reply prompt already reads, are
   never filled.
5. **"Suggest stories" has the same problem and loses the voice**: ideas
   are "who they are with, where, what is going on", and a picked one is
   sent on as "title: premise" only.
6. **Smaller, in the reply prompt**: "Telling the story" is about
   continuity of clothes and rooms; the monologue guide's examples show only
   short statement paragraphs, never the longer inner-voice kind.

## Decisions

- Make the recommended prompt changes, **and** the heavier option: rename
  the scene.
- The scene becomes the **idea** ("The idea", "Your ideas", "Choose a saved
  idea", "Use this idea"); its "What's going on" field becomes "What it's
  about". "Premise" was considered: the library would read "Your premises",
  and the scene already has a field called premise.
- "Story" becomes **daydream** where it means the whole thing.
- The rename goes through the code, the prompts and the docs too, not only
  user-facing copy.
- The model not opening links in a brief is acceptable for now.

## What changes

### Voice first

- The `daydream` prompt decides the voice before anything it shapes, with
  cues for each (`VOICE_CUES`): sayings, beliefs, mantras, slogans, captions
  or themes to be said and built on, with no plot asked for, are a
  monologue. The answer gives `voice` first and the summary last.
- A story gets `STORY_CRAFT`; a monologue gets `MONOLOGUE_CRAFT` (the
  beliefs and sayings it is built on, who speaks to whom, where the ideas
  go; no plot, place or encounter unless asked for).
- A monologue's idea, field by field: a title naming its theme, the premise
  as what the voice believes, the user's part as who they are to it, the
  setting usually empty, the notes as eight to twelve sayings one to a line,
  no parts and no cast unless a named character is the one speaking.
- The summary is written to match: for a monologue, what the voice says and
  to whom, not events.

### Ideas carry a voice

- Each generated idea gets a `voice`, chosen with the same cues; a card
  shows it. Picking one sends the voice with its brief, and the `daydream`
  prompt keeps it.

### The idea, read as a monologue's

- The idea's field labels and hints have a monologue version
  (`ideaFieldLabels`); its sayings ("Sayings to build on") are up front in
  the dialog (`ideaPrimaryFields`).
- The setup form tells the idea dialog's suggestions how the daydream is
  told (`narrator` in the suggest context), so Fill in the rest and Surprise
  me write a monologue's idea, sayings included, with no parts.
- Sayings that run over the notes cap keep as many whole lines as fit.

### The reply prompt

- `RULES` opens on a daydream: a story or a monologue.
- `describeSetup` describes a monologue's idea as what the voice believes
  and who the user is to it, with its sayings on lines of their own.
- A monologue gets its own telling section (`MONOLOGUE_TELLING`) in place of
  "Telling the story".
- The monologue guide allows longer runs grounded in everyday life, and each
  example set gains one of that kind.

### The rename

- `scene` → `idea` throughout the code (types, constants, functions,
  components, routes, request schemas, the summary's `[[idea|…]]` marker),
  the prompts and the docs. `DaydreamSceneDialog` → `DaydreamIdeaDialog`;
  `/daydreams/scenes` → `/daydreams/ideas`, with a redirect from the old
  path; `/api/daydreams/scenes` → `/api/daydreams/ideas`.
- Stored names keep the old word: the `daydream_scenes` table (exported as
  `daydreamIdeas`), the `daydream-scene` sealed kind name, and the `scene`
  key in setup payloads v1–v3. Setup v4, not yet deployed, stores `idea`;
  the v3 upcast moves the key, and the v4 fixture is re-sealed.
- "Stop the scene" and "scene break" keep the word in their own senses.
- "Story" → "daydream" in copy, comments and identifiers where it means the
  whole daydream (`StoryPieces` → `DaydreamPieces`, the new-daydream page's
  buttons and headings, the stance descriptions); "story" stays for what the
  narrated voices tell and the text the model writes (the story model, the
  story tree, the `story` turn role).
- What the user types on the new-daydream page is the **brief**
  (`DAYDREAM_LIMITS.brief`, `ideaBrief`), so "idea" means one thing.

## Tests

- Prompt: voice asked and answered first; the monologue cues; a suggested
  voice kept; sayings in the notes, no parts or cast; ideas with voices and
  both crafts; monologue fill and surprise; the reply prompt's monologue
  idea lines, telling section and inner-voice examples.
- Parsing: a generated idea's voice; a monologue draft with no cast; whole
  sayings kept past the cap.
- Components: the idea dialog's monologue fields; a generated card's voice.
- Route: the old scenes library redirects.
- e2e: a brief for sayings set up as a monologue, its sayings in the idea
  dialog, opening with a standout line; a generated monologue idea written
  out as one.

## Docs

- docs/daydreams.md: an "Ideas" section (the word, the monologue's fields,
  stored names, the vocabulary), voice-first drafts, ideas with voices, the
  summary's wording, the monologue's telling and examples.
- docs/encryption.md, the sealed fixtures README, the roadmap's wording.
