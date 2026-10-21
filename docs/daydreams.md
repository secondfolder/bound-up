# Daydreams

A daydream is a story a user makes up and plays. They choose how it is told,
who is in it, the idea and their limits; the story opens by itself; then
they move it on — by writing, by pressing a button, by rolling a die — and
it answers. The passages are written by a hosted language model, reached
through OpenRouter.

The name is deliberate. Not "bot" or "AI", and not anything that suggests the
characters stand in for a partner: it is more than solo play and less than an
idea with another person.

## Setting it up

`/daydreams/new` and `/daydreams/[id]/edit` (`DaydreamSetupForm.svelte`).

### Starting one

`/daydreams/new` opens on the ways in rather than the form
(`DaydreamStarter.svelte`), friendliest first, because the form asks for
things — a voice, an idea with parts, a cast — that mean nothing until
someone has played one:

- **What do you feel like?** One box, and under it a row with "You as" at
  the start and two buttons at the end, both working from what is in the
  box — the *brief* — for the side chosen. **Write this
  daydream** asks the model for a whole daydream (the `daydream` suggestion): a
  voice, an idea with its parts and its heat and kink, and up to
  `MAX_DAYDREAM_CHARACTERS` characters, each cast into a part with who they
  are in it, with the user on the side chosen if there is one. **Suggest
  daydreams for this** asks for a few like it instead, shown in place
  of the ready-made ones (below). Only with suggestions on; without them the
  box and its buttons are not shown, and "You as" sits under "Daydream
  suggestions". There
  used to be idea chips under the box; the ready-made and suggested daydreams
  do that job now.

  **The voice is decided first.** A brief rarely names a voice, and one
  like "list the things people into this say, and build on them" never says
  "monologue" — but asked to set up a story and only then how it is told, a
  model had already written a plot (an estate, a new arrival, a handler) and
  told it in the default voice. So the `daydream` prompt asks for the voice
  before anything it shapes, with cues for each (`VOICE_CUES`: sayings,
  beliefs, mantras or themes to be said and built on, with no plot asked
  for, are a monologue), and the answer gives `voice` first and the summary
  last. Then a story gets `STORY_CRAFT` (who the people are to each other,
  where, why now) and a monologue `MONOLOGUE_CRAFT` (the beliefs and sayings
  it is built on, who speaks to whom, where the ideas go), each with its own
  idea fields and cast: a monologue has no parts and nobody in it unless a
  named character is the one speaking, and its sayings go in the idea's
  notes ([Ideas](#ideas)). Who speaks is a voice of its own, talking to the
  user, by default — even when the voice and the user are on the same side,
  so long as it does not make the user the one it is talking about — and the
  user's own inner voice only when the brief asks for it, never merely
  because the brief is about what someone is or what people believe. Told that the
  inner voice "suits a brief about what they are or think", a model read a
  brief listing what a community says women are for as the user's own
  beliefs, and spoke it as their inner voice.
- **Daydream suggestions.** Ready-made daydreams (`DAYDREAM_STARTERS` in
  `daydream/starters.ts`), each an idea starting point, a voice preset and
  character starting points cast into the idea's parts, with the casting
  written for that story. Each card says its level, how it is told, and its
  kinks and tropes as tags (`tags`), so the harder ones can be told apart
  at a glance; under "Either" it also says which side the user is on in it,
  which with a side chosen would only repeat the filter. They come in a
  fresh order on each visit (`shuffledStarterIds`, `inOrder`), so the page
  does not always open on the same few. The page's load draws it: drawn
  while rendering, the server and the browser would each draw their own and
  hydration would disagree. The page keeps it, so going back to the ways in
  shows them as they were. Only the first `SHOWN_STARTERS` (six) show at
  first, a handful to choose from rather than a catalogue to read; **More
  ideas** under them shows the rest, all at once (unlike the suggested
  ones' button of the same name, which asks the model for more).

  **Search**, the magnifying glass at the end of the heading's row, is
  `SearchField.svelte` with `collapsible`: a search box that rests as its
  icon alone and, on focus, opens out towards the start into the rest of
  the row, the icon sliding across with it to sit in the open field. It
  filters the cards, ready-made or suggested, to those with every word
  typed somewhere in their title, premise or tags, ignoring case
  (`matchesSearch`), and looks through every ready-made daydream, not only the
  six shown. Focus leaving it while it is empty folds it away; Escape
  empties it, and a second Escape folds it away too.

  **You as: Either / Dom / Sub** (`DaydreamSidePicker.svelte`) filters them
  (`startersFor`). Each story says
  whether the user is the dom, the sub, or neither (`you`); a side's filter
  shows its own stories and the ones with no one in charge. Every story with
  a side has a version from the other side — "Locked" and "The key", "The
  hunt" and "Your hunt" — so both filters have the full range, and the
  catalog keeps sub characters (the eager sub, the pain slut, the fighter,
  the innocent) to cast opposite a dom user. The choice is the page's state,
  like the box, so going back keeps it, and it is also
  remembered on the device (`localStorage`, `storedStarterSide`) so the next
  visit opens on the same side. They are built from the catalog rather than written out again,
  and need no model, so nothing leaves the device.

  **Suggest daydreams for this**, under the box, asks the model for
  `GENERATED_IDEAS` (six) ideas like the one described: the `ideas`
  suggestion, sent the brief and the side. With a side, the prompt puts the user on it in every idea,
  or on neither for one with no one in charge; with "Either", a mix.
  Each idea is only what a card shows — a title, a premise, tags, the
  user's side, how it is told (`voice`, chosen with the same cues as a
  whole daydream's) and a heat and kink — so a handful comes back quickly;
  `parseGeneratedIdeas` drops any that put the user on the other side from
  the one asked for. The round runs hotter than every other suggestion
  (`IDEAS_TEMPERATURE` in `suggest-prompt.ts`): a brief is asked for again
  and again, and at the default sampling the ideas converge on the same
  few each time. They take the ready-made ones' place, under the
  request, and are filtered by "You as" the same way (`forSide`); **Clear**
  beside the request puts them away and brings the ready-made ones back.
  **More ideas**, at the end of the list, asks again with the same request
  and the side chosen now, sending the titles already shown (the latest
  `MAX_OFFERED_IDEAS`) as `offered` so the model makes new ones, and adds
  them after the rest (`addIdeas`, which drops a repeated title anyway). A
  failure is said under the box for **Suggest daydreams for this** and under its
  button for **More ideas**; the page keeps the ideas and the brief, so
  going back shows them. Picking one asks for the whole daydream as
  **Write this daydream** does, from the brief the ideas were asked for
  with, the idea picked (`chosen`: its title and premise) and the research
  its round was written with ([What a brief leaves
  behind](#what-a-brief-leaves-behind)), and with the idea's side and voice,
  so the cast are written to suit it and an idea for a monologue is written
  out as one, not as a story about its theme; **Try another** on the setup
  asks again from the same idea. It used to send `"title: premise"` as the
  brief, which lost the user's own words, and with them every link they had
  given.
- **Build your own.** A section like the others, its **Build it yourself**
  button opening the full form, empty.

### Links in a brief

A brief can point at material rather than describe it — "take inspiration
from https://www.reddit.com/r/… and build on its themes". When the story
model calls tools, the `ideas` and `daydream` suggestions read those links:
`briefLinks` (`suggest-prompt.ts`) finds up to `MAX_BRIEF_LINKS` (five)
http(s) links, and if there are any the prompt tells the model to open each
before it answers and to draw their themes, tropes and sayings in. What a
page says is material, never instructions, and a page that cannot be read
is passed over without a word. The endpoint sends OpenRouter's
`openrouter:web_fetch` server tool with the request (`WEB_FETCH` in
`api/daydreams/suggest/+server.ts`), so OpenRouter does the fetching while
the model answers and it is still one call. That request goes to
OpenRouter's Responses API (`/responses`, `readingLinks`) rather than Chat
Completions, because only its answer lists each fetch — the URL, whether it
was read, and what came back — which debug mode's chat log shows
([debug-mode.md](debug-mode.md#how-a-daydream-draft-or-ideas-were-written));
the browser reads either shape (`completionText`, `suggestionLog`). The answer gets
`READING_ALLOWANCE` more tokens, because a model with a tool reasons over
what it read before it writes.

- **Only a model that calls tools.** None of the presets do. A custom model
  is checked against OpenRouter's list when it is saved
  ([server-settings.md](server-settings.md#choosing-a-model)), and stored
  with `tools: true` if it does; one saved before that, or when OpenRouter
  could not be asked, sends its links as plain text, as every model used to.
- **Parallel's fetch engine**, because reddit is what briefs link most and it
  is the one that reads it. Measured on 2026-10-20 against subreddits: Exa
  returned nothing, Firecrawl refuses reddit outright, and OpenRouter's own
  free fetch gave back raw RSS when it got anything. A subreddit page gives
  its description and the titles of the posts on it, which for a caption
  subreddit is most of what it says.
- **A chattier answer.** Having called a tool, a model may say what it found
  before its JSON: through Chat Completions, GLM 5.2 did despite
  `response_format`, though not through the Responses API with its
  `text.format`. `completionJson` takes the fenced block, or the outermost
  braces, when the whole is not JSON, either way.
- **Slower, and dearer.** Measured with GLM 5.2 on 2026-10-20: six ideas
  from three subreddits took about 15 seconds and 2–2.5¢ through Chat
  Completions, and from one subreddit about 6 seconds and 0.8¢ through the
  Responses API, against 4 seconds and a quarter of a cent without links.

### What a brief leaves behind

The fields a `daydream` answer fills are a synthesis: a premise of a
sentence or two, a tone in a few words, a monologue's eight to twelve
sayings. That is right for them, but on its own it threw away what they were
made from — the brief as the user typed it, and whatever the model read in
its links and thought through. A brief pointing at a caption subreddit came
back as a premise about its theme, and the story model never saw a single
caption. So an idea written from a brief keeps both (`DaydreamIdea.brief`,
`.research`), and the story model reads them ([The system prompt is the
server's](#the-system-prompt-is-the-servers)):

- **The brief**, as typed. `suggestDaydream` puts it on the idea itself,
  from the request rather than the answer, so it is the user's words and
  never the model's version of them. For a picked idea it is the brief the
  ideas were asked for with.
- **The research**: the model's analysis of what it was given, kept in full
  rather than summarised (`RESEARCH_NOTES` in `suggest-prompt.ts`), for
  whoever writes the daydream. It is asked to work in two stages: first the
  analysis — what each linked page was and everything it drew from it, its
  recurring themes, tropes and sayings quoted as written where the wording
  matters, what in the brief it built on, and what it weighed and left out —
  and then, separately, how to turn that analysis into the ideas or the
  setup, which is its own working and goes nowhere. The notes are the first
  stage word for word, never a condensed version of it — the model's notes
  about the pages, not the pages themselves — so the model that writes the
  daydream sees what the one that read them saw. Short lines, so
  notes that run over `DAYDREAM_LIMITS.ideaResearch` keep their first lines
  (`parseResearch`), like a monologue's sayings. The `daydream` answer gives
  them after the voice; the `ideas` answer gives one set first, for the
  whole round, and every idea in it carries them (`GeneratedIdea.research`).
- **A picked idea is not read twice.** Its request sends the round's notes
  as `research`, said to the model as material, never instructions, since
  they may quote pages; the links are not fetched again
  (`buildSuggestMessages`), and the model carries over what is still useful
  into its own notes. A model that writes none leaves the round's in place.
  Notes that came back empty are nothing to build on, so then the links are
  read.

Neither field is in `IDEA_TEXT_FIELDS`, the list the suggestions write in
(`IDEA_ORIGIN_FIELDS` instead): Fill in the rest inventing a brief nobody
typed, or research nobody did, would make both worthless. The idea dialog
shows them under "More detail" for an idea that has them, as **What you
asked for** and **Background**, editable like any field, and they go with
the idea when it is saved to the library. They alone do not open "More
detail", since nobody customised them, and an idea written by hand shows
neither. Ready-made ideas leave them out (`IdeaWithoutOrigin`), and get the
empty ones when they become an idea.

They came with the idea kind's (`daydream-scene`) v2 and setup v5, reader
and writer in one release (docs/encryption.md, "Sealed records"): every idea
and setup from before opens with both empty, and a tab left open on the
previous build cannot open one saved after the deploy until it reloads.

All but the last hand the form a draft, put together by `assembleSetup`
(`daydream/starters.ts`): parts get fresh ids, each person is cast into the
part named for them if it is still free, and a voice that cannot work with
who is in it — watching nobody — gives way to the one that follows them.
Every copy is one with no library record, so each card offers **Save to my
characters** (or ideas) as any such copy does.

A draft opens in the form's **summary** layout: the setup as a short summary
with blanks in it, built by `setupSummary` (`daydream/summary.ts`). Each blank
is the control for that part of it: the heat a menu of levels, the voice a
menu of the five presets, a character their dialog, the idea the idea
dialog. "Add someone" and "Anything off the table?" (the limits) sit under it.

The summary is two paragraphs:

1. **The model's own**, for a daydream it wrote. The `daydream` answer carries
   a short `summary` in which the model wrapped the first mention of each
   piece as `[[key|words]]` — `idea`, `heat`, `voice`, or a character's name
   — so the blank reads in its words: "[A stranger on the night train].
   [A watchful stranger called Vesper] takes the seat across from you." The
   prompt gives guidance, not a template, and the model decides what reads
   best: the idea's blank is the daydream as a whole rather than a
   place — a story's situation, or what a monologue's voice says and to
   whom, since it has no events — and opening with one tight sentence that is mostly that blank
   usually works; the heat goes in where a word for it fits naturally; how it
   is told is usually best said plainly in a closing sentence, "It's told
   [in the characters' own words, with no narrator]", in the same words the
   form uses (`TOLD_AS`), because worked into the story as "you talk with
   them" it made talking sound like what the story was about. Nothing is to
   be forced in. `parseMarkedSummary` reads it, leniently like any
   suggestion: a marker for nothing in the story, or a second for the same
   thing, keeps its words as plain text, while a summary with a broken
   marker, or over `MAX_SUMMARY`, is dropped. Each ready-made daydream carries
   one written by hand in that shape (`summary` in `starters.ts`, read by
   `starterSummary`), with every piece marked, so it needs no second
   paragraph; a test holds each to that. A draft whose summary was dropped
   shows its premise in its place, with nothing marked. Debug mode shows the
   markers instead of stripping them
   ([debug-mode.md](debug-mode.md#a-new-daydreams-summary-markers)).
2. **One written here**, holding every piece the first left out, so every
   control is always on screen: a sentence for the heat, the idea and anyone
   not mentioned yet — "It's a [steamy] daydream: [After hours], with [Mara]
   (your boss)." or, with the heat already said, "The idea is [After
   hours]." — and one for how it is told, "It's told [to you by a
   narrator]." It once said "a story in [After hours]", which made every
   idea's title a place, and a monologue a story. A character not mentioned yet comes with their part and who
   they are to the user in parentheses. With nothing left out there is no
   second paragraph.

Each blank is a `SummaryBlank`: the words, in a plain span hidden from
assistive tech, with an invisible button laid over them that is named with
the same words and is what the keyboard and screen readers reach. A tap on
the words presses the button; a drag or a double click selects them instead.
The words are not the button's own text because Chromium leaves a button's
text out of a copied selection, so copying the summary lost every blank.

A heat that changes after the summary was written swaps only its word, and an
"a" or "an" just before the blank changes to agree. A character's note in the
second paragraph leaves out their part's name when who they are already says
it.

The model's paragraph is only true of the draft it was written for, and the
summary is not part of the setup (nothing of it is sealed or stored). It is
shown for as long as the idea's title and premise and how it is told are the
draft's, and everyone it names is still in it by that name; change any of
those and the premise takes its place, with every piece in the second
paragraph. Someone added is only someone it does not mention, so they join the
second paragraph. A changed heat is just a word: its blank says the new one.
**Customise everything** switches the same form to the full layout, so
nothing is lost: it is one superform either way, sharing its dialogs, its
sealing and its submit. For a described daydream, **Try another** asks again
with the same words and with any limits written since, which go into the new
draft and to the model. **Other ways to start** goes back, with what was typed
in the box still there.

The stage is the page's own state, not the URL: a draft is something being
made, and has no business in the browser's history.

**Short by default.** The full layout shows the idea, who is in it, "More
options" (who leads, the limits and the dials) and, last, how it is told, as
one line with **Change**. Nothing is taken away — the same controls are a tap
further in — and on the edit page each disclosure starts open when what it
holds differs from the default (limits written, dials moved, a lead other than
"They lead"), and the voice's picker starts open for a voice no preset gives
or one with a name for the user, so nothing a user customised is ever out of
sight. The character and idea dialogs do the same with "More detail".

The disclosures are `wa-details`, opened from the start with the `startOpen`
attachment (`components/details.ts`) rather than `open={…}` in markup: the
server renders a `false` it does not know as `open="false"`, which Lit reads
as open.

**No name to think of.** The create page asks for no name; the model names
the daydream after its opening (see [Naming](#naming)). The edit page has a
Name field, which may be left empty to have it named again.

### How it's told

The voice is two settings, separate from who is in the story
(`DaydreamVoicePicker.svelte`, `voiceProblem` in `src/lib/daydream.ts`):

- **Who tells it** (`narrator`): the characters themselves (`none`), a
  narrator talking to "you" (`second-person`), a narrator telling it about
  others (`third-person`), no narrator at all but a system — a house's rules,
  a protocol, an institution — giving orders (`impersonal`, "A system" on the
  page), or one voice speaking its mind (`monologue`).
- **Where the user is** (`stance`): in it as themselves (`self`), playing
  someone they name (`persona`), or outside it, watching and directing
  (`absent`).

Between them they make every shape of story:

| Shape                  | Characters | Narrator      | User     |
| ---------------------- | ---------- | ------------- | -------- |
| Talk with a character  | 1+         | none          | self     |
| A story told to you    | 0+         | second-person | self     |
| Watch a story unfold   | 1+         | third-person  | absent   |
| A system in charge     | 0+         | impersonal    | self     |
| A monologue            | 0+         | monologue     | self     |

Those five are the presets. **It is asked last, and guessed until then.**
Until the user picks one, the voice follows who is in the story
(`inferVoice`): nobody in it is a story told to you, anyone is talking with
them, and the one-line summary says "Picked from who's in it." Watching, a
system and a monologue are never guessed, because each changes what the story is rather than
how it is told. Picking one — in the picker, or from the sentence's voice
blank — stops the guessing for good. An edited daydream's voice counts as
picked, and so does a draft's when it is not what the guess would have been
(a ready-made "A system in charge"); one that matches goes on following its
cast. The guess goes into the form's starting data rather than being set once
it is mounted, which superforms would write over.

**One description at a time.** The picker lists the presets by name only,
and beside them (below them, on a narrow screen) describes the chosen one,
with two example lines of what the story will read like (`description` and
`examples` on `DAYDREAM_VOICE_PRESETS`). Choosing another option is how its
description is seen. Four descriptions side by side were a wall of text to
compare; one at a time can be tried on. The examples are drawn with their
bold and italics, as a passage would draw them (`formatPassage`): an action
in italics, a monologue's statement in bold. The two settings under "Fine-tune how
it's told" are names only in the same way, and for a combination no preset
gives the panel describes the chosen narrator and stance instead, with the
narrator's example.

A problem with the voice is shown under the presets, outside "Fine-tune", and
in the one-line summary while the picker is closed, so nothing closed ever
hides why the form will not save.
`voiceProblem` refuses what cannot work — no narrator and no character
(nobody speaks), no narrator while watching (the characters would be talking
to no one), watching nothing (except a monologue, which can be overheard
with nobody in it), a narrator talking to a "you" who is absent, a
persona with no name — and the form disables a choice that could never work
with the other setting, saying why beside it. The setup kind runs the same
check, so a stale page cannot store one. "Who leads" is shown only where it
means something: with characters, with the user there to be led, and not in
a monologue, which nobody leads (`leadApplies`).

The three narrated voices are ordinary fiction, which the model writes well
from a sentence. The system voice is not: told only to be "an impersonal
authority", the model wrote a narrator describing a hallway, with the rules
mentioned in passing, and every later passage copied that opening. So it gets
a guide of its own (`src/lib/server/daydream/impersonal-voice.ts`): what the
system writes in — notices, numbered rules and amendments, exact
instructions, logged compliance and infractions — what it never does
(describe, feel, praise), and four short examples of the form. The examples
are chosen by the idea's heat: up to Warm (or unset) a tame set, from Steamy
an adult one, because examples steer content as well as form. They are
deliberately unlike each other in how they open, and the guide forbids
reusing their sentences: an earlier set that both began "The following
applies from this moment" had the model open nearly every story with those
words. The system's opening request asks for its first notice rather than
"Set the scene", who leads and the suggestion and button ideas are worded for
a system (Stricter, New rule, Inspection), and its characters are its
functionaries rather than people with decisions of their own.

**A monologue** is not a story at all. One voice speaks its mind about
what the daydream is about, taking the ideas, tropes and common sayings of
its kinks and turning them into statements: many short paragraphs, most
opening with a statement in bold on a line of its own, followed by the
voice's own words on it — a few sentences, or a longer run caught in an
ordinary day (on the bus, at a café table), which each example set shows
one of, since shown only short ones a model never writes it. The voice stands in for those ideas
rather than being a fleshed-out character. Who it is is left to the setup:
an unnamed voice with the user listening unless the idea suggests a
character, or the user's own inner voice where the idea says so or reads
better as their thoughts;
watching, the user overhears it. Told only to "speak a monologue" a model writes a
soliloquy in a room, with a plot, so it gets a guide of its own like the
system's (`src/lib/server/daydream/monologue-voice.ts`), last before the
format, with examples of the form in a tame and an adult set by heat, broad
rather than anyone's particular kink. It gets the sex section of the
writing guide and its own in place of telling the story (`MONOLOGUE_TELLING`:
keep the voice consistent, build on what has been said, use the setup's
sayings as starting points rather than a list to work through), but not the
prose, since it has no scene; its idea is described to the model as what the
voice believes and who the user is to it, with its sayings on lines of
their own ([Ideas](#ideas)); its opening
request asks it to start straight into its statements; its suggestion and
button ideas are its own (More like that, A mantra, Another idea); and
nobody leads it. Its bold statements are drawn as standout lines
([Reading a passage](#reading-a-passage)).

The monologue came with setup payload v4, which also renames the setup's
`scene` to `idea` ([Ideas](#ideas)) and ships its reader and writer
in one release (docs/encryption.md, "Sealed records"): a tab left open on the
previous build cannot open a daydream set up after the deploy until it
reloads.

Two ready-made daydreams are monologues, one for each side ("Owned" and
"Yours to use"), with no cast: an unnamed voice speaks.

### Ideas

What a daydream is about is its **idea**: a title, what it is about
(`premise`), where (`setting`), the user's part (`yourRole`), a tone, notes,
the parts it has for characters, and its heat and kink — and, for one
written from a brief, the brief and the research behind it ([What a brief
leaves behind](#what-a-brief-leaves-behind)). It was called the
*scene* until the monologue, which has no scene: the word, and the fields
it named ("What's going on: how it starts"), made the model and the form
alike treat every daydream as a plot. "Idea" fits a story and a monologue
equally, and matches the generated ideas, which become one when picked.

The fields are the same for both, read differently for a monologue
(`ideaFieldLabels` in `daydream/catalog.ts`): what it is about is what the
voice believes and keeps coming back to, the user's part is who they are to
it — the one it speaks to, or the one whose inner voice it is — and the
notes are **Sayings to build on**, one to a line, shown up front in the idea
dialog beside what it is about (`ideaPrimaryFields`) rather than under "More
detail". The reply prompt sends them on lines of their own, named as what
they are (`describeSetup`), and a model that sets one up writes eight to
twelve of them there (`MONOLOGUE_SAYINGS`); a list that runs over the notes
cap keeps as many whole lines as fit (`parseFill`), where any other field
over its cap is dropped. The setup form tells the idea dialog's suggestions
how the daydream is told (`narrator` in `SuggestContext`), so Fill in the
rest and Surprise me write a monologue's idea, sayings and all, with no
parts; the library's own dialog has no daydream around it, so it uses the
usual words.

**Words.** A *daydream* is the whole thing; a *story* is what the narrated
voices tell, and the text the model writes (the story model, the story tree,
a passage's `story` role); an *idea* is what a daydream is about. Two
phrases keep "scene" in their own senses: **Stop the scene**, the kink
term for stopping play, and a *scene break* in a passage.

**Stored names keep the old word**, since renaming them buys nothing but a
migration: the library's table is `daydream_scenes` (the schema's
`daydreamIdeas`), its sealed kind is `daydream-scene` — the name is in every
stored envelope — and setups up to v3 store the idea under `scene`, which
the v3 upcast moves to v4's `idea`. `/daydreams/scenes` redirects to
`/daydreams/ideas`.

### Characters and ideas, and the library

Characters and ideas are kept in a per-user library (`daydream_characters`,
`daydream_scenes`, `/daydreams/characters`, `/daydreams/ideas`) and picked
for a daydream, or made new for it in a dialog.

**A daydream holds a copy, not a reference.** Picking a character copies it
into the setup with where it came from (`sourceId`) and the library
revision it was copied at (`sourceRevision`). Editing or deleting the
library's never changes a story under way, which is the point: a story
should not shift under someone because they tidied their library. The setup
page compares each copy's `sourceRevision` with the library row's plaintext
`revision` (`copyState` in `daydream/chips.ts`), so it notices without
opening anything:

- **Updated in your library since.** — **Use the latest** copies the
  library's over this one; **Keep this version** records the library's
  revision as seen, so it stops asking.
- **Only in this daydream.** / **No longer in your library.** — **Save to my
  characters** (or ideas) makes a library record from the copy. Setups from
  before the library existed upcast to copies with no source, and land here.

Editing a copied character from a daydream's setup edits the library's too
(the dialog says so), and that daydream's copy follows at once; other
daydreams then see "Updated". Unticking "Save to my characters" keeps the
edit in this daydream only, as a copy with no source — it never claims to
match a record it no longer matches.

### Characters, ideas and casting

A character and an idea are reusable on their own, but who a character is
*in a story* depends on the story. So the two are joined in the daydream, not
in the library:

- **The library character is the actor**: who they are in any story — type,
  personality, how they talk, appearance, what they enjoy, notes, dials. It
  has no relationship to the user, because that changes from one story to the
  next.
- **An idea can list parts** (`IdeaPart`: a name like "the interviewer" and
  a few words on it), up to `MAX_DAYDREAM_CHARACTERS`. Parts make an idea a
  plot any fitting character can step into. They are optional: an idea with
  none is cast freely. The user's own part stays the idea's `yourRole`
  ("Your part").
- **The daydream's copy of each character carries a casting**
  (`DaydreamCasting`): the part they play (`partId`, or none), who they are
  to the user in this story (`relationship`), and what they are doing or
  want as it starts (`part`). It is never saved to the library.

The setup page shows one row per part under "Who's in it", each with who
plays it or a menu to cast someone, then anyone cast without a part, then
"Add someone else". The character dialog opened from a daydream is in two
halves — "In this story" (the casting) and "About <name>" (the actor, which
is what "Save to my characters" saves); opened from the library it has only
the second.

The rules that keep this sound:

- **Library sync compares the actor only.** "Use the latest" and "Keep this
  version" replace or re-date the library's fields and keep the casting, so
  casting someone differently never makes them look changed, and catching up
  with the library never loses their part.
- **A part is played once, and must exist.** `castingProblem` refuses a part
  the idea does not have or one cast twice; the form schema and the setup
  kind both run it.
- **Changing the idea lets go of parts, not words.** Swapping the idea, or
  taking the library's newer version of it, sets the `partId` of anyone in a
  part it no longer has to null and keeps their relationship and part text
  (`fitCastingToIdea`). Part ids are stable across an idea's edits, so an
  edited idea keeps its castings.
- **Parts nobody plays are left out of the prompt.** Told about an empty
  part, the model would invent someone to fill it, which the user chose not
  to.

**The model writes the link.** With suggestions on and an idea chosen,
casting a library character from a part's menu asks the model who they are
in this story (the `casting` suggestion, from the actor's fields, the idea,
the part, the others cast and where the user stands), and fills the
casting's empty fields with the answer; the card says "Writing their part…"
meanwhile. That is background work: a failure leaves the fields empty and
says nothing, and "Write their part" in the dialog asks again. Neither ever
writes over something already written.

### Guided, over free text

The character and idea dialogs (`DaydreamCharacterDialog.svelte`,
`DaydreamIdeaDialog.svelte`) are guided rather than blank:

- **Starting points** (`CHARACTER_TEMPLATES`, `IDEA_TEMPLATES` in
  `daydream/catalog.ts`), from SFW to filthy and extreme, in that order, each
  saying its level on its button (below). An idea template comes with its
  parts, which get fresh ids each time one is used.
- **Character dials**: a tone (warm, teasing, cold, clinical) and six
  sliders — control, strictness, edge, talk, libido, kink — each of which can
  be left unset. The words for each value are in `daydream/dial-words.ts`,
  shared by the sliders and the prompt, so the screen and the model read the
  same thing.
- **Idea dials**: heat and kink, up front in the idea dialog (below).
- **Chips under every field**: phrases that toggle in the field's text
  (`toggleChip`), leaving whatever else was written exactly as it was. The
  casting's two fields have their own (`CASTING_CHIPS`).
- **Up front, and under "More detail".** A character shows its name, type and
  personality; an idea its title, what is going on and its parts. The rest —
  a character's dials and other fields, an idea's setting, your part, tone
  and notes — is under "More detail", which starts open when any of it is
  filled, and opens when a template, Fill in the rest or Surprise me writes
  into it, so what changed is in view.

### How sexual, and how kinky

Daydreams are for SFW stories and filthy ones alike, and nothing pretends
otherwise: the prompt does not call every story erotic, and it does not shy
away when one is.

- **An idea has heat** (SFW → Flirty → Steamy → Explicit → Filthy) **and
  kink** (Vanilla → Light → Kinky → Heavy → Extreme). They are saved with a
  library idea, set by its starting point, and shown above the other
  dials in the story's Dials popover (the caret of the Settings split
  button, right of Bookmarks; its main half goes to the settings page), so
  they can be turned up or down mid-story. That changes the daydream's copy of the idea only, never the
  library's.
- **A character has libido** (Chaste → Shy → Interested → Horny → Slutty)
  **and kink** (Vanilla → Curious → Kinky → Very kinky → Depraved).
- **Heat is the ceiling.** At SFW nobody acts sexually, whatever their
  libido: a character's libido and kink say how eager they are within the
  idea's heat, never past it (`describeIdeaDials`). The user's limits
  outrank all of it, as they outrank everything.
- **Unset says nothing.** With no heat set, the prompt is silent on it and the
  model follows the words, as with every other dial. Setting heat to SFW is
  how a story is made strictly SFW.
- **The starting points say their level** (`ideaLevel`, `characterLevel`):
  "SFW", "Explicit · kinky". Nobody has to guess what they are picking, and
  the range is plain to see, from the snowed-in slow burn to the dungeon.
- **Suggestions match it.** The suggest prompt is given the dials, so chips
  for a SFW idea stay SFW, and Fill in the rest and Surprise me rate an
  idea's heat and kink where the user left them unset — never over ones
  they set (`parseIdeaDials` reads the answer leniently, dropping anything
  that is not 1 to 5).

**The free text is the truth.** Every field is plain text the user can
rewrite, chips only edit it, and where a description and the dials
disagree the prompt tells the model to follow the description.

With suggestions on — the disclosure accepted and a key configured — the
model can be asked too: **More ideas** for more chips on one field, **Fill
in the rest** for the empty fields (never over written ones, and parts only
for an idea with none), and **Surprise me** for a whole idea, parts
included, which opens in the idea dialog to read, change, or **Try
another** before it is used. The new-daydream page asks for a whole daydream
the same way (see [Starting one](#starting-one)). Without them, the curated chips and
templates still work, and nothing leaves the device.

The dialogs are SPA superforms that save through the library endpoints
rather than form actions: they open over the setup form, whose state must
survive them, from three pages. They set `applyAction` and `invalidateAll`
off — left on, superforms re-ran the page's loads after each save, and the
setup form underneath was reset to the empty form still in `page.data`,
losing the character just added.

The setup form itself posts as JSON (`dataType: 'json'`, its data is
nested), and `onSubmit` replaces the whole post with the sealed record.

### What the presets are drawn from

The idea chips, the ready-made daydreams, the starting points and the field
chips are weighted towards sex and kink, because that is what people open a
kink app's daydreams for. Which themes they cover was decided from what
recurs most, in October 2026, across NSFW roleplay character cards (Chub,
Character Tavern, muah), r/gonewildaudio's tagged scripts (split by who they
are for, which is the clearest read of what women and men each ask for),
Pornhub's year-in-review searches, Literotica's categories and Lehmiller's
and Joyal's fantasy surveys. The themes at the top were:

- friends to lovers;
- a dominant partner's praise ("good girl", "good boy"), with aftercare;
- a strict boss;
- rivals and hate sex;
- brat taming;
- possessive and obsessive lovers (the yandere);
- demons, monsters and werewolves, with size difference;
- a primal chase;
- threesomes;
- breeding;
- contracts and protocol;
- being used.

A second set covers the harder end people asked for by name: free use,
an anal-only arrangement, chastity and a keyholder, pet play, hypnosis and
trigger words, a gangbang, an interrogation, a scripted break-in, being made
to watch, and breeding. Those sit at the top of the heat range, and most at
the top of the kink range too.

So the catalog reaches for those first, and spreads across both who leads
and who is led, since the data splits there (men-for-women scripts lean
male-dominant, praise and aftercare; women-for-men lean female-dominant and
the older lover).

Three lines are kept on purpose:

- **One SFW slow burn stays.** "Only one bed" shows that the heat range
  exists and can be turned up mid-story, and a few tame chips stay so a
  story can start slow.
- **Consensual non-consent is framed as agreed.** It is one of the most
  common fantasies in every source. "The hunt", "The break-in" and "Free
  use" each say in their premise that it was arranged beforehand and that a
  safeword stops it, and "Trigger words" says the conditioning was agreed.
  Inside the story the fantasy plays out as written; the framing is what
  makes it one.
- **Two things are absent from every source's tallies here.** Nothing is
  minor-coded, and nothing rests on blood relations, however common either
  is on the card sites.

## The flow

1. **Disclosure.** `/daydreams` shows `DaydreamDisclosure.svelte` until the
   user presses "I understand". Acceptance is a row in `daydream_preferences`;
   the reply and suggest endpoints refuse (409) until it exists.
2. **Setup**, as above. It is sealed in the user's own vault before posting.
3. **Opening.** The story page (`DaydreamThread.svelte`) asks for the opening
   by itself, once per visit, when the daydream has no turns. Once it is
   written, a daydream with no name is named (below).
4. **Playing.** Every way of moving the story on — below — adds a turn after
   the one the user is on and asks for the passage after it. The page's
   state and actions live in one object, `DaydreamStory`
   (`daydream/story.svelte.ts`); the components draw it.

## Naming

A daydream's `title` is empty until it has a name. Everywhere one is shown
— the list, the story's heading, the home card — goes through
`daydreamTitle`, which falls back to the idea's title, so an unnamed
daydream is never blank.

Once the story page has an opening passage and nothing is being written,
`DaydreamStory.nameIfUnnamed` sends the idea's title and premise, the cast's
names, the user's limits and the start of the opening (`MAX_NAMING_OPENING`)
as the `name` suggestion, and saves the answer into the setup through the
same path as the dials. The page's heading is told the new name directly
rather than reloading, which would read every turn again.

It is asked at most once per visit, and never retried: a failure says
nothing (the idea's title is still standing in) and the next visit asks
again, and an answer that arrives after the setup gained a name some other
way is dropped. Renaming is the edit page's Name field; clearing it hands the
naming back to the model.

**Setup saves from the story page go one at a time** (`DaydreamStory.saveSetup`
takes a change, not a whole setup). Naming lands just as the opening does,
which is just when someone reaches for the heat, and each save is
compare-and-swap on the setup's revision: sent together, both carried the
same revision and the second was refused, so the heat change quietly did not
apply. Queued, each runs after the last has answered, on the setup and
revision it left, so the name and the dial both stick.

## The story is a tree

Every branch of a story is kept in one daydream. `daydream_turns` has a
`parent_id` (null for a root: the opening, or a retried opening) and a
`position` that is the turn's depth. Writing a passage again, rewriting
one, or carrying on from an earlier point adds a turn beside an existing one;
nothing is ever replaced.

- **Turns never change once written.** So there is no compare-and-swap on a
  turn, and a bookmarked quote's offsets stay true forever. The `revision`
  column stays, at 0, from when retry replaced a turn.
- **Two devices adding after the same turn make two branches**, not a
  conflict: that is what the tree is for.
- **`daydreams.active_turn_id`** is the end of the branch being read. Every
  append moves it; so does switching branch (`PUT .../active`), so the next
  visit, on any device, opens where the user was.
- **`parent_id` and `active_turn_id` have no foreign keys.** They were added
  to live tables, where `ALTER TABLE … ADD COLUMN … REFERENCES` cannot carry
  an `ON DELETE` and a rebuild would empty the table on D1 (AGENTS.md,
  "Traps"). Turns are only ever deleted with their daydream, whose cascade
  takes all of them, and the server checks a parent or active turn belongs
  to the daydream before storing it.
- Migration 0034 turned each v1 daydream's line of turns into a branch: each
  turn's parent is the one at the position before, and the active turn the
  last.

**Loading.** A page gets the whole tree's shape — ids, parents, roles,
depths, up to `MAX_TREE_NODES` (2,000) — without content, which is enough to
draw the branch map and the switchers, and the sealed content only of the
branch being read (up to `MAX_LOADED_TURNS`, fetched by id in chunks of 100,
D1's bound-parameter limit). Other branches' turns are opened when someone
moves to them, or the branch map shows them (`POST .../turns/read`). D1
charges for rows read and their size, and a long story with many retries
would otherwise send every take of every passage on every visit.

**Moving around it:**

- **`‹ 2/3 ›`** under any turn with others beside it (`DaydreamSiblings`).
  Moving to one shows the branch through it where it was last left
  (`latestLeafUnder`), not its first turn.
- **The branch map** (`DaydreamBranchMap.svelte`), drawn with the generic
  [Tree](tree.md). Its trunk is the story's **longest path**: at each fork
  the child with the most generations under it carries the line on, a tie
  going to the child on the branch being read and then to the newest. Every
  other way the story went grows off the turn it forked from, straight after
  it, and is itself drawn along its own longest path. The branch being read
  is filled in, the turn being read ringed, and bookmarks carry an icon.
  Picking a turn moves to the branch through it; **carry on from here** makes
  that turn the place to continue from. That button sits at the drawer's
  edge on a thin rule under each turn, between it and the next, rather than
  in the turn's row, where it left unclear whether the new branch kept that
  turn; under the rule, it plainly keeps everything above. Its icon is a
  line splitting into two arrows (`components/icons/diverge.svg`). A side
  branch folds to its first turn and a trunk turn folds the forks off it;
  the turn being read is never folded away.
- **Carry on from here** in a passage's menu, likewise.

## Moving the story on

Each has a turn type, sealed in the turn's payload (`daydream-turn` v2); the
row's plaintext `role` says only who wrote it, `user` or `story`.

| Control                      | Turn added                   | Asks for                         |
| ---------------------------- | ---------------------------- | -------------------------------- |
| The composer                 | `text` (role `user`)         | the next passage                 |
| Continue                     | none                         | the next passage                 |
| A direction button           | `direction`                  | the next passage                 |
| A suggestion, tapped         | `text`                       | the next passage                 |
| Selected words: More of this | `steer` (`more`)             | the next passage                 |
| Selected words: Rewrite this | none                         | a rewrite, beside the passage    |
| Selected words: Not this     | none (adds a limit)          | a rewrite, if it is the newest   |
| Write again                  | none                         | another take, beside the passage |
| Roll                         | `roll`                       | the next passage, honouring it   |
| Stop the scene / Ease off    | `safety` (`red` / `yellow`)  | a check-in / the next passage    |
| Carry on (after stopping)    | `safety` (`resume`)          | the next passage                 |

- **The composer works out what was meant.** One text box, no modes: the
  model reads a turn as something the user does, a request about where to
  take the story, or the next part of it written co-writing style
  (`READING` in the prompt), and says which it read it as (`readAs`, shown
  faintly under the turn when it is anything but an action). It says so
  first, opening its reply with `<reading>…</reading>` before writing
  anything: asked only in the metadata after the passage, it named a reading
  for whatever the passage had already done, and "Make the story super
  steamy" came back as an action. A request
  about where the story goes ("Make the story super steamy") is a direction,
  treated exactly like a direction button and drawn as one, a marker rather
  than a bubble. An instruction for the user's own turn is written out for
  them, and any reading can be overridden, which forks the story (both
  below). Explicit out-of-character syntax — a turn starting `(`, `[`, `//`
  or `OOC:` — is always out of character (`explicitOoc`,
  `daydream/ooc.ts`), whatever the model would have made of it.
- **Direction buttons** are the model's. Each passage says which to add and
  which to remove (`meta.directions`), and the set on offer is the fold of
  every passage on the branch, at most six, oldest dropped first
  (`currentDirections`). The prompt lists the buttons on screen (in a note
  at the end of the last message, which keeps the rest cacheable: see
  [Cost](#cost)), has them
  pruned by where the new passage leaves the story rather than where it
  stood before it (judged by the before, a button for what the passage had
  just done stayed a turn too long), gives examples, offers **Surprise me** (`surprise-me`) as a candidate when an
  unexpected turn would suit, and says never to add Continue or the safety
  controls, which are always there. They stay on one row and scroll
  sideways rather than wrap (`OverflowScroller.svelte`), with an end faded,
  and a chevron that scrolls by a page, wherever there is more past it.
- **Suggestions** are two to four things the user might say next, varied by
  instruction. A tap sends one; the pencil beside it puts it in the
  composer (`MessageComposer.replaceText`, through `plainTextToDocument`) to
  change first.
- **Select to steer.** Selecting words inside one passage shows a bar under
  it (not at the caret, which would fight the native mobile menu): More of
  this, Rewrite this, Not this, Keep this (a quote bookmark). The selection
  is measured against the passage's text (`quoteAt`). **Not this** opens a
  dialog prefilled with `Avoid: "<quote>"` and adds the line to the setup's
  limits (`PUT .../setup`), so it never comes back; if the passage is the
  newest, it is rewritten without it.
- **Reactions** — loved it, liked it, not for me — one per passage, stored as
  marks. They go to the model with the passage they are on, as taste.
- **Dice**, below.

## Written out for you

Sometimes a user writes what their turn should be rather than the turn
itself: "Tell Charlie the fox is safe", not the words they say to Charlie.
Answered as it stands, the story would have no turn in which they actually
tell Charlie anything. So the model writes the turn out first — in the first
person, as the user would have written it, doing exactly what they asked and
nothing more — and then answers what it wrote (`WRITING_OUT` in the prompt,
`readAs: "instruction"`).

- **One request.** The written-out turn opens the same reply, in a leading
  `<yours>` block before the passage (see [The reply format](#the-reply-format)).
  A separate request to work out whether a turn needs writing out would
  double the wait and the cost of every turn sent, most of which need
  nothing; and with the block first, the passage answers the written-out
  words rather than the instruction.
- **Stored on the passage that answered it**, as `meta.expansion` beside
  `readAs` (`daydream-turn` v3). Turns never change once written, so the
  user's own turn keeps exactly what they sent. It follows that **another
  take writes the turn out afresh**: Write again answers the instruction
  again, and each take carries its own wording. A **rewrite** keeps the
  wording it was given, storing the same one, since a rewrite answers the
  same turn; its request quotes the passage it rewrites written-out turn and
  all, so the model sees the wording it is keeping.
- **The model reads the written-out turn from then on, where it wrote it.**
  Building the context (`#contextUpTo`, `toContextTurn`), the user's turn
  goes as they sent it, and the passage after it goes back as the model
  wrote it: its `<yours>` block, then the passage (`passageAsSent`). So the
  model reads its own written-out turn, and every request still only adds
  to the one before ([Cost](#cost)). It once went in place of what the user
  sent, which changed a message every later request had already sent.
- **Only words the user wrote, in a story they are in.** A watcher
  (`stance: absent`) has no turn of their own, so the prompt leaves the
  instruction out for them and their instructions stay directions. A block
  the model writes anyway after a button press, Continue, an explicitly
  out-of-character turn, for a watcher, or in a check-in, is dropped.
- **On screen** (`DaydreamUserTurn.svelte`), the bubble shows the written-out
  turn, labelled "written out for you", with **Show what you sent** to switch
  to the words actually sent — set apart as a note, dashed and italic, so the
  two are never mistaken for each other — and **Show it written out** back.
  While a reply arrives, the bubble fills in as the turn is written out, and
  the passage's spinner stays until the block closes.

## Read it differently

The model's reading of a turn can be wrong: a "Make it steamier" taken as
something the user says in the story, say. Every turn the user wrote has a
**Read it differently** menu (`DaydreamUserTurn.svelte`, the vertical
ellipsis by the turn) offering, under "Interpret as…", every other reading — something I say or do, write my turn out for me (not offered to a
watcher), a direction for the story, part of the story, out of character.

- **It forks, never corrects** (`DaydreamStory.reread`). By the time someone
  notices, the passage after the turn is usually written or arriving. The
  user is moved to their turn and a new passage is asked for after it, with
  the reading forced; the old one stays beside it, reached with the
  switcher. One still arriving is stopped and kept, as Stop keeps it, before
  the fork starts.
- **The forced reading goes to the model as a note before the words**
  (`readAs` on the context turn; `READING_NOTES` in the prompt), which
  `READING` says the user chose and settles it. A direction goes exactly as a
  direction button does, `(Direction: …)`; out of character as
  `[Out of character]`, and a chosen reading outranks the explicit
  out-of-character syntax.
- **It is the user's from then on.** The passage records the reading with
  `readAsChosen` (`daydream-turn` v3), the turn's label says "as you asked",
  later requests keep sending the note for that turn (`chosenReadingIn`),
  and Write again and a rewrite of that passage keep it. The model's own
  readings are never sent back: the passage it wrote already shows them.

## Dice

At a genuinely uncertain moment the model may propose a roll
(`meta.roll`: a prompt, a number of sides, and outcomes covering every face
exactly once). The page shows a card; **Roll a dN** rolls in the browser
(`roll` in `daydream/dice.ts`), records the result as a `roll` turn, and
the next passage is told to honour it.

- **The browser rolls, not the model.** A model asked for a random number
  writes the one the story wants; a roll is meant to be an outcome nobody
  chose. `roll` uses `crypto.getRandomValues` with rejection sampling, so no
  face is likelier than another.
- **A roll is a turn**, so a reload, a retry or a branch all see the same
  result. Rolling again means carrying on from the passage that proposed it
  — a branch of its own, in the open.
- **A proposal that does not cover every face is dropped**, not shown
  (`coversEveryFace`), and the rest of that passage's metadata still counts.
- Ignoring the card is fine: anything else moves past it.

## Bookmarks and reactions

Marks (`daydream_marks`, the `daydream-mark` kind) are sealed, on a turn: a
bookmark — a save point, or a highlighted quote when it has offsets — or a
reaction. The server knows only which turn. A quote's offsets are into the
passage as stored, markup included, and are highlighted across whatever
formatting they span (`quoteRanges`, then `withQuotes`; see
[Reading a passage](#reading-a-passage)); the bookmarks drawer
(`DaydreamBookmarks.svelte`) lists every bookmark in the tree, and picking
one moves to the branch through it and scrolls there.

## Pictures

A passage can come with a picture of one moment in it, made by an
image model tuned for adult imagery, through Runware.

- **The story model describes it.** On a server with a Runware key, the
  reply format asks for an `"image"` in every passage's metadata
  (`imageInstruction` in `prompt.ts`) of one moment in the passage —
  usually the one it ends on, but the most striking one, and when the
  idea is sexual the hottest, if that came earlier: the framing, how many
  people, each one in full — an adult age as a number, their look as the
  setup says, what they wear, anyone the moment only implies included —
  then what they are doing, with a sex act spelt out and given all its
  common names, the place and the light (its quality, direction and
  colour), in literal English sentences, in words with one meaning,
  concrete nouns rather than adjectives, saying what is there rather than
  what is not ("bare-chested", never "without a shirt": a word for
  something absent gets drawn), with any writing quoted exactly and named
  on what it is on, and only as explicit as the idea's heat, which when it
  allows frames the sex plainly in view. The user's own character, when
  they have a cock and nothing says its size, gets a thick, long one.
  How long it is and in what order follow the model that draws the
  daydream's style (`IMAGE_RECIPES`): 80 to 150 words with the framing
  first for Z-Image Turbo and the SDXL family; 30 to 80 for FLUX.2 Klein,
  more only when the moment needs it, subject first and framing last,
  because FLUX weighs words by where they come. The image model has seen nothing else and draws what the words say,
  so it gets no names, no "you", and nothing a camera could not see: a
  story's names and feelings only crowd out what it can draw, and a head
  count left unsaid grew a stranger in the frame. It is left out
  where a picture makes no sense, never in a check-in, and when little a
  camera could see has changed since the last passage that had one — a
  second picture of the same moment costs a request and shows nothing new.
  A monologue's is judged differently: it has no moment of its own, and
  asked for one anyway the model drew the speaker at a café table looking
  out of a window — SFW beside a filthy passage, and nothing the daydream is
  about. So it pictures the passage's ideas rather than its speaker — what
  the voice says someone is for, a scene it imagines, an image of one of its
  ideas — and only when that would interest the user, which usually means
  one carrying the passage's kink and sex, as explicit as the passage and
  the idea's heat allow. The speaker going about their day never gets one.
  The instruction is constant per server, so the prompt stays cacheable
  ([Cost](#cost)). The description is stored on the passage (`image`,
  `daydream-turn` v6), and goes back to the model with it, as a `<meta>`
  block holding only the image (`passageAsSent`): that is how the model
  knows what the last picture showed. It is part of the passage from the
  moment it is written, so the history still only adds to itself.
- **The server wraps it.** `POST /api/daydreams/[id]/image` takes the
  description, the daydream's style and the idea's heat, and builds the
  request (`runwareTask`, `daydream/image-prompt.ts`): the style's model
  and words, an adult floor in the image model's own terms, and a negative
  prompt that keeps it away from anything youthful — and, at SFW, from
  nudity. How it says those follows the model's architecture
  (`PictureArchitecture`), because what suits one family is poor for the
  others: an SDXL-family model gets tags, ~30 steps and real guidance; a
  Z-Image Turbo model gets sentences, its distilled 9 steps and `CFGScale`
  1.5. Not Z-Image's usual 1: there Runware drops the negative prompt, and
  Dark Beast drew a woman described as 35 barely out of her teens. A
  FLUX.2 Klein model gets the description first and the style sentences
  after it, 4 steps and `CFGScale` 1.5: at 1 it garbled a quoted sign and
  lost who sat where, and 1.5 and 3.5 drew the same picture. Every
  sentence round a description says what is wanted, never what is not
  ("fully clothed, in an everyday, non-sexual moment"), and the photo
  style is a candid personal photograph by a skilled amateur on a good
  phone, not a studio shoot. The
  architecture comes from the model's base model, which is stored with the
  model in the server settings (see [Configuration](#configuration)), so
  nothing has to be looked up when a picture is made. It answers with the
  picture and, in a header, exactly what it asked (`PictureRequest`). It keeps nothing and logs only status codes.
- **Two styles, per daydream.** Photo (Dark Beast 9, a Z-Image Turbo
  fine-tune, which draws only photographs) or Illustrated (WAI-illustrious,
  an SDXL checkpoint), in the setup's `pictures` (`daydream-setup`
  v3) with whether each passage gets one by itself, which is on by default.
  Both are in the setup form's "More options" and the story's Dials
  popover (`DaydreamPicturesControl.svelte`). Neither reaches the story
  model as such, but the style decides which recipe its descriptions follow,
  so switching to a style drawn by a model of another family changes the
  system prompt and costs one uncached request; switching between two of
  the same family costs nothing. Which model draws
  each style is a server setting; the defaults are Runware AIRs pinned to a
  version (`RUNWARE_PICTURE_MODEL_PRESETS` in `src/lib/server-settings.ts`).
- **Kept encrypted, like an attachment.** Turns never change, and a picture
  arrives after its passage is saved, so it is a mark on the passage
  (`picture`, `daydream-mark` v3). The browser encrypts it under an age
  identity of its own (`encryptAttachment`), stores the ciphertext at
  `PUT /api/daydreams/[id]/images/[imageId]` — owner-only, capped at
  `MAX_PICTURE_BYTES`, under `permanent/daydreams/<daydreamId>/` — and only
  then seals the key into the mark. The server sees the picture once, on
  its way through, and stores only ciphertext. Deleting the daydream
  deletes its pictures by prefix (`purgeDaydreamPictures`).
- **On the page** (`DaydreamPicture.svelte`), under the passage's text and
  never in it, since quote offsets are measured against the text: a
  placeholder the picture's shape while it is made or opened, then the
  picture, both at most 15rem wide and 22rem (or 60% of the
  window) tall, the width worked out from the height cap so neither crops.
  The placeholder is a skeleton's shimmer, or, when an earlier passage on
  the same branch has a picture on screen, that picture blurred past
  recognising under the skeleton's pulse
  (`DaydreamStory.previousPictureUrl`): the next picture of a story tends
  to share the last one's colours and light. It is shown from the plaintext the moment it comes, and stored
  quietly after (`kept`); one that could not be stored says so with **Keep
  it**, one that could not be made with **Try again**, and a daydream with
  pictures off offers **Picture this** on each passage that describes one.
  Nothing the story asked for is lost.
- **Progress is an estimate, drawn as one.** Runware reports nothing until
  the picture comes: its async delivery has a `progress` field, but
  measured against image tasks it never appears, only `processing`. So the
  ring is drawn against how long pictures usually take here. The server
  times each picture that comes back (failures do not count: they are often
  fast refusals) and folds it into a weighted moving average
  (`daydream_picture_timings`, `server/daydream/picture-timings.ts`), one
  row per **workload** — model, steps, guidance, size
  (`pictureWorkload`) — so changing the model or recipe starts a fresh
  average. No user, daydream or prompt is stored with it. The first runs are
  averaged evenly, then each new one weighs a fifth, and a run counts for
  at most three times the average so far, so a cold start cannot drag it.
  The page asks for it (`GET /api/daydreams/[id]/image?style=…`) alongside
  the picture, never before it, and until one has been made guesses 15
  seconds. The ring (`pictureProgress`) fills steadily to
  two thirds at the estimate, then closes the rest exponentially, leaving
  the estimate at the speed it arrived so the slowing has no kink, and
  never fills: a late picture slows the ring rather than leaving it full
  and stuck. It sits in a circle in the middle of the placeholder with the
  seconds so far inside it, and nothing else: the estimate shapes the ring
  but is not said, and the stage ("Making the picture") is said only to a
  screen reader, since it never changes while the ring is up.
- **The disclosure covers it.** Pictures go to a third party on the same
  terms as passages, and the Daydreams disclosure says so; there is no
  separate question.

### Keeping minors out of pictures

An uncensored image model will draw whatever it is asked, so the guard is
this app's, in three layers, any one of which would stop it:

1. **The story model is told** to describe every person as an adult with
   an age, and never in youthful terms, under rules that already forbid
   anyone under 18 anywhere in the story.
2. **The description is refused** if it mentions a minor in any way — a
   word list of minors, school and youthful bodies, and any age under 18
   (`imagePromptProblem`). The browser checks before asking, and the server
   checks again before counting the request or sending anything, so a
   refused description is never sent. Refused is not reworded: the passage
   says "This one can’t be pictured", with no Try again. "Girl" and "boy"
   are said as "woman" and "man" before sending, since erotica uses them for
   adults and an image model does not.
3. **The image model is steered** by the request itself: an adult floor in
   the positive prompt, and minors and youthful bodies in the negative —
   for the illustrated style, which draws young faces unless told otherwise,
   its own tags as well.

## Safety

**Stop the scene** and **Ease off** are always on screen, while a passage is
arriving too, and they replace typed safewords. They sit at the right-hand
end of the direction buttons' row; the button reads just **Stop**. Under
650px wide the two fold into a menu at that end of the row, so the
directions keep most of it.

- **Stop the scene** drops whatever was arriving — not kept, as an ordinary
  Stop keeps it: it may be the very thing that made someone press — adds a
  `red` turn, and asks for the next passage. **The server answers a stopped
  story with a check-in whatever was asked for**: if the last safety signal
  in the turns sent is `red` (`isStopped`), the prompt swaps the reply
  format for a short, warm, out-of-character check-in with no buttons,
  suggestions or roll, and the page marks the passage out of character. A
  stale page cannot carry on a stopped scene. A banner then offers
  **Carry on** (`resume`), **Carry on, gentler** (`yellow`), or **End here**.
  The composer still works while stopped, and stays out of character.
- **Ease off** drops whatever was arriving, turns the intensity dial down a
  notch, adds a `yellow` turn, and the next passage carries on noticeably
  gentler.
- **Plain words still stop it.** The rules tell the model that a user who
  steps out of the story to say they want to stop, or seems distressed, is
  stopped exactly as if they had pressed it.

Pictures have guards of their own against anything youthful
([Keeping minors out of pictures](#keeping-minors-out-of-pictures)).

Typed safewords went because a button does not depend on the model noticing
a word, and is there before anything has to be typed. Setups from v1 had an
optional custom safeword; the v2 upcaster drops it.

## Reading a passage

A passage is drawn to be read rather than shown as the model wrote it:
paragraphs with space between them, a little Markdown, scene breaks, and
speech set apart, with each voice in a colour of its own.

**The stored text is never rewritten.** A passage is kept exactly as it
arrived, markup and all, and drawn by `formatPassage`
(`src/lib/daydream/passage-format.ts`), which returns runs, each a verbatim,
contiguous slice of the stored text with its offsets. Markup is just the
characters no run covers. That is what keeps quotes working: a quote is
offsets into the stored text ([Bookmarks and reactions](#bookmarks-and-reactions)),
and `DaydreamProse.svelte` draws each run as one element carrying
`data-start`, so a selection is turned back into stored offsets from the run
it lands in (`storedOffset` in `passage-selection.ts`), never by measuring the
drawn text, which is shorter by every hidden marker. Quotes saved before any
of this still point at the same words, and nothing was migrated.

**What it reads**, deliberately little, because a story is prose:

- Paragraphs, split on blank lines; a single line break stays inside its
  paragraph and is drawn as one.
- `*italic*` or `_italic_`, `**bold**`, `***both***`, by CommonMark's
  flanking rules cut down: an opener has a word after it, a closer a word
  before it, and `_` must sit outside a word, so snake_case is left alone.
  A marker that does not pair up is shown as written rather than guessed
  at, and emphasis never crosses a paragraph.
- A line of `***`, `* * *`, `---`, `___` or `⁂` on its own is a scene
  break, drawn as a centred ⁂. Repeated breaks collapse to one.
- A paragraph that is bold throughout is a **standout line** (`standout`),
  drawn larger and in the brand colour, like a pull quote. A monologue opens
  most of its paragraphs with one; any voice's is drawn the same way. It is
  read from the bold already there, not from new markup, so nothing written
  before it reads differently unless it was all bold already.
- Anything else — headings, lists, links — is shown as written. The prompt
  asks for none of it.

**Dialogue.** Text in quotation marks, straight or curly, is drawn in the
dialogue colour, quote marks included. Speech carried on into the next
paragraph leaves its opening mark unclosed, as fiction does, so an unclosed
mark is dialogue to the end of its paragraph and no further. Apostrophes are
never read as quotes.

**Who is speaking.** The prompt asks for every spoken line to be wrapped in a
say tag, `<say who="Charlie">"Sit down,"</say> she says` ("Formatting the
passage" in `server/daydream/prompt.ts`). The tags are never drawn. A line
with a speaker is drawn in that voice's colour (`voiceOf`): the user's own,
named "you" or the name they play under, then the setup's characters in
order, matched by whole name or first name. Anyone else — a passing figure
the model invented — gets the plain dialogue colour rather than a guessed
one that might collide. The colours are the `--daydream-*` tokens in
`theme.css`, apart in hue rather than lightness so none reads as emphasis.
The speaker's name is never drawn beside the line: who is talking is clear
from the story itself, and the colour is enough to follow a conversation by
eye. A tag never closed ends with its
paragraph, and a stray closing tag is hidden. Say tags go back to the model
with the passage like the rest of its words, so the history shows it its
own format. A written-out turn, a quote in a bookmark, and "Not this"'s
limit are shown without markup (`plainPassage`).

**Sounds** — a moan, a gasp, a slap, a knock — go in a sound tag,
`<sound>Mmmph</sound>`, inside a line of dialogue or out of one. The tags
are never drawn; the sound is set in spaced small caps, so it reads as a
sound rather than a word. Out of anyone's line it takes `--daydream-sound`, a
hue the voices leave free; inside one it keeps the speaker's colour, so a
moan still says whose it is. An unclosed tag ends with its paragraph, as a
say tag does, and a tag still arriving is hidden like one.

**Thoughts** go in italics, never in quotation marks, which the prompt says
outright: quotation marks are how the page tells speech.

**Typography.** A line is capped at about 65 characters, with looser leading
than the app's. The story's opening passage starts with a drop cap, and the first
line after a scene break is set in small caps, as a book starts a section.

**While it arrives**, the passage is formatted as it goes, through the same
component, with `streaming` set: anything only half there is hidden rather
than shown and then snatched away — a say or sound tag being written, a last line
that may be becoming a scene break, a marker at the very end — and an
opening marker whose partner has not come yet formats what follows it as if
it had. It is also shown at a steady pace rather than in the provider's
bursts (`SmoothReveal`, `daydream/reveal.ts`): the further behind the text
on screen is, the faster it catches up, never slower than 90 characters a
second, so it smooths without holding the story back. Reduced motion shows it
as it arrives. The arriving bubble is `DaydreamArriving.svelte`; once saved,
the passage is a `DaydreamPassage` like any other.

## The reply format

Each passage ends with a metadata block the browser takes off it:

```
<meta>
{"suggestions": [...], "directions": {"add": [...], "remove": [...]}, "roll": {...}, "ooc": true}
</meta>
```

A reply to words the user wrote starts with how it read them, and, when they
were an instruction for the user's own turn, that turn written out
([Written out for you](#written-out-for-you)):

```
<reading>instruction</reading>
<yours>
"Charlie — the fox is safe. I promise."
</yours>
```

The reading is stored as the passage's `readAs`. It outranks a `readAs` the
model puts in the metadata anyway (still read, as a fallback), and a reading
the user chose outranks both.

A trailing block rather than a JSON reply or a tool call, because the
passage streams first and can be read as it arrives, and tool calls are not
supported alike by every model on OpenRouter. While it streams,
`visibleReply` hides the leading blocks' tags, even half of one, and the
metadata, and reports the reading as soon as its tag closes, so the turn is
drawn as it was read (a direction marker, say) while the passage arrives;
the leading blocks count only at the very start, `<reading>` before
`<yours>`. When it ends, `parseReply`
validates the metadata with the kind's own schema and **degrades rather than
fails**: no block, or one that does not parse, keeps the passage and simply
offers no new buttons or suggestions (the old buttons stay). A block the
schema refuses is salvaged part by part (`salvageMeta`), so one bad part
costs only itself: a suggestion too long, a direction with a bad id (given
one from its label) or no label, a roll that misses a face. Two slips real
replies made are mended rather than refused, because each used to cost the
passage every button and suggestion: `"directions"` written as a plain list,
read as the ones to add, and a string missing its opening quote
(`"label":Comply"`); a `<yours>` block never closed is no written-out
turn, and everything after its tag is kept as the passage; a reading that is
not one of the five is no reading.

**The exchange with the model is kept only for debug mode.** For an account
granted debug mode, each request to the model is kept beside the passage it
wrote, as an exchange: the request body exactly as the server sent it and
the response's events exactly as they arrived (`daydream-exchange`), for the
raw log. Passages from before that kept the reply itself in the turn instead
(`raw`, `daydream-turn` v4). What the page acts on is still the parsed
passage and metadata; an exchange is only ever displayed. See
[debug-mode.md](debug-mode.md#daydreams-raw-log).

**Metadata is not sent back, but for the picture.** Past turns go to the
model as their words (`toContextTurn`); what a passage offered next was for
the screen, and would cost context on every request for nothing. The one
exception is a passage's picture description, which goes back with it so the
model can tell whether a new picture would show anything new
([Pictures](#pictures)). Reactions are sent, because
they say what the user enjoyed, each as a note where it was made: after the
turn that was newest then, which the reaction records (`after`,
`daydream-mark` v2), saying which passage it is on when that is not the one
just before (`#reactionsAlong`). A reaction from before v2 goes after its
own passage. A written-out turn goes back with the passage that wrote it.

## What the server sees

This is the one feature whose content the server handles in plaintext, so
the boundary is stated exactly.

**Stored:** sealed records only, in the owner's self vault — the setup
(`daydream-setup`), each turn (`daydream-turn`), each mark
(`daydream-mark`), each library character and idea
(`daydream-character`, `daydream-scene`), and, for an account granted debug
mode, each request's exchange with the model (`daydream-exchange`,
compressed before it is sealed; [debug-mode.md](debug-mode.md#exchanges)),
with frozen fixtures. Beside them, in plaintext:

- who owns each daydream and library item, and when each was changed;
- each turn's place in the tree (`parent_id`, `position`), when it was
  written, and who wrote it (`user` or `story`) — not what kind of turn it is;
- which turn the user is on (`active_turn_id`);
- which turn each mark is on;
- which passage each exchange wrote, or, for one that wrote none, which turn
  it answered;
- each library item's `revision`.

**In transit, for each passage:** the browser posts the setup and the recent
turns of the branch being read, as text, to `POST /api/daydreams/[id]/reply`,
which validates them (`replyRequestSchema`), wraps them in its own system
prompt and forwards them to OpenRouter, and the provider that writes the
reply. The reply streams back through the server unread.

**In transit, for each picture:** the passage's description, the
daydream's picture style and the idea's heat go to
`POST /api/daydreams/[id]/image`, which wraps them ([Pictures](#pictures))
and sends them to Runware; the picture comes back through the server to the
browser. Stored: only the picture's ciphertext, under a key the server
never has. For an account
granted debug mode, the reply endpoint first sends back the request body it
sent the model, for the browser to keep with the stream as the exchange; it
keeps none of it ([debug-mode.md](debug-mode.md#exchanges)).

**In transit, for each suggestion:** what the suggestion is about goes to
`POST /api/daydreams/suggest`, under the same rules, with a prompt of its
own (`suggest-prompt.ts`). The links in a brief, when they are read
([Links in a brief](#links-in-a-brief)), are opened by OpenRouter and its
fetch engine (Parallel), so those sites see a request for the page — from
them, not from the user or this server:

- for a character or idea being written: its fields (and an idea's parts),
  the names and types of the daydream's other characters, its limits and its
  dials;
- for a casting: the character's own fields, the idea's, the part they are
  cast in, the others' names and parts, where the user stands, and the
  limits;
- for a name: the idea's title and premise, the cast's names, the limits,
  and the first `MAX_NAMING_OPENING` characters of the opening passage;
- for a whole daydream, from the new-daydream page: the brief the user
  wrote (up to `DAYDREAM_LIMITS.brief`) with the side chosen under "You as",
  and for a generated idea also its title and premise, the side and voice it
  was made for, and the research its round came with; and any limits written
  on the draft; it answers with research notes and a summary to show the
  draft as, too (see "Starting one");
- for generated ideas: the brief (up to `DAYDREAM_LIMITS.brief`), the side
  chosen under "You as", and for **More ideas** the titles of those already
  shown; it answers with research notes for the round.

An idea's brief and research are part of the setup, so each passage's
request carries them too, like the rest of the idea.

The answer is a small JSON completion, not streamed, passed back unread for
the browser to check (`daydream/suggestions.ts`). When the provider fails,
the 502 says only "No suggestions just now" — except to an account holding
debug mode, which also gets the provider's status and error body as `detail`
([debug-mode.md](debug-mode.md#why-a-daydreams-suggestion-failed)). A whole
daydream's or generated ideas' request that asks for `debugLog`, from an account holding debug
mode, gets the request body it sent added to the answer as `boundUpRequest`
([debug-mode.md](debug-mode.md#how-a-daydream-draft-or-ideas-were-written)); nothing
of it is kept or logged.

**In transit, for debug mode's "Show prompt":** the same body as a reply, to
`POST /api/daydreams/[id]/prompt`, which answers with the messages
`buildMessages` makes of it and never calls the model. Only for an account
with both Daydreams and debug mode (see
[debug-mode.md](debug-mode.md#daydreams-raw-log)). Nothing goes on to a
provider, and like the two above it stores, logs and inspects none of the
text; its test spies on the console the same way.

For a passage and a suggestion:

- The server does not store, log or inspect the text. The endpoints log a
  failure by status code alone and never pass a request, reply or error body
  to `console`; their tests spy on the console to hold them to that.
- OpenRouter is asked for `provider.data_collection: "deny"`, which routes
  only to providers that say they neither keep prompts nor train on them.
  That is their policy, which Bound Up cannot verify.
- OpenRouter and the provider do read the words. Nothing on a device could
  write passages of usable quality, which is why this exception exists
  rather than a zero-access design (see
  [user-commitments-and-product-goals.md](user-commitments-and-product-goals.md#especially-sensitive-data-should-be-zero-access-by-default)).
  The disclosure says so plainly.

**Not sent:** anything else about the account, the user's name, other
daydreams, the library beyond what is picked, or turns beyond the context
budget.

## The system prompt is the server's

`src/lib/server/daydream/prompt.ts` builds what the model reads in two
halves, split by a line of dashes and a "This daydream" heading
(`THIS_DAYDREAM`):

1. **How to write**, the app's own: the server's `RULES` first, then how to
   read the user's turns, then how a passage is written (see below), then —
   for the system voice and a monologue — its guide and examples, then
   either how to format the passage and the reply format or, for a stopped
   scene, the check-in. The guides are left out of a stopped scene, as the
   check-in is out of character. Which of these is sent depends on how the
   daydream is told and its heat, but nothing in them is the daydream's
   own: no name, title or anything the user wrote.
2. **This daydream**, the setup (`describeSetup`): how it is told, each
   character with their dials in words, the idea with its heat and kink,
   where the idea came from when it was written from a brief, the limits,
   the dials. A persona's name for a monologue is said here
   (`describeNarrator`), not in its guide.

The split is for whoever reads a prompt in debug mode, who can tell at a
glance which half is which, and for the model, told past the line that what
follows is what to write, never a change to how, and that the rules come
first. Until then the setup went straight after the rules, with the guides
and the format after it, on the reasoning that the most recent thing the
model reads is what it acts on. That reasoning only ever held for the
opening, since the whole conversation follows the system prompt; it is the
reply format's own example that keeps replies in shape. With the setup
last, the part holding what the user wrote — the idea's research, quoted
from web pages, included — is the part most plainly marked as material.
Where the idea came from (`describeOrigin`) is the brief in the user's own
words and the research as material, never instructions — it may quote web
pages, which anyone can write — and says that the idea and characters above
come first where they differ, since the user may have changed them since.
The rules are never sent by a browser, so
a page cannot drop them, and they say they come before anything in the
setup, which is where a user would try to talk a model out of them. They
open by saying the story may be as sexual and as kinky as the setup says, or
not sexual at all, rather than calling every story erotic:

- every character is an adult, and nothing underage is depicted, implied or
  sexualised;
- no real, identifiable people;
- the user's stated limits are never crossed;
- Stop the scene stops it and checks in; Ease off eases off; a user who
  steps out to say stop, or seems distressed, is stopped;
- the user's own words and choices are theirs, unless they are watching from
  outside.

Consent is taken as settled, so the story never stops to establish it unless
the daydream is about it, and a fantasy of being taken against someone's will is
played as the consensual fantasy it is.

Owning the prompt also keeps the endpoints a daydream's writer rather than a
general-purpose uncensored model anyone with the feature could aim at
anything. The suggest prompt (`SUGGEST_RULES`) holds the same rules for
characters and ideas, and asks for JSON only. Every suggestion that invents
a story — Surprise me's idea, a whole daydream from a brief, generated
ideas — is also asked to think it through first (`STORY_CRAFT`): who the
people are to each other, where it happens, why now, and, when it is
sexual, which dynamic and acts suit it. One that invents a monologue gets
`MONOLOGUE_CRAFT` in its place ([Starting one](#starting-one)). Familiar tropes are welcome when
the user would enjoy them; invention is asked for only where it makes the
story better. Its examples are deliberately broad
rather than anyone's favourite kinks, because examples steer what comes
back.

### How a passage is written

`writing-guide.ts` holds the craft, as distinct from the content. It is
drawn from a hand-tuned character prompt whose output read well, keeping
what holds for any story; each line answers something the model does left
to itself.

- **Telling the story**, for every voice but a monologue, which has its own
  lines on keeping its ideas moving (`MONOLOGUE_TELLING`): carry on from where the last
  passage ended without retelling it; keep strict continuity; match the
  build-up to what the user wants — a slow or less sexual story has room
  for quiet moments, a fast, hot or kinky one, or a user pushing for it,
  gets there quickly; follow the user's lead and vary the themes rather
  than fixating on one; let a character's description show rather than
  reciting it; and get a stalled story moving. Passages are not told to end
  on a cue for the user, which suits someone only watching the story badly.
- **Writing the prose**, for every voice but the system's, whose own guide
  forbids exactly this kind of narration, and the monologue's, which has no
  scene to describe: spend the words on the people and
  what they do, not on atmosphere that moves nothing; plain physical
  description over metaphor and simile; the senses.
- **Writing sex**, at Explicit and Filthy only, since below that it would
  push a daydream past the heat the user chose: the point is to turn the user
  on; a preference for crude words over clinical ones ("cock" rather than
  "penis"), above all from a character who would talk that way, but never
  from one who would not; bodies described in detail; moans and dirty talk;
  a degradation idea cruder still, where it suits the characters and the
  story. Filthy adds "hold nothing back". Unset heat gets
  the same lines as a conditional, for if the story turns explicit.

How the user's turns are read gained three lines from the same source: a
bare word or phrase nobody in the story would say ("anal") is a direction,
and every direction is read for as much as the heat, kink and limits allow;
an out-of-character answer is plain, with no narration; and a Continue with
nothing from the user lets the story carry on as if they went along with
whatever moves it best, still without writing their words or thoughts. And
once sex can be on the page (Steamy and up, or unset), the direction buttons
the model offers include the next act, position or toy.

User-side turns go to the model as words: what was written (marked
`[Out of character]` when explicit), and notes in brackets for a direction,
a steer, a roll, a reaction or a safety signal. Notes from buttons pressed
one after another go in as one message, because chat models expect the two
sides to alternate. A conversation ending on a passage gets a "(Continue.)",
and a rewrite a request quoting the passage and what to change.

## The model

The story model is an OpenRouter model, chosen on the admin page (see
[Configuration](#configuration)). Every preset is an open-weights model whose
terms, and its providers' on OpenRouter, allow adult fiction.
Most hosted models' terms (Anthropic's, OpenAI's, Workers AI's) do not,
which is why the choice is made here rather than left to OpenRouter's
routing. A passage is capped at 1,200 tokens, room for a few paragraphs and
the metadata after them; a suggestion at 400–900.

The browser reads OpenRouter's stream itself (`src/lib/daydream/stream.ts`):
`data:` events carrying `choices[0].delta.content`, keep-alive comments, a
mid-stream `error` event, and `[DONE]`. The reply endpoint passes the
upstream body through untouched rather than parsing and re-encoding it, so
the worker spends no CPU on a reply it has no reason to read. `EventSource`
cannot be used, because it can only send a GET.

## Context

The model gets the setup and as much of the branch being read as fits:
`trimContext` (`src/lib/daydream/context.ts`) keeps the newest turns within
`MAX_CONTEXT_CHARS` (60,000 characters of what is sent) and
`MAX_CONTEXT_TURNS` (200), and stops at the first turn that does not fit
rather than skipping it, so the model never sees a story with a hole in it.
Once a story outgrows the budget, the cut moves in whole steps of
`CONTEXT_TRIM_STEP` (10) turns counted from the story's start, rather than
one turn per request, so the history starts in the same place for a run of
requests and stays cacheable (see [Cost](#cost)); the price is up to a
step's worth of turns the budget had room for. The server refuses anything
over the same budget. The setup is always sent
whole, which is why the limits live there and not in the story.

## Cost

Every passage and suggestion is paid for on the server's OpenRouter key, and
every picture on its Runware key (about $0.003 each, measured when the
models were chosen). A suggestion that reads a brief's links costs more:
$1 per 1,000 pages fetched, and the pages' text as input
([Links in a brief](#links-in-a-brief)). Four things hold that down:

- **The prompt is built to be cached.** Most providers cache a prompt by
  its start and charge a fraction for the part that matches the last
  request (for the default model's providers, typically a fifth of the
  input price). So everything that changes from one request to the next goes
  at the very end: the system prompt says the same for the whole story, the
  history after it only grows, and the buttons on screen — the one thing the
  system prompt used to list that changed almost every passage — are a note
  on the last message instead (`buttonsNote`). With them in the system
  prompt, nothing after it was ever a cache hit, and the history, most of
  every request, was paid for in full each time: measured over a six-passage
  story, the cached part went from a flat ~1,400 tokens to ~89% of the
  prompt. Changing the setup or its dials mid-story misses the cache once,
  which is rare enough to leave. Trimming a long story is stepped for the
  same reason ([Context](#context)).

  **Each request only adds to the one before.** The history is sent as it
  was sent the first time: each passage goes back with the request that
  asked for it — a rewrite's instructions, the opening's request,
  "(Continue.)" between two passages, and the buttons that were on screen,
  which the page sends with the passage (`buttons` and `rewrite` on its
  context turn, worked out as `#replyBody` worked them out then) — and as
  the model wrote it, a written-out turn first. Each user's turn goes as they
  sent it, and each reaction as a note where it was made. So a request is the previous one, unchanged, with the reply and
  the new turn on the end, and the cache covers all of the previous one.
  `prompt.test.ts` ("the history, request after request") plays a story
  through every kind of turn and checks exactly that. Where it does not hold,
  on purpose or not yet, the cost is one request that misses from that point:

  - a check-in after Stop the scene is asked for under a system prompt of
    its own (`CHECK_IN`); the requests either side of it still chain;
  - taking a reaction back, or changing it, takes its note out of the
    history (a changed one is a new note where it was changed);
  - changing the setup, its dials or the limits changes the system prompt,
    but only from the line on: the setup is its second half, so the general
    half before it still matches, unless the change is to how it is told or
    its heat, which choose what the general half says;
  - trimming cuts the start, at steps, behind an `omitted` marker that tells
    the model the story starts partway through rather than at its beginning.
- **The feature is a grant** (`daydreams` in `src/lib/features.ts`), and every
  load, action and endpoint calls `requireFeature` itself (the API routes
  through `daydreamGuard`).
- **Per-account limits**: 20 passages a minute and 300 a day
  (`DAYDREAM_REPLY_LIMITS`), and, in a scope of their own so that setting up
  never uses up the story, 30 suggestions a minute and 200 a day
  (`DAYDREAM_SUGGEST_LIMITS`), and pictures likewise apart, 20 a minute and
  300 a day (`DAYDREAM_IMAGE_LIMITS`). See
  [rate-limiting.md](rate-limiting.md#daydreams-replies). On everywhere, dev
  included.
- **No key, no feature.** Without an OpenRouter key the pages say
  Daydreams aren't set up on this server, and the endpoints answer 503.
  Without a Runware key there are no pictures, and the story model is
  not asked to describe any.

## Configuration

Set at Settings → Admin → Server settings, and stored as server settings
([server-settings.md](server-settings.md)); read per request by
`readDaydreamConfig` (`server/daydream/config.ts`) and `readImageConfig`
(`server/daydream/image-config.ts`). Neither key is ever generated: each
reply and each picture is paid for on it.

| Setting                   | Default                      | What it is                               |
| ------------------------- | ---------------------------- | ---------------------------------------- |
| `openrouterApiKey`        | none — Daydreams are off     | The key every passage is paid for on     |
| `openrouterStoryModel`    | the `hermes` preset          | The story model: a preset or a custom id |
| `runwareApiKey`           | none — no pictures           | The key every picture is paid for on     |
| `runwarePhotoModel`       | the `dark-beast` preset      | The model for photo-style pictures       |
| `runwareIllustratedModel` | the `wai-illustrious` preset | The same, for illustrations              |

**A model is a preset or a custom one**, stored as JSON. A preset is stored
by its id — `{"preset":"hermes"}` — and mapped to the provider's model in code
(`OPENROUTER_STORY_MODEL_PRESETS`, `RUNWARE_PICTURE_MODEL_PRESETS` in
`src/lib/server-settings.ts`), so a preset can move to a newer version of its
model without anyone touching a setting. The story presets are Hermes (the
default), a larger Hermes, Euryale and Cydonia; the picture presets are Dark
Beast (a Z-Image Turbo fine-tune, the photo default), Lustify (SDXL),
FLUX.2 Klein 9B (Black Forest Labs' distilled model, which Runware lists for
commercial use though BFL publish its weights under a non-commercial licence),
and WAI-illustrious (Illustrious, the illustrated default).

- **A custom story model** is any OpenRouter id, `{"openrouterModelId":
  "vendor/id"}`, found on the admin page by searching OpenRouter's public
  model list (`GET /api/admin/models/openrouter?q=`).
- **A custom picture model** is a Runware AIR and the base model it was
  trained from, `{"runwareModelAir":"…","base":"pony"}`, where the base is one
  of SDXL, Illustrious, Pony, NoobAI, Z-Image Turbo or FLUX.2 Klein. The
  base decides the prompt recipe (`PictureArchitecture` in
  `daydream/image-prompt.ts`): the SDXL family all take tags, Z-Image Turbo
  and FLUX.2 Klein take sentences, in a different order and length. It is found by
  searching Runware's checkpoints with the saved key
  (`GET /api/admin/models/runware?q=`, 409 until a key is saved), which fills
  in the base from Runware's own architecture for that model. The search is
  Runware's rather than Civitai's because Runware does not host every Civitai
  version, and one it does not host fails as an invalid model.

`OPENROUTER_BASE_URL` and `RUNWARE_BASE_URL` stay environment variables: only
the e2e suite points them anywhere else, at its stand-in provider.

## Drafts

The composer keeps an encrypted draft per daydream (`daydream:<id>` in
`src/lib/messaging/drafts.ts`), like a message thread's, so what someone was
in the middle of writing survives a reload. It is the same `MessageComposer`,
with attachments turned off: a turn is text the model reads.

## Following the story

A daydream opens on its newest passage, and a passage streaming in is
followed only while the reader is at the end: one who has scrolled up to
read is left where they are, and followed again once they scroll back down.
Message threads do the same, through the same attachment (`followEnd` in
`src/lib/scroll-parent.ts`, whose comment says why only a scroll _upwards_
counts as leaving the end). Once the story has opened, following glides — a
smooth scroll — so what arrives visibly slides in; the opening itself, and
anything further than a screen, jump.

A daydream also keeps the reader's place in a long passage. Following stops
once the passage arriving has its top at the top of the screen (`followEnd`'s
`holdAt`, on the `data-hold-scroll` element): the rest waits for the reader
to scroll, rather than the start being carried off the top before it has
been read. After it has arrived, the hold stays on that passage while it is
the newest thing in the story — so the suggestions and picture that come
after it do not pull the page on either — and a turn sent after it is
followed to as usual. Holding never moves the page up, and a daydream opened
afresh holds nowhere, opening at its end.

## Ideas, not built

Noted so they are not lost; none is in the code.

- **Read aloud.** A passage spoken, with the browser's speech synthesis or a
  model voice; it would pair with auto-continue below. Say tags already say
  who speaks each line, which a voice per character would need.
- **Auto-continue.** A read-to-me toggle that keeps asking for the next
  passage at a chosen pace until the user interrupts, for the barely
  interacting end of the range.
- **"Previously…" recaps.** A short summary when a daydream is reopened after
  a while. The same summary could double as memory once the context budget
  drops the oldest turns.
- **A book-page layout for narrated stories.** A prose column instead of chat
  bubbles, the user's turns inline as small italic interjections, and the
  choices under the newest passage. Chat bubbles suit characters speaking;
  a narrated story reads better as a page.

## Known gaps

- **Deleting an account leaves its pictures' ciphertext in storage**, as it
  leaves its message attachments': nothing purges media when an account
  goes. The keys went with the account's records, so it is unreadable.
- **A picture whose storing died midway leaves an orphan**, as an attachment
  can: an unreadable object nothing points at, under `permanent/`, where no
  lifecycle rule sweeps. The upload endpoint is not rate-limited, beyond
  being owner-only for a daydream that exists.

- **No escrow without a partner.** A daydream is sealed in the self vault,
  which is recoverable only through a partner and the server
  ([encryption.md](encryption.md#escrow)). Someone with no partner who loses
  every way into their account loses their daydreams and library with it.
- **Edited setups apply forward.** Changing the setup, the dials or a limit
  changes the next passage, not what has already been written.
- **Heat and kink turned mid-story are this daydream's.** The idea in the
  library keeps its own, and the setup page does not show the copy as
  changed, since its library revision has not moved.
- **A stopped passage is kept as it stood**, mid-sentence (Stop writing, not
  Stop the scene's Stop). Writing it again is one press away.
- **A very long story loads its newest 2,000 turns' shape.** Older turns are
  still stored; a branch through them shows from the oldest loaded turn.
- **The new-daydream page keeps no draft.** What is typed in "What do you
  feel like?" survives going back and forth on the page, but not a reload,
  and neither does a setup being made; the encrypted drafts
  (`messaging/drafts.ts`) hold a composer's rich text, not a setup.

## Tests

- Pure: `daydream.test.ts` (every voice combination, a monologue with any
  cast and stance, casting against an idea's parts, the voice guessed from
  the cast and never a monologue),
  `daydream/starters.test.ts` (every ready-made daydream is a setup the form
  would save, cast as written; assembling a draft),
  `daydream/summary.test.ts` (reading the model's markers; what the second
  paragraph says for each voice and each piece left out; when the model's
  paragraph gives way to the premise),
  `daydream/tree.test.ts`, `reply-format.test.ts` (the written-out turn,
  arriving and finished), `passage-format.test.ts` (paragraphs and breaks,
  emphasis pairing and what stays literal, standout lines, dialogue, say tags,
  what is hidden while it streams, quotes across formatting, every run
  verbatim), `reveal.test.ts` (the pace), `dice.test.ts`,
  `chips.test.ts`, `quotes.test.ts`, `ooc.test.ts`, `suggestions.test.ts`,
  `dial-words.test.ts`, `catalog.test.ts` (every starting point is a valid
  record, they run SFW to extreme in order, every chip is one phrase),
  `context.test.ts`, `server/daydream/prompt.test.ts` (the rules always come
  first; a stopped story gets a check-in in any mode; heat is the ceiling;
  the system voice's and the monologue's guides, their place and their
  examples by heat, who speaks a monologue; writing a
  turn out, never for a watcher; directions like a button; chosen readings
  as notes that settle it; the formatting asked for, never in a check-in),
  `suggest-prompt.test.ts`, `config.test.ts`, `daydream/image-prompt.test.ts`
  (the refusal list, the request per style and heat), the sealed fixtures,
  and the
  tree backfill in `server/db/migrations.test.ts`.
- Debug mode's raw log and its prompt endpoint are listed in
  [debug-mode.md](debug-mode.md#tests).
- Server: `server/daydreams.test.ts` (the tree, marks, libraries, ownership),
  the route tests under `routes/(auth-required)/(app)/daydreams/` and
  `routes/api/daydreams/`, and `server/daydream/library-routes.test.ts`.
- Component: `DaydreamThread.svelte.test.ts` (naming and written-out turns
  included: shown and switched, filled in as they arrive, sent written out
  afterwards, fresh for another take and kept by a rewrite; directions drawn
  as markers; Read it differently forking, mid-passage too, and its reading
  kept; a quote selected after hidden markup is stored offsets; a passage
  formatted as it arrives),
  `DaydreamProse.svelte.test.ts` (what is drawn, standout lines drawn larger,
  voices without names, the drop cap, quotes across formatting,
  `storedOffset`), `scroll-parent.svelte.test.ts`
  (following, and holding at a passage's top),
  `DaydreamSetupForm.svelte.test.ts` (the disclosures, casting into parts,
  the voice last and guessed, the summary layout with and without the
  model's paragraph), `SummaryBlank.svelte.test.ts` (one named button to
  assistive tech, taps and drags, kept in a copied selection, the menu
  opening from the words),
  `DaydreamVoicePicker.svelte.test.ts` (names only, the chosen one described,
  its examples' markup drawn, the monologue offered),
  `DaydreamStarter.svelte.test.ts` (the ways in),
  `DaydreamSetupFormAdd.svelte.test.ts`,
  `DaydreamCharacterDialog.svelte.test.ts` (the two halves),
  `DaydreamIdeaDialog.svelte.test.ts` (the parts editor, heat and kink, a
  monologue's fields),
  `DaydreamBranchMap.svelte.test.ts` (the longest-path trunk, jumping,
  folding).
- End to end: `e2e/daydreams.spec.ts` (a ready-made start through its
  summary, a described one with the model's marked summary, a ready-made
  monologue whose bold statement is drawn as a standout line, a brief for
  sayings set up as a monologue, a generated monologue idea kept one, and
  the full form; the stub's opening has an
  italic paragraph, so a quote is kept from inside drawn Markdown) and `e2e/daydream-heat.spec.ts`,
  against `e2e/model-stub.mjs`, a stand-in OpenRouter that `e2e/server.mjs`
  starts beside the app.
