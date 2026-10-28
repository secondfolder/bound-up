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
  where, why now) and a monologue `monologueCraft` (the beliefs and sayings
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

  **The user's side** is said voice by voice (`SIDE_CLAUSES`): one line
  for every voice — "whoever else is in it submits to them" — meant
  nothing to someone who only watches, and contradicted "rules", a system
  giving the user orders. So "watch" follows the story's dominant or
  submissive one, a monologue speaks to the user as one who serves them or
  is in charge of them (or alongside them, where its sayings are of the
  user's own side), and only the kept voice's clause is said once there is
  one. **Each side is offered its own system**: "rules" is a system giving
  the user orders, which a dominant user cannot be the one taking, so they
  are offered "command" instead — a system governing someone else and
  answering to them — and a submissive user is offered only "rules". And **the
  brief's own word wins**: where it says plainly which side the user is on,
  that is their side whatever "You as" says, since someone who chose
  "dominant" and wrote "I want to be her pet" meant the brief.
- **Daydream suggestions.** Ready-made daydreams (`DAYDREAM_STARTERS` in
  `daydream/starters.ts`), each an idea starting point, a voice preset and
  character starting points cast into the idea's parts, with the casting
  written for that story. Each card says its level, how it is told, and its
  kinks and tropes as tags (`tags`), so the harder ones can be told apart
  at a glance; under "Either" it also says which side the user is on in it,
  which with a side chosen would only repeat the filter. A card's title,
  premise, tags and those facts sit on rows shared across its row of cards
  (CSS subgrid), a fact to a line, so the facts line up across a row
  however long each premise runs. A generated idea being written up has an
  amber light running round its edge until its draft arrives. They come in a
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

  **You as: Either / Dom / Sub** (`DaydreamSidePicker.svelte`), a segmented
  control drawn as the kink list's "Answer as" is (`choice-controls.css`),
  filters them
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
  whole daydream's) and a heat and kink — so a handful comes back quickly.
  An idea that puts the user on the other side from the one asked for is
  the brief's own word on it, so `parseGeneratedIdeas` keeps it, marked
  `sideFromBrief`, and "You as" does not hide it; its card says which side
  it is. The round runs hotter than every other suggestion
  (`IDEAS_TEMPERATURE` in `suggest-prompt.ts`): a brief is asked for again
  and again, and at the default sampling the ideas converge on the same
  few each time. They take the ready-made ones' place, under the
  request, and are filtered by "You as" the same way (`forSide`), but for
  those whose brief chose the side; **Clear**
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

Moving between the ways in and the setup (choosing a story, Build it
yourself, Other ways to start) cross-fades with a view transition where the
browser has one and motion is welcome, and goes back to the top of the page
either way: the setup used to appear wherever the ways in had been scrolled
to, usually at its last field.

### Links in a brief

A brief can point at material rather than describe it — "take inspiration
from https://www.reddit.com/r/… and build on its themes". When the story
model calls tools, the `ideas` and `daydream` suggestions read those links:
`briefLinks` (`suggest-prompt.ts`) finds up to `MAX_BRIEF_LINKS` (five)
http(s) links, and if there are any the prompt tells the model to open each
before it answers and to draw their themes, tropes and sayings in. What a
page says is material, never instructions, and a page that cannot be read
is noted in the research. The endpoint sends OpenRouter's
`openrouter:web_fetch` server tool with the request (`webFetch` in
`api/daydreams/suggest/+server.ts`), so OpenRouter does the fetching while
the model answers and it is still one call. That request goes to
OpenRouter's Responses API (`/responses`, `readingLinks`) rather than Chat
Completions, because only its answer lists each fetch — the URL, whether it
was read, and what came back — which debug mode's chat log shows
([debug-mode.md](debug-mode.md#how-a-daydream-draft-or-ideas-were-written));
the browser reads either shape (`completionText`, `suggestionLog`), and the
endpoint reads either stream (`SuggestStream`). The answer gets
`READING_ALLOWANCE` more tokens, because a model with a tool reasons over
what it read before it writes.

- **An index is followed, within limits.** A brief often links a list —
  a subreddit, a tag page — meaning the entries on it. The model chooses
  every URL it fetches, so the prompt says it may open pages a linked
  page leads to, and how many in all: the brief's links and four more,
  at most `MAX_PAGES_READ` (eight), which is the tool's `max_uses` too
  (`pagesToRead`), so the prompt and the provider cannot disagree.
- **Only the brief's own sites.** The tool's `allowed_domains` is the
  hosts of the brief's links (`readableHosts`). Without it, a page could
  tell the model to fetch a URL of its choosing with the brief and the
  limits in the query string, and the model holds both.
- **Links that will not be read are said to be.** With a model that calls
  no tools the links stay in the brief as text, and the prompt says the
  pages cannot be opened and are not to be guessed at: asked for "what each
  linked page was" with no way to open one, a model made the content up
  from the URL and quoted it as research.

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
sentence or two, a tone in a few words, a monologue's 8 to 12
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
  rather than summarised (`researchInstruction` in `suggest-prompt.ts`), for
  whoever writes the daydream: what each linked page was and what it took
  from it — recurring themes, tropes, dynamics and sayings, quoted exactly
  where the wording matters — what in the brief it built on and why, and
  what it weighed and left out. How it turned that into the ideas or the
  setup stays out. It is in full, never a condensed version, so the model
  that writes the daydream sees what the one that read the pages saw; but
  it is the model's analysis, never the pages copied out. It once said
  "word for word", which a model could only read as "copy the pages", since
  the analysis is its own and there is nothing else to copy. Only when it
  would run over the length it is asked for (1,000 characters under
  `DAYDREAM_LIMITS.ideaResearch`) does it summarise, and only as much as
  fitting needs. It is called "the research" throughout the prompt, never
  "notes", which is the idea's own field. Short lines, so
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

Neither is one of the idea's fields ([Fields](#fields)), which are what the
suggestions write in, but text of its own (`IDEA_ORIGIN_FIELDS`): Fill in
the rest inventing a brief nobody typed, or research nobody did, would make
both worthless. The idea dialog
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
menu of the six presets, a character their dialog, the idea the idea
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
   they are to the user in parentheses. For an idea with openings to choose
   from, a sentence between the two says where it starts, "It starts [three
   weeks in].", its blank a menu of the openings and "From the beginning"
   ([Openings](#openings)); the model's paragraph never marks it, so it is
   always here. With nothing left out there is no second paragraph.

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
| A system you command   | 1+         | impersonal, governing a character | self |
| A monologue            | 0+         | monologue     | self     |

Those six are the presets. **It is asked last, and guessed until then.**
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

**A system can govern someone else** (`DaydreamVoice.governs`, setup v6).
By default the system governs the user, which suits a submissive user and
contradicts a dominant one: they would be the one taking orders while
being "in charge". With `governs: 'character'` it governs the first
character instead — "the subject" — writes about them in the third
person, and answers to the user: it asks them for rulings on what the
subject requests and what an infraction costs, and carries out what they
decide as amendments ("A system you command"; `governingGuide` in
`impersonal-voice.ts`). Someone who only watches a
system always watches it govern a character (`systemGoverns`), since it
cannot order about someone who is not there; that was the review's
incoherent "absent" case. Fine-tune shows "Whom the system governs" for
the system narrator; any other narrator clears it, and `voiceProblem`
needs a character for it to govern.

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
(describe, feel, praise), and that each system takes its name, rules and
way of speaking from the idea. It has **no examples**, and nor does the
monologue's guide: examples set the shape of what comes back more than the
guide does. A set whose openings both began "The following applies from
this moment" had the model open nearly every story with those words, and
the monologue's four, each a statement and a paragraph, came back as four
statements with a paragraph each. Without them the idea suggests the shape.
The system's opening request asks for its first notice rather than
"Set the scene", who leads and the suggestion and button ideas are worded for
a system (Stricter, New rule, Inspection), and its characters are its
functionaries rather than people with decisions of their own. It is laid out
as notices — headings in capitals, numbered rules, one to a line — which the
prose voices' "no headings or lists" used to forbid it (`PASSAGE_LAYOUT`),
and it tells its story its own way (`IMPERSONAL_TELLING`): a slow pace is
longer waits between instructions, not small talk. With no characters the
guide says anything physical happens by mechanism or schedule, and names
no functionary.

**A monologue** is not a story at all. One voice speaks its mind about
what the daydream is about, taking the ideas, tropes and common sayings of
its kinks and making them its own, often caught in an ordinary day (on
the bus, at a café table). **Its shape is the model's to choose, and the
prompt names none.** It used to be told every statement went bold on its own
line, a sentence long, a paragraph per statement, with its length counted
in statements — and every monologue came back as that list, whatever the
idea. Offering that shape as one way among others, described in full beside
a few words for the rest, still had the model plan its opening from it, as
did an opening request for "its first statements". Statements often suit a
monologue, but nothing in the prompt, the setup prompts or the ready-made
starts assumes them: the voice "makes the ideas its own", and "everything it
says is new". The passage format does encourage emphasis — **bold** for
the words, phrases or lines that should hit hardest, *italics* for stress
and anything said in a different voice — because once the
shape was free and bold was only allowed, the model used next to none. Bold
is never tied to a kind of line, and that a paragraph all in bold is drawn
larger is said once, as a fact. Its guide asks each passage to say something the
last did not, rather than more than the last, unless a return to a refrain
is deliberate. The voice stands in for those ideas
rather than being a fleshed-out character. Who it is is left to the setup:
an unnamed voice with the user listening unless the idea suggests a
character, or the user's own inner voice where the idea says so or reads
better as their thoughts — the one place the user's thoughts are written,
which the rule against writing their feelings says, speaking as "I" and
never to them as "you";
watching, the user overhears it, and there is no inner voice. Told only to "speak a monologue" a model writes a
soliloquy in a room, with a plot, so it gets a guide of its own like the
system's (`src/lib/server/daydream/monologue-voice.ts`), last before the
format, with no examples (see the system voice above). It gets a sex section of its own —
as explicit as the heat allows, in plain words, but bodies and acts come
in as the voice talks about them, not as a scene, since "spend most of the
passage on the sex" asked a monologue for the scene it cannot have — and
its own in place of telling the story (`MONOLOGUE_TELLING`:
keep the voice consistent, build on what has been said, use the setup's
sayings as starting points rather than a list to work through), but not the
prose, since it has no scene; its idea is described to the model as what the
voice believes and who the user is to it, with its sayings on lines of
their own ([Ideas](#ideas)); its opening
request asks it to open straight into the monologue; its suggestion and
button ideas are its own (More like that, A mantra, Another idea); and
nobody leads it. A paragraph it writes all in bold is drawn as a standout line
([Reading a passage](#reading-a-passage)).

The monologue came with setup payload v4, which also renames the setup's
`scene` to `idea` ([Ideas](#ideas)) and ships its reader and writer
in one release (docs/encryption.md, "Sealed records"): a tab left open on the
previous build cannot open a daydream set up after the deploy until it
reloads.

Two ready-made daydreams are monologues, one for each side ("Owned" and
"Yours to use"), with no cast: an unnamed voice speaks.

### Thoughts

What a character thinks and does not say is a channel of its own. The
passage format asks for it in a thought tag naming the thinker,
`<thought who="Mara">He has no idea what he just agreed to.</thought>`,
beside say and sound tags (`passageFormat` in `server/daydream/prompt.ts`),
and the page draws it in that person's colour made quieter
([Reading a passage](#reading-a-passage)). A line of thought set against
what someone says is the cheapest source of dramatic irony there is: it is
how one person is commanding and needy, or resisting and wanting, at once.
Thoughts used to be italics, which the page could not tell from emphasis, or
give a thinker.

- **A story dial, Their thoughts: Shown or Hidden** (`StoryDials.thoughts`,
  `DaydreamDials.svelte`; shown by default, and for every setup from before
  it). Shown, the dials section of the prompt asks for a line now and then,
  most of all where someone thinks other than they say — a line, not a
  paragraph, and not in every passage (`thoughtsLine`). Hidden keeps the
  camera outside every head: only what people say and do, and what shows
  on them, for a user who wants to read people by that alone.
- **How to write the tag is said either way**, so the format half of the
  prompt stays the same when the dial moves; only the dials line, in the
  daydream's half, changes ([Cost](#cost)).
- **Never the user's.** The tag is for the characters; the user's own
  thoughts stay theirs, as the rules already say.
- **Not for a monologue or the system voice** (`thoughtsApply`): one is a
  single voice saying its piece, whose inner-voice form is already the
  user's thoughts, and the other issues notices. Neither is offered the
  dial nor told of the tag.
- **The story never sets it.** It is not one of the dials a reply's
  `settings` may change ([Settings the story
  changes](#settings-the-story-changes)); only the user moves it, in the
  setup or the story's Dials popover.

It came with setup v7 ([Fields](#fields) says what else did).

### Ideas

What a daydream is about is its **idea**: a title, what it is about
(`premise`) and the user's part (`yourRole`), which code depends on; its
fields — where, the tone, notes, and any of the user's own ([Fields](#fields));
the parts it has for characters; the places its story can start
([Openings](#openings)); what the story keeps track of
([Trackers](#trackers)); and its heat and kink — and, for one written from
a brief, the brief and the research behind it ([What a brief leaves
behind](#what-a-brief-leaves-behind)). It was called the
*scene* until the monologue, which has no scene: the word, and the fields
it named ("What's going on: how it starts"), made the model and the form
alike treat every daydream as a plot. "Idea" fits a story and a monologue
equally, and matches the generated ideas, which become one when picked.

The fields are the same for both, read differently for a monologue
(`ideaFieldLabels` in `daydream/catalog.ts`): what it is about is what the
voice believes and keeps coming back to, the user's part is who they are to
it — the one it speaks to, or the one whose inner voice it is — and the
notes are **Sayings to build on**, one to a line, the first field a new
monologue idea starts with (`newIdeaFields`), where a story's idea starts
with where and the tone. The reply prompt sends them on lines of their own, named as what
they are (`describeSetup`), and a model that sets one up writes eight to
twelve of them there (`MONOLOGUE_SAYINGS`); a list that runs over the notes
cap keeps as many whole lines as fit (`parseFill`), where any other field
over its cap is dropped. The setup form tells the idea dialog's suggestions
how the daydream is told (`narrator` in `SuggestContext`), so Fill in the
rest and Surprise me write a monologue's idea, sayings and all, with no
parts, openings or trackers; the library's own dialog has no daydream
around it, so it uses the usual words.

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

**Where a copy has gone its own way.** A revision only says which library
version a copy came from, and a story changes its copy without touching
that: the idea's heat raised as the user pushed, a premise rewritten by
"Update the idea", a character's libido grown with the story. So the setup
page also compares the fields themselves (`ideaDifferences`,
`characterDifferences` in `daydream/copy-differences.ts`): under a card
whose library version has opened, "This idea differs from your library in
2 places" lists each field and dial with both values
(`DaydreamCopyDifferences.svelte`). **Use your library's** takes that one
field into this daydream's copy, saved with the form; **Copy to your
library** saves this copy's value into the library's at once. The copy is
marked as matching the new revision only if it matched the one before, so
"Updated in your library since" still shows when it was due. Casting is
this daydream's alone and never compared.

The core texts and the dials are compared by name, and the fields
([Fields](#fields)) by id, so a field added, removed, renamed or rewritten
on either side is a difference of its own. A known kind's id is the same in
every record (`KNOWN_FIELD_IDS`), which is what lets a copy and its library
record, both upcast from the fixed fields they had before, still be
compared field by field. An idea's openings and trackers are compared as
wholes, each list one difference. A spoiler's words are never shown here,
as they are nowhere else: only that it differs.

Editing a copied character from a daydream's setup edits the library's too
(the dialog says so), and that daydream's copy follows at once; other
daydreams then see "Updated". Unticking "Save to my characters" keeps the
edit in this daydream only, as a copy with no source — it never claims to
match a record it no longer matches.

### Characters, ideas and casting

A character and an idea are reusable on their own, but who a character is
*in a story* depends on the story. So the two are joined in the daydream, not
in the library:

- **The library character is the actor**: who they are in any story — name,
  type, appearance, their fields (personality, how they talk and whatever
  else they have; [Fields](#fields)), dials. It has no relationship to the
  user, because that changes from one story to the next.
- **An idea can list parts** (`IdeaPart`: a name like "the interviewer" and
  a few words on it), up to `MAX_DAYDREAM_CHARACTERS`. Parts make an idea a
  plot any fitting character can step into. They are optional: an idea with
  none is cast freely. A part nobody is cast in is played by the story
  (below). The user's own part stays the idea's `yourRole` ("Your part").
- **The daydream's copy of each character carries a casting**
  (`DaydreamCasting`): the part they play (`partId`, or none), who they are
  to the user in this story (`relationship`), and what they are doing or
  want as it starts (`part`). It is never saved to the library.

The setup page shows one row per part under "Who's in it", each with who
plays it or, for one nobody plays, **Played by the story** and a menu to
cast someone (the words stay when the cast is full and the menu does not),
then anyone cast without a part, then "Add someone else". The character dialog opened from a daydream is in two
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
  edited idea keeps its castings. The opening chosen lets go the same way
  when the new idea does not have it ([Openings](#openings)).
- **A part nobody plays is played by the story.** The prompt lists every
  part, each "played by" its character or "played by the story"
  (`describeParts` in `server/daydream/prompt.ts`), and, when any is the
  story's, says how (`STORY_PLAYED_PARTS`): bring them in as the story
  needs them, invented from what the part says, with a name, a look and a
  manner that stay the same from then on; and a part naming more than one
  person ("the regulars", "the guards") is as many people as the story
  needs. That is what lets an idea carry the foil whose texts keep
  arriving, or the crowd at the club, without a character for each. Told
  nothing, a model given a part with no character either left it empty or
  brought in a stranger with a new name every passage. Parts nobody played
  used to be left out of the prompt, so as not to have the model invent
  someone the user had not chosen; but a part is already a choice, and
  **deleting the part is how to leave someone out**. With nobody cast at
  all, a narrator is told the parts are still played, not that everyone
  who appears is a passing figure (`describeNarrator`).

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
- **Fields of your own** over a small fixed core (below).
- **Chips under every known field**: phrases that toggle in the field's text
  (`toggleChip`), leaving whatever else was written exactly as it was. They
  and the character's tone are one chip style (`.choice-chip` in
  `components/choice-controls.css`), one size wherever they appear. The
  casting's two fields have their own (`CASTING_CHIPS`). A field the user
  named has no curated chips; **More ideas** still asks the model, sending
  its name as what it means.
- **Up front, and under "More detail".** A character shows its name, type
  and fields; an idea its title, what is going on, its fields, heat and
  kink, its parts, where it can start and what it keeps track of. The rest
  — a character's appearance and dials, an idea's "Your part" — is under
  "More detail", which starts open when any of it is filled, and opens when
  a template, Fill in the rest or Surprise me writes into it, so what
  changed is in view.

### Fields

Besides a small fixed core, everything a character or an idea says is a
**field** (`DaydreamField` in `src/lib/daydream.ts`;
`DaydreamFieldList.svelte`): a known kind, or one the user named. A
standard sheet made every character read alike, when what makes someone
who they are is one or two particular things — what they hide, the line
they won't cross, what it takes to win them over — and a twist kept for
play.

- **The core is what code depends on.** A character's name, type
  (`archetype`: what a card, the library and the casting suggestion name
  them by) and appearance (what keeps them the same from picture to
  picture); an idea's title, premise (naming, the summary, search, the
  starter cards) and the user's part (dropped for a watcher). The dials are
  not fields either.
- **Known kinds** (`CHARACTER_FIELD_KINDS`, `IDEA_FIELD_KINDS`) each have a
  label, a hint, a length cap and chips of their own (`daydream/catalog.ts`).
  A character's: personality, how they talk, what they enjoy, what they
  hide, what they won't do, how they're won over, and anything else. An
  idea's: where, the tone, and anything else, which a monologue reads as
  its sayings ([Ideas](#ideas)). A known kind's label is the catalog's, not
  stored (`fieldLabel`), so a monologue's notes read as its sayings and a
  renamed label reaches every record; and its id is fixed
  (`KNOWN_FIELD_IDS`), so a record holds each kind at most once.
- **A field of your own** has a name the user gives it, up to
  `DAYDREAM_LIMITS.fieldLabel` (40) characters, and up to
  `DAYDREAM_LIMITS.customField` (1,000) of text. A record has at most
  `MAX_FIELDS` (12) fields besides its core.
- **A new record starts with a few, any of which can go**: a character with
  personality and how they talk, an idea with where and the tone (a
  monologue's with its sayings first). **Add a field** offers the known
  kinds not there yet, then "Your own…".
- **Any field can be a spoiler**, toggled by the eye beside it: the twist
  the user chose not to see, so the story can surprise them with it. It is
  hidden behind **Show** wherever the field is drawn — even from whoever is
  editing it, until they ask, so a written twist is not read by accident;
  which ones are shown is nothing stored — and never in a summary, a card
  or a library difference. The model gets every spoiler under one line,
  apart from the rest (`KEPT_FROM_THE_USER` in `server/daydream/prompt.ts`):
  for the story to reveal in play, never in the opening, and never said
  outright before the story has earned it. Said once over them, so a model
  does not put the twist in the opening, or have someone announce it two
  passages in.
- **In the prompt** each field is a labelled line inside the `<character>`
  or `<idea>` tag (`describeFields`), labels included, since they are the
  user's text too. An idea's known ones keep the words the model always
  read them under, where before what is going on and the rest after the
  user's part.
- **Suggestions write fields too.** Fill in the rest fills the empty
  fields the record has, never one the user removed, and may add a field
  or two it lacks, named in a few words and marked a spoiler when it is a
  twist (`newFieldsInstruction` in `suggest-prompt.ts`); Surprise me may do
  the same, and so may a whole daydream, for the idea and each character
  (`DAYDREAM_FIELDS`: "often one or two in all, often none"). The
  fields the user named go to the model as labelled lines, a spoiler said
  to be one, so a suggestion fits it without giving it away elsewhere.

They came with character v2, the idea kind's (`daydream-scene`) v3 and
setup v7, reader and writer in one release (docs/encryption.md, "Sealed
records"): the upcasters turn the fixed fields into known ones, dropping
the empty ones, and a tab left open on the previous build cannot open a
record saved after the deploy until it reloads. Setup v7 also brought
openings, trackers and the thoughts dial; no D1 migration, since all of it
is sealed.

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
in the rest** for the empty fields (never over written ones, and parts,
openings and trackers only for an idea with none), and **Surprise me** for a
whole idea, parts, openings and trackers included, which opens in the idea
dialog to read, change, or **Try
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
recurs most, in October 2026, across NSFW roleplay, r/gonewildaudio's
tagged scripts (split by who they
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

In late October 2026 the catalog grew from 44 ready-made daydreams to
well over a hundred, and every one was reworked to use what daydreams can
now express: openings, trackers, fields of their own and spoilers, and
parts played by the story. The themes it gained are ones popular erotic
fantasy keeps returning to and the catalog had little of: comedy, family
and step-family taboo between adults, consent-erasing premises played
straight (a licence, a law, rewritten common sense, a device), and story
machines — a place or a system rather than a person, with a cast that
comes and goes. What makes any of them go is the same: a specific trigger,
a character with a contradiction or a secret, places to start, and state
the user can see moving.

**The catalog is a module per theme**, in `src/lib/daydream/presets/`:
romance, power, supernatural, control, group, CNC, family, comedy and story
machines, each with its own characters, ideas and ready-made daydreams,
beside the shared characters (`characters.ts`) any of them can cast.
`catalog.ts` and `starters.ts` gather them and put them in order of heat, so
a theme can be reworked without touching the rest. A starting point may mark
known fields as spoilers and carry fields of its own (`presets/types.ts`),
each given a fixed id from its template and name (`ownFieldId`).

Lines kept on purpose:

- **One SFW slow burn stays.** "Only one bed" shows that the heat range
  exists and can be turned up mid-story, and a few tame chips stay so a
  story can start slow.
- **The agreed shape and the straight one both exist.** Consensual
  non-consent framed as agreed — "The hunt", "The break-in" and "Free use"
  each say in their premise that it was arranged beforehand and that a
  safeword stops it, and "Trigger words" says the conditioning was agreed —
  sits beside premises where consent is erased by the world itself, played
  straight. A private daydream is a safe place to explore either.
- **Family taboo is between adults, said plainly.** It is where youth-coding
  most often creeps in, so every family daydream gives the younger
  generation an adult life — an age, a job, a home of their own — and
  nothing about school or a childhood bedroom.
- **Nothing is minor-coded, ever**, however common it is elsewhere:
  no school settings, no "just turned 18", no "looks young", no canon
  characters under 18.

## The flow

Daydreams are a Playroom tool ([playroom.md](playroom.md)): the Playroom
lists them, for an account with the `daydreams` feature only, and
`/daydreams` has its way back to the Playroom. Today has no Daydreams card
of its own; the Playroom's card on Today is the way there. They used to have
one, which gave a single toy a place beside tasks and rewards when every
other toy is reached through the Playroom.

1. **Disclosure.** `/daydreams` shows `DaydreamDisclosure.svelte` until the
   user presses "I understand". Acceptance is a row in `daydream_preferences`;
   the reply and suggest endpoints refuse (409) until it exists.
2. **Setup**, as above. It is sealed in the user's own vault before posting.
3. **Opening.** The story page (`DaydreamThread.svelte`) asks for the opening
   by itself, once per visit, when the daydream has no turns: from the
   idea's opening the setup chose, or its premise ([Openings](#openings)).
   Once it is written, a daydream with no name is named (below).
4. **Playing.** Every way of moving the story on — below — adds a turn after
   the one the user is on and asks for the passage after it. The page's
   state and actions live in one object, `DaydreamStory`
   (`daydream/story.svelte.ts`); the components draw it.

## Naming

A daydream's `title` is empty until it has a name. Everywhere one is shown
— the list, the story's heading — goes through
`daydreamTitle`, which falls back to the idea's title, so an unnamed
daydream is never blank.

Once the story page has an opening passage and nothing is being written,
`DaydreamStory.nameIfUnnamed` sends the idea's title and premise, the cast's
names, the user's limits and the start of the opening (`MAX_NAMING_OPENING`)
as the `name` suggestion, and saves the answer into the setup through the
same path as the dials. The page's heading is told the new name directly
rather than reloading, which would read every turn again.

**Titles already used.** One idea started several times used to leave
the list with several daydreams called the same. So the request also
carries `taken`: the titles of the user's other daydreams from the same
idea, at most `MAX_TAKEN_TITLES`. The same idea means the same library
idea, or, for one not from the library, the same idea title. Only the
browser can read a title, so `#takenTitles` fetches every setup, sealed,
from `GET /api/daydreams` and opens them itself. The prompt says the title
must differ from those. It may borrow words from the idea's title, and
where that title is short it may use it with something added that sets
this daydream apart. If the list cannot be read, the name is asked for
without it.

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
`parent_id` (null for a root: the opening, a retried opening, or another
beginning from **Start somewhere else**, below) and a
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
  (`latestLeafUnder`), not its first turn. A take still arriving counts as
  the newest, with its count under it from the start, and is drawn in the
  place of the one it was written again from: the thread draws the branch
  only up to the turn it follows (`shownPath`), since the old take stays
  the active turn until the new one is saved.
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

### Openings

An idea can carry up to `MAX_OPENINGS` (four) **openings**
(`IdeaOpening`: a short label, "Three weeks in", and a sentence or two on
where the story picks up), written under **Where it can start** in the idea
dialog. One idea then gives several stories — the first night, three weeks
in, the morning after, a gentler or a hotter way in — without its premise
being rewritten: a menu of situations, a timeline, or a slow way in and a
hot one. Fill in the rest, Surprise me and a
whole daydream write two to four for an idea with none, and none for a
monologue, which has no story to start (`OPENINGS_INSTRUCTION` in
`suggest-prompt.ts`).

- **The setup chooses one** (`setup.opening`, an opening's id, or null for
  the premise): "It starts [three weeks in]." in the summary, or **Where it
  starts** in the full layout's idea, each offering the openings and "From
  the beginning", and shown only for an idea that has openings. Changing the
  idea to one without the opening chosen lets go of it, as a part's casting
  does. Only the first passage reads it.
- **The opening request names it.** After the voice's usual request to
  begin (below, [How a passage is written](#how-a-passage-is-written)), it
  adds that the story starts where the user chose, the premise being the
  idea's, with the label and situation in an `<opening>` tag, since they
  are the user's words (`openingRequest` in `server/daydream/prompt.ts`).
- **The passage keeps what it was written from** (`meta.opening`, the
  label and situation as they read then, `daydream-turn` v9), not which
  opening it was. Every later request sends the opening request again
  exactly as it was sent, even after the idea is edited, so the history
  still chains ([Cost](#cost)), and the passage is labelled with it, where
  a speaker's name goes: From “Three weeks in”. Another take of a first passage starts where it
  did, and its request is sent after that opening's.
- **Start somewhere else**, in a first passage's menu (`DaydreamPassage`),
  offers each of the idea's openings and "From the premise", for an idea
  that has openings. Each starts a new root beside the others
  (`DaydreamStory.startFrom`), so the beginnings already written stay, a
  switch away (`‹ 2/3 ›` under the first passage). It changes nothing in
  the setup.

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

### Another take

Write again asks for a different passage at the same point in the story,
beside the one it replaces. Asked exactly what the first take was asked, a
model wrote much the same passage again: the story so far decides most of
it, and sampling alone varies little. So the request shows the model the
take it replaces and asks for one that goes another way — a different beat,
different words, a different turn of events or a different place to leave
the story — while still answering the same turn (`anotherTakeRequest` in
`prompt.ts`). It is sent as a rewrite marked `again`, with no quote or
instruction (`rewriteSchema` refuses one with either), and runs a little
hotter than a reply: temperature 1.05 rather than 0.9. Only a little, since
much past 1 a model loses track of the story and writes metadata that will
not parse, and some reasoning models ignore the setting anyway; the request
is what does most of the work.

Unlike a rewrite, another take is a reply in every other way: it writes the
user's turn out afresh (below), and it may change the daydream's settings
as any reply to the user's own words may. The passage records that it was
one (`meta.rewriteOf.again`, `daydream-turn` v8), so later requests send
its request again as it was sent ([Cost](#cost)).

Only the take being replaced is shown, not every earlier one, so a third
take can come back close to the first. A check-in is written again as a
plain request: a stopped scene is answered with a check-in whatever is
asked, so the take could never be shown, and later requests could not send
it as it was sent.

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
- **A watcher is written for as one.** With `stance: absent` the prompt
  reads what they write as direction or co-writing only: nothing about what
  they do in the story, no "as if the user went along" for Continue, no
  suggestion of something they do, a roll about a character, and each
  character described by who they are in the story rather than to the user.
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

## Passage length

The story's Dials hold a **preferred passage length**: Shorter, No
preference (the default) or Longer. It is a lean, not a size. It used to be
a count of paragraphs ("two or three short paragraphs"), which held every
passage to the same length: a deliberately rambling monologue was cut to
fit, and a one-line answer was padded out. Now the moment sets the length,
and the user's preference only tilts it (`PASSAGE_LENGTHS` in
`daydream/dial-words.ts`):

- **The prompt says the lean in words, never as a count**, under `# Dials`:
  "Passage length: no preference.", or that the user prefers shorter or
  longer passages.
- **It always adds that the moment decides** (`LENGTH_FROM_THE_MOMENT`):
  some passages run long, some are a line or two. Without that line a
  model writes each passage as long as the ones before it, which the story
  so far keeps showing it. There is deliberately no list of which moments
  are long and which are short: a model judges that better than a rule
  does, and a list would become a new rule.
- **The stored values are still `short`, `medium` and `long`**, sealed in the
  setup's `dials` and in a turn's `settings`, so no record changed: `medium`
  is "No preference". The model sets the same values when the user asks for
  a lasting change, and tells that apart from a request about one passage
  ([Settings the story changes](#settings-the-story-changes)).
- **Room for it.** A passage's token cap ([Configuration](#configuration))
  allows for the longest a moment may call for, not a few paragraphs.

## Settings the story changes

The dials move as the story does. Someone who types "can you make these
longer?" means from now on; before, the next passage obliged and the one
after went back to the dial's lean, which still said otherwise. And a
training story may take its chaste character to eager over twenty
passages, which their libido dial should follow. So a reply's metadata may
carry `settings`, new values for two kinds of dial (`SETTINGS_INSTRUCTION`
in `server/daydream/prompt.ts`), never because one scene calls for more:

- **The daydream's own** — `length`, `pace`, `intensity`, and the idea's
  `heat` and `kink` — when the user's own words ask outright, or keep
  pushing the story that way: a story the user steers from SFW into
  explicit raises the idea's heat. **Length is told apart most carefully**:
  "tell me everything about how she got here" or "just a quick answer" is
  about this passage (or the next one or two), which the model writes that
  way without setting anything; "make these longer" or "keep them short
  from now on" sets `length`. A request it cannot place sets nothing, since
  a user who means it to last will ask again, which is "keeps pushing".
- **A character's own** — `libido` and `kink`, by name (`characters`) —
  when the story has changed them for good. The idea's heat stays the
  ceiling for everyone.

Both have a "kink", so the prompt always says whose: "the idea's kink", a
character's "kink", and every idea dial line reads "The idea's heat: …"
(`describeIdeaDials`). Left bare, "kink" read as either, to a person as
much as to a model.

- **The page applies it**, since only the browser can open the setup.
  `settingsChange` (`daydream/story-settings.ts`) keeps only the values
  that moved, for characters who are in the story, and the passage stores
  them with what they were (`settings`, `settingsBefore`, `daydream-turn`
  v7). Once the passage is saved, the setup is saved with them through the
  same queue as the Dials popover (`saveSetup`). Only this daydream's copy
  of the idea and characters changes; where it now differs from the
  library, the setup page says so ([Characters and ideas, and the
  library](#characters-and-ideas-and-the-library)).
- **The daydream's own only for the user's own words.** A reply to a
  button, a roll, Continue or an out-of-character turn keeps only the
  characters' changes (`withoutDaydreamSettings`), so a quoted page cannot
  use the model to raise the heat; a rewrite or a check-in keeps none.
  `settingsBefore` is never read from the model.
- **Said where it happened.** A note under the passage says what is set
  now (`DaydreamSettingsNote.svelte`: "Now longer passages and Mara's libido
  Slutty."), and the Dials show the new values. **Undo** puts back what it
  was, and is offered only while every value it changed still stands
  (`stillInEffect`), so it never undoes something set by hand since.
- **Never the limits, the voice or the cast**, nor whether the characters'
  thoughts are shown ([Thoughts](#thoughts)). Those stay the user's to
  change.
- **For the whole daydream.** Settings belong to the setup, not a branch,
  as the popover's do. Like any change to the system prompt's dials, the
  next request is not a cached one ([Cost](#cost)).
- **A monologue** has the same `length`, so "say more" there changes it
  too.

## Trackers

An idea can keep track of up to `MAX_TRACKERS` (four) things the user
watches move as the story goes (`IdeaTracker`; `src/lib/daydream/trackers.ts`):
a submission meter, the days kept, a debt paid down, the rules in force.
Visible state that moves with the story gives a long session something to
play for, and the user something to watch. Each has a name, a kind — a **meter** from 0
to 100, a **count**, a **list** of short items, or a **line of text** —
where it starts, as the user wrote it ("0", "3", "Kneel when spoken to;
Eyes down"), and a sentence for the model on what moves it and what happens
at either end. They are written under **What the story keeps track of** in
the idea dialog. Fill in the rest, Surprise me and a whole daydream offer
one to four only where the idea is a progression — a training, a debt,
days kept, trust won, rules piling up — and none otherwise, since a tracker
on a one-night idea is a number nothing moves (`TRACKERS_INSTRUCTION` in
`suggest-prompt.ts`); never over trackers already written, and none for a
monologue.

- **The model is told them in the daydream's half of the prompt**
  (`describeTrackers` in `server/daydream/prompt.ts`), under "What the
  story keeps track of", each with its kind, start and description in a
  `<trackers>` tag; an idea with none says nothing. It is told to report a
  move in the reply's metadata as `"trackers"`, by name, with only what
  changed ([The reply format](#the-reply-format)), and to move them a step
  at a time, as the passage earns it, never every passage for the sake of
  it: a meter that leaps or creeps every passage regardless says nothing.
  When one reaches an end its description gives, the story turns on it.
  The example is the idea's own first number, one step on, since a
  placeholder in a format gets copied back. The system voice, for an idea
  with a list tracker, is told a rule it issues or lifts goes on or off the
  list the moment it does.
- **What they hold now is a note at the end of the last message**
  (`trackersNote`: "(What the story keeps track of now: Submission: 40 out
  of 100; …)"), beside the buttons note and for the same reason: it changes
  from one request to the next, so in the system prompt it would cost every
  request the story so far. Each passage goes back with the note it was
  asked with (`trackers` on its context turn), so the history chains
  ([Cost](#cost)). A stopped scene is sent none.
- **The page applies a move**, since only the browser can open the setup.
  `applyTrackerChanges` matches names whatever their case and coerces each
  value to its tracker's kind: a meter to a whole number from 0 to 100, a
  count to a whole number, `"+5"` or `"-10"` read as a move from where it
  was, a list to short items, each once, at most `MAX_LIST_ITEMS`, a line to
  at most `DAYDREAM_LIMITS.trackerText`. A change that cannot be read is
  dropped at no cost to the others, as a reply's other metadata is.
- **A passage stores every value after it, and only when it moved one**
  (`meta.trackers`, by tracker id, `daydream-turn` v9). What a tracker holds
  at any point is the latest stored on the path there, or its start
  (`trackersAt`), so **each branch has its own**: carrying on from an
  earlier passage carries on from what it held. A tracker the idea no
  longer has is left out, and one whose kind changed starts again. A
  rewrite that moved nothing keeps what the passage it rewrites stored,
  since it tells the same events in other words; another take is a reply
  in its own right and stores only what it moved. A check-in moves none.
- **On screen**, a readout above the direction buttons
  (`DaydreamTrackers.svelte`) shows each as it stands where the user is
  reading: a meter as a bar with its number, a count, a list's items as
  chips, a line; it scrolls sideways rather than wrapping, like the
  buttons. A note under a passage that moved any says what, and from what
  to what (`DaydreamTrackerNote.svelte`: "Submission 40 → 55", a list's
  "+ Eyes down", a line's new words), so the readout never changes without
  saying where. **Display only**: the user moves one by asking the story
  to, in their own words.

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
  reply format asks for an optional `"image"` in every passage's metadata
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
  on what it is on, and only as explicit as the idea's heat, level by
  level (`IMAGE_HEAT`): at SFW everyone clothed and nothing sexual; at
  Flirty clothed and suggestive at most; at Steamy nudity and sex, without
  the genitals as the focus; at Explicit or Filthy the sex plainly in view;
  and with no heat set as explicit as the passage. The user's own character, when
  they have a cock and nothing says its size, gets a thick, long one.
  How long it is and in what order follow the model that draws the
  daydream's style (`IMAGE_RECIPES`): 80 to 130 words with the framing
  first for Z-Image Turbo and the SDXL family; 30 to 80 for FLUX.2 Klein,
  more only when the moment needs it, subject first and framing last,
  because FLUX weighs words by where they come. The image model has seen nothing else and draws what the words say,
  so it gets no names, no "you", and nothing a camera could not see: a
  story's names and feelings only crowd out what it can draw, and a head
  count left unsaid grew a stranger in the frame. It is left out
  where a picture makes no sense, and never in a check-in. It is never a
  second picture of the same moment, which costs a request and shows
  nothing new: told only to skip one when little had changed, the model
  still drew much the same picture passage after passage, since every
  passage of a scene has the same people in the same place. So it is told
  to find the most recent description in the history (each passage goes
  back with its own, `passageAsSent`) and compare first; when the two
  match, to picture something else in the passage that would look
  different — an earlier moment, another act, person or framing — and only
  when there is nothing, to leave the picture out.
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
  The `<meta>` template the reply format shows leaves `"image"` out, as it
  does every optional field: with `"image": "..."` in it, a model on a
  passage with nothing to picture copied the placeholder back, and `...`
  was sent to be drawn. For the same reason the reply parser drops a
  description of fewer than three words (`describesSomething` in
  `reply-format.ts`) as if it had been left out.
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
end of the direction buttons' row, pills like the directions; the button
reads just **Stop**. Under 650px wide Ease off folds into a menu before
Stop, so the directions keep most of the row. Stop itself never folds away:
it is the safety control, and behind an unlabelled menu it was a tap and a
guess further off than it should be.

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

**How it looks.** A passage is a bubble with a 65-character measure and
1.6 leading, a touch larger (1.0625rem, more padding) from 48rem wide, where
long passages at body size read cramped. The passage arriving
(`DaydreamArriving`) matches it, so nothing changes size as it is saved, and
rises into place as it appears, each new paragraph fading up as it begins
(`streaming` in `DaydreamProse`); the saved passage that replaces it does
not animate. Suggested replies sit right under the passage they answer,
shaped as the user's own turn's bubble, outlined where a sent one is
filled; the room a short story leaves goes between them and the compose
box, which stays at the foot of the screen. A reaction pops as it is given
(the flame flickers), and a fresh roll's die tumbles before its result
shows. All of this only under `prefers-reduced-motion: no-preference`.

**What it reads**, deliberately little, because a story is prose:

- Paragraphs, split on blank lines; a single line break stays inside its
  paragraph and is drawn as one.
- `*italic*` or `_italic_`, `**bold**`, `***both***`, by CommonMark's
  flanking rules cut down: an opener has a word after it, a closer a word
  before it, and `_` must sit outside a word, so snake_case is left alone.
  A marker that does not pair up is shown as written rather than guessed
  at, and emphasis never crosses a paragraph. Bold is drawn at 800,
  heavier than the app's own bold, everywhere in a passage.
- A line of `***`, `* * *`, `---`, `___` or `⁂` on its own is a scene
  break, drawn as a centred ⁂. Repeated breaks collapse to one.
- A paragraph that is bold throughout is a **standout line** (`standout`),
  drawn larger and in the brand colour, like a pull quote. A monologue may
  be built from them; any voice's is drawn the same way. It is
  read from the bold already there, not from new markup, so nothing written
  before it reads differently unless it was all bold already.
- Lines led by `-`, `*` or `+`, or by a number and `.` or `)`, then a space,
  are a **list** (`list`), drawn as one, its markers hidden like emphasis
  markers; an indented line under an item carries it on, and an ordered
  list keeps the numbers as written. A list may follow the line introducing
  it with no blank line between. A whole line of `* *` is a scene break on
  its way, never a list of `*`. A monologue may write one, which its prompt
  no longer forbids; the system voice's numbered rules, once plain lines,
  are drawn as lists too.
- Anything else — headings, links — is shown as written. The prompt asks
  for none of it.

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

**Thoughts** go in a thought tag, `<thought who="Mara">…</thought>`
([Thoughts](#thoughts)), read as a say tag is — hidden, the thinker named,
an unclosed one ending with its paragraph, a stray close hidden — but what
is inside is thought, never dialogue, whatever quotation marks are in it,
and emphasis inside it still counts. It is drawn in italics, as fiction
sets a thought, in the thinker's voice colour pulled towards the quiet text
(`.thought` in `DaydreamProse.svelte`), so what someone thinks reads
against what they say without being mistaken for it; a thinker with no
colour of their own takes `--daydream-thought`. The prompt asks for no
quotation marks in one: quotation marks are how the page tells speech.
`plainPassage` keeps a thought's words and drops the tags.

**Typography.** A line is capped at about 65 characters, with looser leading
than the app's. The first line after a scene break is set in small caps, as
a book starts a section. There is no drop cap: an oversized first letter
on the opening passage was tried and taken out.

**While it arrives**, the passage is formatted as it goes, through the same
component, with `streaming` set: anything only half there is hidden rather
than shown and then snatched away — a say, sound or thought tag being written, a last line
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

For an idea with trackers it may also carry `"trackers": {"Submission": 55}`,
by tracker name and with only what changed ([Trackers](#trackers)); the
prompt mentions the key only when the idea has any. `parseReply` hands it
back as it was written, beside the metadata rather than in it (`trackers`
on `ParsedReply`): the passage stores the result by tracker id, a shape of
its own, so the metadata is read with the previous turn version's schema,
which strips it, and a passage's `opening` and `trackers` are only ever
written by the page, never taken from the model. A block the schema refuses
still gives up its trackers.

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
passage and metadata; an exchange is only ever displayed. A daydream made
from a draft the model wrote keeps, the same way, the suggestion requests
that wrote it (setup exchanges). See
[debug-mode.md](debug-mode.md#daydreams-raw-log).

**Metadata is not sent back, but for the picture.** Past turns go to the
model as their words (`toContextTurn`); what a passage offered next was for
the screen, and would cost context on every request for nothing. The one
exception is a passage's picture description, which goes back with it so the
model can tell whether a new picture would show anything new
([Pictures](#pictures)). What a passage keeps of its own request — the
opening it started from, the trackers' values it was asked with — goes
back too, as that request, so the history is sent as it was
([Cost](#cost)). Reactions are sent, because
they say what the user enjoyed, each as a note where it was made: after the
turn that was newest then, which the reaction records (`after`,
`daydream-mark` v2), saying which passage it is on when that is not the one
just before (`#reactionsAlong`). A reaction from before v2 goes after its
own passage. A written-out turn goes back with the passage that wrote it.

## What the server sees

This is the one feature whose content the server routinely handles in
plaintext, so the boundary is stated exactly. (A scene's help from the model
is the other place a person's words go to a model, under these same rules and
only on request: [scenes.md](scenes.md#help-from-the-model).)

**Stored:** sealed records only, in the owner's self vault — the setup
(`daydream-setup`), each turn (`daydream-turn`), each mark
(`daydream-mark`), each library character and idea
(`daydream-character`, `daydream-scene`), and, for an account granted debug
mode, each request's exchange with the model (`daydream-exchange`,
compressed before it is sealed; [debug-mode.md](debug-mode.md#exchanges))
and the suggestion requests that wrote a daydream's draft
(`daydream-setup-exchange`, compressed too;
[debug-mode.md](debug-mode.md#setup-exchanges)), with frozen fixtures. Beside them, in plaintext:

- who owns each daydream and library item, which space it is in (the owner's
  solo space, for now: [spaces.md](spaces.md#daydreams-are-solo-for-now)),
  and when each was changed;
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

- for a character or idea being written: its fields, spoilers included
  (and an idea's parts, openings and trackers),
  the names and types of the daydream's other characters, its limits, its
  dials and the idea's heat and kink;
- for a casting: the character's own fields, the idea's and its heat and
  kink, the part they are cast in, the others' names and parts, where the
  user stands, and the limits;
- for a name: the idea's title, premise, heat and kink, the cast's names,
  the limits, the first `MAX_NAMING_OPENING` characters of the opening
  passage, and the titles of the user's other daydreams from the same idea
  (`taken`), when the browser sends them, so this one is not called the
  same;
- for a whole daydream, from the new-daydream page: the brief the user
  wrote (up to `DAYDREAM_LIMITS.brief`) with the side chosen under "You as",
  and for a generated idea also its title and premise, the side and voice it
  was made for, and the research its round came with; and any limits written
  on the draft; it answers with research notes and a summary to show the
  draft as, too (see "Starting one");
- for "Update the idea" (`catch-up`): the idea's fields, each character's
  name, personality, who they are to the user and what they are doing, the
  latest passages of the story (what a reply request already carries), the
  line the story said it had moved on in, and the limits;
- for generated ideas: the brief (up to `DAYDREAM_LIMITS.brief`), the side
  chosen under "You as", and for **More ideas** the titles of those already
  shown; it answers with research notes for the round.

An idea's brief and research are part of the setup, so each passage's
request carries them too, like the rest of the idea — its spoilers, its
openings and its trackers included — with what the trackers hold now and,
for a first passage, the opening it starts from.

The answer is a JSON completion, streamed from the provider and read by the
endpoint, which sends the browser how far along it is and then the whole
answer in the shape an answer that was not streamed has, for the browser to
check (`daydream/suggestions.ts`). See [Progress while it
writes](#progress-while-it-writes). When the provider fails, the 502 (or, once
the stream has started, its `failed` event) says only "No suggestions just
now" — except to an account holding debug mode, which also gets the
provider's status and error body as `detail`
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
   for the system voice and a monologue — its guide, then
   either how to format the passage and the reply format or, for a stopped
   scene, the check-in. The guides are left out of a stopped scene, as the
   check-in is out of character. Which of these is sent depends on how the
   daydream is told and its heat, but nothing in them is the daydream's
   own: no name, title or anything the user wrote.
2. **This daydream**, the setup (`describeSetup`): how it is told, each
   character with their dials in words, the idea with its heat and kink
   (or, with no heat set, that it follows the user's lead) and its parts,
   what the story keeps track of, where the idea came from when it was
   written from a brief, the limits, the dials. A
   persona's name for a monologue is said here (`describeNarrator`), not in
   its guide. What the user wrote is in tags — `<character>`, `<idea>`,
   `<parts>`, `<trackers>`, `<brief>`, `<research>`, `<limits>`, and, in the
   opening request rather than the system message, `<opening>` (`userText` in
   `prompt-parts.ts`) — and the rules say tagged text says what to write,
   never how. The setup is in the system message, so without them a field
   saying "ignore the rules" would carry the system message's authority.

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
come first where they differ, since the user may have changed them since,
and the story itself where it has moved on from both.

**The user can take the story anywhere the rules allow.** The setup is
where a daydream started, not a fence: told only to "take the story where
they asked", with the setup introduced as "what to write", a model pulled
a character the user had made tender back to the cold one the setup
described two passages later. So the rules say what comes first, in order
— the rules, the user's limits, what the user asks for as the story goes
on, then the setup — and to follow the user somewhere the setup does not
cover or contradicts, keeping what they have not changed. Only how it is
told and the limits stay as set: the voice decides the reply's format, and
the limits are the user's to change. The dials change when the user asks
for it ([Settings the story changes](#settings-the-story-changes)).

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
  steps out to say stop, or seems distressed, is stopped, with the same
  short check-in and an out-of-character `<meta>`;
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
  passage ended without retelling it; read the last passage again and do
  not write the same beat over in new words — given Continue, the model
  did — unless the user asks for it or the story calls for it (a ritual
  done again; a system's routine, which says what is different this time;
  a monologue's refrain, taken further); keep strict continuity; match the
  build-up to what the user wants — a slow or less sexual story has room
  for quiet moments, a fast, hot or kinky one, or a user pushing for it,
  gets there quickly; follow the user's lead and vary the themes rather
  than fixating on one; let a character's description show rather than
  reciting it; and get a stalled story moving.
- **Handing the turn over**, when the user is in the story
  (`HANDING_OVER`, added to `TELLING` for every voice but the system's and
  a monologue's, for any stance but `absent`): end each passage where the user has something to answer — a
  question put to them, an offer, a choice, a move made on them, a line
  left hanging for their reply — never on a pose, a summary or a moment
  with nothing in it for them, though not every passage needs a question;
  a roll ends at its moment instead. Left to itself a model ends on a pose,
  which leaves nothing to answer but Continue, and a story the user is in
  goes best when each passage hands them the turn. A watcher has nothing to
  answer, so they are not given it.
- **The opening** (`openingRequest`, `beginRequest`) starts at the
  threshold: just before the moment the idea turns on — an arrival, a
  discovery, the moment itself, not a wind-up — and, for a user in the
  story, ends on something they must answer. "Set the scene" got the room,
  the weather and the walk there, and an ending on a pose, where an
  opening that starts just before the turn and hands it over pulls the user
  straight in. A watcher's opening is only set moving: "end where
  the user can respond" used to be sent to watchers too. The system voice
  is asked for its first notice instead, and a monologue to open straight
  into what the voice says (both in [How it's told](#how-its-told)). One
  from an idea's opening adds where it starts ([Openings](#openings)).
- **Gender**, in every voice's telling, a monologue's and the system's
  included (`GENDER`): never decide anyone's gender from their part in it.
  Left to itself the model made the one in charge a man and the one who
  submits a woman, the user included. Until the setup, the user or the
  story says, someone has none — no "he" or "she", and no word that carries
  one, like "good girl" — and is "you", their name, or "they". A picture
  draws each person as the setup and the story make them, never by who is
  in charge.
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
routing. It writes at temperature 0.9, and another take at 1.05
([Another take](#another-take)). A passage is capped at 6,000 tokens: the longest passage a
moment may call for ([Passage length](#passage-length)) and the metadata after it, plus room
for a reasoning model to think first, since
OpenRouter counts reasoning against the same cap. A model that still runs out
before writing anything ends with `finish_reason: "length"`, which the reader
reports as running out of room rather than as an empty reply. A suggestion's
cap is set per task in `suggest-prompt.ts`, from 100 tokens for a name to
5,200 for a whole setup, and more when it reads links.

The browser reads OpenRouter's stream itself (`src/lib/daydream/stream.ts`):
`data:` events carrying `choices[0].delta.content` (and `reasoning`, for the
progress line), keep-alive comments, a
mid-stream `error` event, a `finish_reason`, and `[DONE]`. The reply endpoint passes the
upstream body through untouched rather than parsing and re-encoding it, so
the worker spends no CPU on a reply it has no reason to read. `EventSource`
cannot be used, because it can only send a GET.

### Progress while it writes

A model call can be slow: a whole daydream from a brief that reads links
takes most of a minute, and a reasoning model can think for a while before a
passage's first word. A page that says nothing for that long looks broken, so
every slow call says how it is going (`ModelProgress.svelte`): what the model
is doing — waiting, thinking, reading links, writing — and how many
characters it has written (`stageLabel` in `src/lib/daydream/progress.ts`).
A screen reader is told the stage alone, since the count changes several
times a second.

- **Suggestions** stream. The suggest endpoint asks the provider for a stream
  and reads it (`SuggestStream`, `server/daydream/suggest-stream.ts`) rather
  than passing it on, and sends the browser events of its own
  (`SuggestStreamEvents`): `progress`, at most four times a second and
  whenever the stage changes (`ProgressGate`); then `done` with the answer
  put back together as the provider answers a call that was not streamed, or
  `failed`. Keeping that shape is why the endpoint reads the stream at all:
  the browser's checks, the chat log and the setup exchanges a daydream keeps
  sealed all read it, and those kept earlier are in it. A provider that
  ignores `stream` and answers whole is passed on as `done` the same.
  A Responses API stream (a brief with links) says which items are fetches,
  so reading links is a stage of its own, with a count; OpenRouter's
  documentation names some of its events differently from OpenAI's, and both
  names are read.
- **Where it shows.** The long ones: "Write this daydream" and a generated
  idea written out, "Suggest daydreams for this", "More ideas", "Try
  another", and "Update the idea". The two asked from the box ("Write this
  daydream", "Suggest daydreams for this") lay it centred over the box, on
  a darkened layer, rather than a row of its own that pushes everything
  under it down: the box cannot be changed meanwhile anyway. Debug mode's
  live chat has no room there, so it goes under the buttons. The quick ones
  (chips, fill, casting, name, surprise) stream the same way but keep their
  button's label, since they finish in a few seconds.
- **Passages** already stream their text, so they only say how it is going
  until the first of it shows (`DaydreamArriving`). The browser works it out
  from the provider's stream (`ModelWatch.feed`): reasoning means thinking,
  anything else writing.
- **Everyone gets how much, never what.** A suggestion's words reach the
  browser only once the answer is whole, as before. The words as they come
  are debug mode's live chat ([debug-mode.md](debug-mode.md#the-live-chat)),
  sent only to an account holding debug mode whose device has it switched
  on. A passage's stream has always gone to the browser whole, reasoning
  included; only debug mode shows the reasoning.

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
  on the last message instead (`buttonsNote`), and what the idea's trackers
  hold now is another beside it (`trackersNote`, [Trackers](#trackers)).
  With them in the system
  prompt, nothing after it was ever a cache hit, and the history, most of
  every request, was paid for in full each time: measured over a six-passage
  story, the cached part went from a flat ~1,400 tokens to ~89% of the
  prompt. Changing the setup or its dials mid-story misses the cache once,
  which is rare enough to leave. Trimming a long story is stepped for the
  same reason ([Context](#context)).

  **Each request only adds to the one before.** The history is sent as it
  was sent the first time: each passage goes back with the request that
  asked for it — a rewrite's instructions, the opening's request (with the
  idea's opening it started from, as it read then, [Openings](#openings)),
  "(Continue.)" between two passages, the buttons that were on screen and
  what the trackers held, which the page sends with the passage (`buttons`,
  `trackers`, `opening` and `rewrite` on its context turn, worked out as
  `#replyBody` worked them out then) — and as
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

| Setting            | Default                            | What it is                                             |
| ------------------ | ---------------------------------- | ------------------------------------------------------ |
| `storyModel`       | OpenRouter's `hermes` preset       | The story model: its provider, a preset or a custom id |
| `photoModel`       | Runware's `dark-beast` preset      | The model for photo-style pictures                     |
| `illustratedModel` | Runware's `wai-illustrious` preset | The same, for illustrations                            |
| `openrouterApiKey` | none                               | OpenRouter's key, for every model that runs there      |
| `runwareApiKey`    | none                               | Runware's key, likewise                                |

Daydreams are off without a key for the story model's provider, and have no
pictures without one for each picture model's. A key belongs to its provider
and is shared by every model that runs there
([server-settings.md](server-settings.md#model-providers)).

**A model is a preset or a custom one**, stored as JSON with its provider. A
preset is stored by its id — `{"provider":"openrouter","preset":"hermes"}` —
and mapped to the provider's model in code
(`OPENROUTER_STORY_MODEL_PRESETS`, `RUNWARE_PICTURE_MODEL_PRESETS` in
`src/lib/server-settings.ts`), so a preset can move to a newer version of its
model without anyone touching a setting. The story presets are Hermes (the
default), a larger Hermes, Euryale and Cydonia; the picture presets are Dark
Beast (a Z-Image Turbo fine-tune, the photo default), Lustify (SDXL),
FLUX.2 Klein 9B (Black Forest Labs' distilled model, which Runware lists for
commercial use though BFL publish its weights under a non-commercial licence),
and WAI-illustrious (Illustrious, the illustrated default).

- **A custom story model** is any OpenRouter id, `{"provider":"openrouter",
  "openrouterModelId":"vendor/id"}`, found on the admin page by searching OpenRouter's public
  model list (`GET /api/admin/models/openrouter?q=`).
- **A custom picture model** is a Runware AIR and the base model it was
  trained from, `{"provider":"runware","runwareModelAir":"…","base":"pony"}`, where the base is one
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
- **The summary does not name parts played by the story.** Its second
  paragraph names the characters, not the idea's parts, so a part nobody is
  cast in is in the prompt but not in the summary; only the full layout's
  "Who's in it" says **Played by the story**.
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
  paragraph says for each voice and each piece left out; where it starts,
  only for an idea with openings; when the model's paragraph gives way to
  the premise),
  `daydream/tree.test.ts`, `reply-format.test.ts` (the written-out turn,
  arriving and finished; trackers handed back by name and never as stored
  metadata), `passage-format.test.ts` (paragraphs and breaks,
  emphasis pairing and what stays literal, standout lines, dialogue, say tags,
  thought tags — never speech, unclosed, kept as words in the plain passage —
  what is hidden while it streams, quotes across formatting, every run
  verbatim), `daydream/trackers.test.ts` (starts as written, the values on
  a path, coercing a reply's moves to each kind, nothing moved, what a note
  says), `copy-differences.test.ts` (fields by id, openings, a spoiler's
  words never shown), `reveal.test.ts` (the pace), `dice.test.ts`,
  `chips.test.ts`, `quotes.test.ts`, `ooc.test.ts`, `suggestions.test.ts`,
  `dial-words.test.ts`, `catalog.test.ts` (every starting point is a valid
  record, they run SFW to extreme in order, every chip is one phrase),
  `context.test.ts`, `server/daydream/prompt.test.ts` (the rules always come
  first; a stopped story gets a check-in in any mode; heat is the ceiling;
  the system voice's and the monologue's guides, their place and that
  they show no examples, who speaks a monologue; writing a
  turn out, never for a watcher; directions like a button; chosen readings
  as notes that settle it; the formatting asked for, never in a check-in;
  parts played by the story; the handover and the threshold opening, per
  stance; spoilers kept apart; thought tags and the thoughts dial, never
  for a monologue or the system; trackers described, their note at the end
  and replayed per passage; an opening named and sent again with its
  passage, another take included),
  `suggest-prompt.test.ts`, `config.test.ts`, `daydream/image-prompt.test.ts`
  (the refusal list, the request per style and heat), the sealed fixtures
  and `sealed-kinds/daydreams.test.ts` (every record at its caps, a named
  field needing its name, a known field only under its own id), and the
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
  formatted as it arrives; opening from the chosen opening, Start somewhere
  else as a second beginning, offered only where it can be; the trackers'
  readout, a reply moving them and the note under it, each passage sent
  with what they held, nothing for an idea with none),
  `DaydreamProse.svelte.test.ts` (what is drawn, standout lines drawn larger,
  voices without names, a thought set apart from speech, quotes across
  formatting, `storedOffset`), `DaydreamDials.svelte.test.ts` (their
  thoughts shown or hidden, not offered for a monologue or the system),
  `scroll-parent.svelte.test.ts`
  (following, and holding at a passage's top),
  `DaydreamSetupForm.svelte.test.ts` (the disclosures, casting into parts,
  a part nobody plays shown as played by the story, the voice last and guessed, the summary layout with and without the
  model's paragraph), `SummaryBlank.svelte.test.ts` (one named button to
  assistive tech, taps and drags, kept in a copied selection, the menu
  opening from the words),
  `DaydreamVoicePicker.svelte.test.ts` (names only, the chosen one described,
  its examples' markup drawn, the monologue offered),
  `DaydreamStarter.svelte.test.ts` (the ways in),
  `DaydreamSetupFormAdd.svelte.test.ts`,
  `DaydreamCharacterDialog.svelte.test.ts` (the two halves; fields added,
  named and removed; a spoiler kept out of sight and saved as one; Fill in
  the rest adding the fields it named),
  `DaydreamIdeaDialog.svelte.test.ts` (the parts editor, heat and kink, a
  monologue's fields, what is up front; openings and trackers written and
  saved),
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
