# Daydreams

A daydream is a story a user makes up and plays. They choose how it is told,
who is in it, the scene and their limits; the story opens by itself; then
they move it on — by writing, by pressing a button, by rolling a die — and
it answers. The passages are written by a hosted language model, reached
through OpenRouter.

The name is deliberate. Not "bot" or "AI", and not anything that suggests the
characters stand in for a partner: it is more than solo play and less than a
scene with another person.

## Setting it up

`/daydreams/new` and `/daydreams/[id]/edit` (`DaydreamSetupForm.svelte`).

### Starting one

`/daydreams/new` opens on the ways in rather than the form
(`DaydreamStarter.svelte`), friendliest first, because the form asks for
things — a voice, a scene with parts, a cast — that mean nothing until
someone has played one:

- **What do you feel like?** One box, with ideas that toggle into it like a
  field's chips: `SHOWN_IDEA_CHIPS` (three) of `DAYDREAM_IDEA_CHIPS` at a
  time, so they read as a nudge rather than a list to work through, with a
  shuffle button for three others. The page's load makes the first draw
  (`pickIdeas`); drawn while rendering, the server and the browser would
  each draw their own and hydration would disagree. The page keeps the
  current few, so "Other ways to start" comes back to the same ones. **Write it** asks the model for a
  whole daydream (the `daydream` suggestion): a voice, a scene with its parts
  and its heat and kink, and up to `MAX_DAYDREAM_CHARACTERS` characters, each
  cast into a part with who they are in it. Only with suggestions on; without
  them the box is not shown.
- **Pick one.** Ready-made stories (`DAYDREAM_STARTERS` in
  `daydream/starters.ts`), each a scene starting point, a voice preset and
  character starting points cast into the scene's parts, with the casting
  written for that story. In order of heat, each card saying its level, how
  it is told, its kinks and tropes as tags (`tags`), so the harder ones
  can be told apart at a glance, and which side the user is on.

  **You as: Either / Dom / Sub** filters them (`startersFor`). Each story says
  whether the user is the dom, the sub, or neither (`you`); a side's filter
  shows its own stories and the ones with no one in charge. Every story with
  a side has a version from the other side — "Locked" and "The key", "The
  hunt" and "Your hunt" — so both filters have the full range, and the
  catalog keeps sub characters (the eager sub, the pain slut, the fighter,
  the innocent) to cast opposite a dom user. The choice is the page's state,
  like the box and the ideas, so going back keeps it. They are built from the catalog rather than written out again,
  and need no model, so nothing leaves the device.
- **Build it yourself.** The full form, empty.

Both of the first two hand the form a draft, put together by `assembleSetup`
(`daydream/starters.ts`): parts get fresh ids, each person is cast into the
part named for them if it is still free, and a voice that cannot work with
who is in it — watching nobody — gives way to the one that follows them.
Every copy is one with no library record, so each card offers **Save to my
characters** (or scenes) as any such copy does.

A draft opens in the form's **sentence** layout: the setup as one line with
blanks in it — "I want a [steamy] story where I [talk with] [Lady Vale] in
[After hours]." — built by `setupSentence` (`daydream/sentence.ts`), with the
premise and who each character is underneath (`castNotes`). Each blank is the
control for that part of it: the heat a menu of levels, the voice a menu of
the four presets, a character's name their dialog, the scene's title the scene
dialog. "Add someone" and "Anything off the table?" (the limits) sit under it.
**Customise everything** switches the same form to the full layout, so
nothing is lost: it is one superform either way, sharing its dialogs, its
sealing and its submit. For a described daydream, **Try another** asks again
with the same words and with any limits written since, which go into the new
draft and to the model. **Other ways to start** goes back, with what was typed
in the box still there.

The stage is the page's own state, not the URL: a draft is something being
made, and has no business in the browser's history.

**Short by default.** The full layout shows the scene, who is in it, "More
options" (who leads, the limits and the dials) and, last, how it is told, as
one line with **Change**. Nothing is taken away — the same controls are a tap
further in — and on the edit page each disclosure starts open when what it
holds differs from the default (limits written, dials moved, a lead other than
"They lead"), and the voice's picker starts open for a voice no preset gives
or one with a name for the user, so nothing a user customised is ever out of
sight. The character and scene dialogs do the same with "More detail".

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
  others (`third-person`), or no narrator at all: a system — a house's rules,
  a protocol, an institution — giving orders (`impersonal`, "A system" on the
  page).
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

Those four are the presets. **It is asked last, and guessed until then.**
Until the user picks one, the voice follows who is in the story
(`inferVoice`): nobody in it is a story told to you, anyone is talking with
them, and the one-line summary says "Picked from who's in it." Watching and a
system are never guessed, because each changes what the story is rather than
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
compare; one at a time can be tried on. The two settings under "Fine-tune how
it's told" are names only in the same way, and for a combination no preset
gives the panel describes the chosen narrator and stance instead, with the
narrator's example.

A problem with the voice is shown under the presets, outside "Fine-tune", and
in the one-line summary while the picker is closed, so nothing closed ever
hides why the form will not save.
`voiceProblem` refuses what cannot work — no narrator and no character
(nobody speaks), no narrator while watching (the characters would be talking
to no one), watching nothing, a narrator talking to a "you" who is absent, a
persona with no name — and the form disables a choice that could never work
with the other setting, saying why beside it. The setup kind runs the same
check, so a stale page cannot store one. "Who leads" is shown only where it
means something: with characters, and with the user there to be led
(`leadApplies`).

The three narrated voices are ordinary fiction, which the model writes well
from a sentence. The system voice is not: told only to be "an impersonal
authority", the model wrote a narrator describing a hallway, with the rules
mentioned in passing, and every later passage copied that opening. So it gets
a guide of its own (`src/lib/server/daydream/impersonal-voice.ts`): what the
system writes in — notices, numbered rules and amendments, exact
instructions, logged compliance and infractions — what it never does
(describe, feel, praise), and four short examples of the form. The examples
are chosen by the scene's heat: up to Warm (or unset) a tame set, from Steamy
an adult one, because examples steer content as well as form. They are
deliberately unlike each other in how they open, and the guide forbids
reusing their sentences: an earlier set that both began "The following
applies from this moment" had the model open nearly every story with those
words. The system's opening request asks for its first notice rather than
"Set the scene", who leads and the suggestion and button ideas are worded for
a system (Stricter, New rule, Inspection), and its characters are its
functionaries rather than people with decisions of their own.

### Characters and scenes, and the library

Characters and scenes are kept in a per-user library (`daydream_characters`,
`daydream_scenes`, `/daydreams/characters`, `/daydreams/scenes`) and picked
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
  characters** (or scenes) makes a library record from the copy. Setups from
  before the library existed upcast to copies with no source, and land here.

Editing a copied character from a daydream's setup edits the library's too
(the dialog says so), and that daydream's copy follows at once; other
daydreams then see "Updated". Unticking "Save to my characters" keeps the
edit in this daydream only, as a copy with no source — it never claims to
match a record it no longer matches.

### Characters, scenes and casting

A character and a scene are reusable on their own, but who a character is
*in a story* depends on the story. So the two are joined in the daydream, not
in the library:

- **The library character is the actor**: who they are in any story — type,
  personality, how they talk, appearance, what they enjoy, notes, dials. It
  has no relationship to the user, because that changes from one story to the
  next.
- **A scene can list parts** (`ScenePart`: a name like "the interviewer" and
  a few words on it), up to `MAX_DAYDREAM_CHARACTERS`. Parts make a scene a
  plot any fitting character can step into. They are optional: a scene with
  none is cast freely. The user's own part stays the scene's `yourRole`
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
  the scene does not have or one cast twice; the form schema and the setup
  kind both run it.
- **Changing the scene lets go of parts, not words.** Swapping the scene, or
  taking the library's newer version of it, sets the `partId` of anyone in a
  part it no longer has to null and keeps their relationship and part text
  (`fitCastingToScene`). Part ids are stable across a scene's edits, so an
  edited scene keeps its castings.
- **Parts nobody plays are left out of the prompt.** Told about an empty
  part, the model would invent someone to fill it, which the user chose not
  to.

**The model writes the link.** With suggestions on and a scene chosen,
casting a library character from a part's menu asks the model who they are
in this story (the `casting` suggestion, from the actor's fields, the scene,
the part, the others cast and where the user stands), and fills the
casting's empty fields with the answer; the card says "Writing their part…"
meanwhile. That is background work: a failure leaves the fields empty and
says nothing, and "Write their part" in the dialog asks again. Neither ever
writes over something already written.

### Guided, over free text

The character and scene dialogs (`DaydreamCharacterDialog.svelte`,
`DaydreamSceneDialog.svelte`) are guided rather than blank:

- **Starting points** (`CHARACTER_TEMPLATES`, `SCENE_TEMPLATES` in
  `daydream/catalog.ts`), from SFW to filthy and extreme, in that order, each
  saying its level on its button (below). A scene template comes with its
  parts, which get fresh ids each time one is used.
- **Character dials**: a tone (warm, teasing, cold, clinical) and six
  sliders — control, strictness, edge, talk, libido, kink — each of which can
  be left unset. The words for each value are in `daydream/dial-words.ts`,
  shared by the sliders and the prompt, so the screen and the model read the
  same thing.
- **Scene dials**: heat and kink, up front in the scene dialog (below).
- **Chips under every field**: phrases that toggle in the field's text
  (`toggleChip`), leaving whatever else was written exactly as it was. The
  casting's two fields have their own (`CASTING_CHIPS`).
- **Up front, and under "More detail".** A character shows its name, type and
  personality; a scene its title, what is going on and its parts. The rest —
  a character's dials and other fields, a scene's setting, your part, tone
  and notes — is under "More detail", which starts open when any of it is
  filled, and opens when a template, Fill in the rest or Surprise me writes
  into it, so what changed is in view.

### How sexual, and how kinky

Daydreams are for SFW stories and filthy ones alike, and nothing pretends
otherwise: the prompt does not call every story erotic, and it does not shy
away when one is.

- **A scene has heat** (SFW → Flirty → Steamy → Explicit → Filthy) **and
  kink** (Vanilla → Light → Kinky → Heavy → Extreme). They are saved with a
  library scene, set by its starting point, and shown above the other
  dials in the story's Dials popover (the caret of the Settings split
  button, right of Bookmarks; its main half goes to the settings page), so
  they can be turned up or down mid-story. That changes the daydream's copy of the scene only, never the
  library's.
- **A character has libido** (Chaste → Shy → Interested → Horny → Slutty)
  **and kink** (Vanilla → Curious → Kinky → Very kinky → Depraved).
- **Heat is the ceiling.** At SFW nobody acts sexually, whatever their
  libido: a character's libido and kink say how eager they are within the
  scene's heat, never past it (`describeSceneDials`). The user's limits
  outrank all of it, as they outrank everything.
- **Unset says nothing.** With no heat set, the prompt is silent on it and the
  model follows the words, as with every other dial. Setting heat to SFW is
  how a story is made strictly SFW.
- **The starting points say their level** (`sceneLevel`, `characterLevel`):
  "SFW", "Explicit · kinky". Nobody has to guess what they are picking, and
  the range is plain to see, from the snowed-in slow burn to the dungeon.
- **Suggestions match it.** The suggest prompt is given the dials, so chips
  for a SFW scene stay SFW, and Fill in the rest and Surprise me rate a
  scene's heat and kink where the user left them unset — never over ones
  they set (`parseSceneDials` reads the answer leniently, dropping anything
  that is not 1 to 5).

**The free text is the truth.** Every field is plain text the user can
rewrite, chips only edit it, and where a description and the dials
disagree the prompt tells the model to follow the description.

With suggestions on — the disclosure accepted and a key configured — the
model can be asked too: **More ideas** for more chips on one field, **Fill
in the rest** for the empty fields (never over written ones, and parts only
for a scene with none), and **Surprise me** for a whole scene, parts
included, which opens in the scene dialog to read, change, or **Try
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

The idea chips, the ready-made stories, the starting points and the field
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
`daydreamTitle`, which falls back to the scene's title, so an unnamed
daydream is never blank.

Once the story page has an opening passage and nothing is being written,
`DaydreamStory.nameIfUnnamed` sends the scene's title and premise, the cast's
names, the user's limits and the start of the opening (`MAX_NAMING_OPENING`)
as the `name` suggestion, and saves the answer into the setup through the
same path as the dials. The page's heading is told the new name directly
rather than reloading, which would read every turn again.

It is asked at most once per visit, and never retried: a failure says
nothing (the scene's title is still standing in) and the next visit asks
again, and an answer that arrives after the setup gained a name some other
way is dropped. Renaming is the edit page's Name field; clearing it hands the
naming back to the model.

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
  (`currentDirections`). The prompt lists the buttons on screen, has them
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
  wording it was given, sending it written out and storing the same one,
  since a rewrite answers the same turn.
- **The model reads the written-out turn from then on.** Building the
  context (`#contextUpTo`, `toContextTurn`), a user's turn followed on the
  branch by a passage with an `expansion` is sent as the expansion, so the
  story the model reads is the story the user sees.
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
reaction. The server knows only which turn. Quotes are highlighted in the
passage (`highlightSegments`); the bookmarks drawer
(`DaydreamBookmarks.svelte`) lists every bookmark in the tree, and picking
one moves to the branch through it and scrolls there.

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

Typed safewords went because a button does not depend on the model noticing
a word, and is there before anything has to be typed. Setups from v1 had an
optional custom safeword; the v2 upcaster drops it.

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
offers no new buttons or suggestions (the old buttons stay); a bad roll is
dropped and the rest kept; a `<yours>` block never closed is no written-out
turn, and everything after its tag is kept as the passage; a reading that is
not one of the five is no reading.

**The reply as it arrived is kept only for debug mode.** For an account
granted debug mode, a passage also seals the model's reply verbatim, tags and
metadata included, as `raw` (`daydream-turn` v4), for the raw log. What the
page acts on is still the parsed passage and metadata; `raw` is only ever
displayed. See [debug-mode.md](debug-mode.md#daydreams-raw-log).

**Metadata is never sent back.** Past turns go to the model as their words
alone (`toContextTurn`); what a passage offered next was for the screen, and
would cost context on every request for nothing. Reactions are sent, because
they say what the user enjoyed, and so is a written-out turn, in place of the
user's turn it was written from, because it is that turn's words.

## What the server sees

This is the one feature whose content the server handles in plaintext, so
the boundary is stated exactly.

**Stored:** sealed records only, in the owner's self vault — the setup
(`daydream-setup`), each turn (`daydream-turn`), each mark
(`daydream-mark`), and each library character and scene
(`daydream-character`, `daydream-scene`), with frozen fixtures. Beside them,
in plaintext:

- who owns each daydream and library item, and when each was changed;
- each turn's place in the tree (`parent_id`, `position`), when it was
  written, and who wrote it (`user` or `story`) — not what kind of turn it is;
- which turn the user is on (`active_turn_id`);
- which turn each mark is on;
- each library item's `revision`.

**In transit, for each passage:** the browser posts the setup and the recent
turns of the branch being read, as text, to `POST /api/daydreams/[id]/reply`,
which validates them (`replyRequestSchema`), wraps them in its own system
prompt and forwards them to OpenRouter, and the provider that writes the
reply. The reply streams back through the server unread.

**In transit, for each suggestion:** what the suggestion is about goes to
`POST /api/daydreams/suggest`, under the same rules, with a prompt of its
own (`suggest-prompt.ts`):

- for a character or scene being written: its fields (and a scene's parts),
  the names and types of the daydream's other characters, its limits and its
  dials;
- for a casting: the character's own fields, the scene's, the part they are
  cast in, the others' names and parts, where the user stands, and the
  limits;
- for a name: the scene's title and premise, the cast's names, the limits,
  and the first `MAX_NAMING_OPENING` characters of the opening passage;
- for a whole daydream, from the new-daydream page: the sentence the user
  wrote (up to `DAYDREAM_LIMITS.idea`) and any limits written on the draft.

The answer is a small JSON completion, not streamed, passed back unread for
the browser to check (`daydream/suggestions.ts`).

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

`src/lib/server/daydream/prompt.ts` builds what the model reads: the
server's `RULES` first, then the setup (`describeSetup`: how it is told,
each character with their dials in words, the scene with its heat and kink,
the limits, the dials), then how to read the user's turns, then — for the
system voice only — its guide and examples, then either the reply format or,
for a stopped scene, the check-in. The guide goes last before the format
because it is about how to write, and the most recent thing the model reads
is what it acts on; a stopped scene leaves it out, as the check-in is out of
character. The rules are never sent by a browser, so
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

Owning the prompt also keeps the endpoints a daydream's writer rather than a
general-purpose uncensored model anyone with the feature could aim at
anything. The suggest prompt (`SUGGEST_RULES`) holds the same rules for
characters and scenes, and asks for JSON only.

User-side turns go to the model as words: what was written (marked
`[Out of character]` when explicit), and notes in brackets for a direction,
a steer, a roll, a reaction or a safety signal. Notes from buttons pressed
one after another go in as one message, because chat models expect the two
sides to alternate. A conversation ending on a passage gets a "(Continue.)",
and a rewrite a request quoting the passage and what to change.

## The model

`DAYDREAM_MODEL` names an OpenRouter model. The default
(`DEFAULT_DAYDREAM_MODEL` in `server/daydream/config.ts`) is an open-weights
model whose terms, and its providers' on OpenRouter, allow adult fiction.
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
The server refuses anything over the same budget. The setup is always sent
whole, which is why the limits live there and not in the story.

## Cost

Every passage and suggestion is paid for on the server's key. Three things
hold that down:

- **The feature is a grant** (`daydreams` in `src/lib/features.ts`), and every
  load, action and endpoint calls `requireFeature` itself (the API routes
  through `daydreamGuard`).
- **Per-account limits**: 20 passages a minute and 300 a day
  (`DAYDREAM_REPLY_LIMITS`), and, in a scope of their own so that setting up
  never uses up the story, 30 suggestions a minute and 200 a day
  (`DAYDREAM_SUGGEST_LIMITS`). See
  [rate-limiting.md](rate-limiting.md#daydreams-replies). On everywhere, dev
  included.
- **No key, no feature.** Without `OPENROUTER_API_KEY` the pages say
  Daydreams aren't set up on this server, and the endpoints answer 503.

## Configuration

| Variable              | Default                        | What it is                                  |
| --------------------- | ------------------------------ | ------------------------------------------- |
| `OPENROUTER_API_KEY`  | none — Daydreams are off       | The key every passage is paid for on        |
| `DAYDREAM_MODEL`      | `DEFAULT_DAYDREAM_MODEL`       | The OpenRouter model id                     |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Only the e2e suite points it anywhere else  |

Read per request by `readDaydreamConfig`, from `platform.env` on Workers and
the environment elsewhere. `npm run secrets -- <target> --openrouter-key …`
sets the key; it is never generated or asked for.

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
counts as leaving the end).

## Ideas, not built

Noted so they are not lost; none is in the code.

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

- **No escrow without a partner.** A daydream is sealed in the self vault,
  which is recoverable only through a partner and the server
  ([encryption.md](encryption.md#escrow)). Someone with no partner who loses
  every way into their account loses their daydreams and library with it.
- **Edited setups apply forward.** Changing the setup, the dials or a limit
  changes the next passage, not what has already been written.
- **Heat and kink turned mid-story are this daydream's.** The scene in the
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

- Pure: `daydream.test.ts` (every voice combination, casting against a
  scene's parts, the voice guessed from the cast),
  `daydream/starters.test.ts` (every ready-made story is a setup the form
  would save, cast as written; assembling a draft),
  `daydream/sentence.test.ts` (each voice in words, the blanks),
  `daydream/tree.test.ts`, `reply-format.test.ts` (the written-out turn,
  arriving and finished), `dice.test.ts`,
  `chips.test.ts`, `quotes.test.ts`, `ooc.test.ts`, `suggestions.test.ts`,
  `dial-words.test.ts`, `catalog.test.ts` (every starting point is a valid
  record, they run SFW to extreme in order, every chip is one phrase),
  `context.test.ts`, `server/daydream/prompt.test.ts` (the rules always come
  first; a stopped story gets a check-in in any mode; heat is the ceiling;
  the system voice's guide, its place and its examples by heat; writing a
  turn out, never for a watcher; directions like a button; chosen readings
  as notes that settle it),
  `suggest-prompt.test.ts`, `config.test.ts`, the sealed fixtures, and the
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
  kept),
  `DaydreamSetupForm.svelte.test.ts` (the disclosures, casting into parts,
  the voice last and guessed, the sentence layout),
  `DaydreamVoicePicker.svelte.test.ts` (names only, the chosen one described),
  `DaydreamStarter.svelte.test.ts` (the ways in),
  `DaydreamSetupFormAdd.svelte.test.ts`,
  `DaydreamCharacterDialog.svelte.test.ts` (the two halves),
  `DaydreamSceneDialog.svelte.test.ts` (the parts editor, heat and kink),
  `DaydreamBranchMap.svelte.test.ts` (the longest-path trunk, jumping,
  folding).
- End to end: `e2e/daydreams.spec.ts` (a ready-made start through its
  sentence, a described one, and the full form) and `e2e/daydream-heat.spec.ts`,
  against `e2e/model-stub.mjs`, a stand-in OpenRouter that `e2e/server.mjs`
  starts beside the app.
