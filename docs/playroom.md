# The Playroom

The Playroom holds small kink toys that are not sessions, notebook pages or
tasks. Its first, and so far only, tool is the **IQ test**: a dumbification
test built to give a sub a low score and a dom a flattering one.

## The container

- **Registry.** [`src/lib/playroom/tools.ts`](../src/lib/playroom/tools.ts)
  lists the tools: a name, a blurb, an icon and a route id. It is alias-free
  and holds data only.
- **Index.** [`/playroom`](<../src/routes/(auth-required)/(app)/playroom/+page.svelte>)
  is a page in the signed-in app shell that lists the registry. It has no load
  function and no feature flag.
- **Home card.** [`PlayroomWidget`](../src/lib/components/PlayroomWidget.svelte)
  is the Playroom's card on `/home`. Its body is the last IQ result, read by
  `latestIqTestResult` in the home load.
- **No nav tab.** The bottom bar is left alone on purpose. The Playroom is
  reached from the home card.
- **Tools are standalone.** Each tool lives in its own page outside the app
  shell (see below), so it can be shared as a link and used without an
  account. Adding a tool means a registry entry plus a route under
  `(standalone)/playroom/`.

## The standalone shell

[`src/routes/(standalone)/`](<../src/routes/(standalone)/+layout.svelte>) is a
third route group beside `(public)` and `(app)`. It has no header and no nav,
and it turns the app's page texture off. Pages there should not look like
Bound Up: the only nod to the app is a small link in the footer.

### Undoing the app's theme

The root layout still loads `theme.css`, and `<html>` is still `wa-dark`, so
each page undoes the app's look on a wrapper of its own.
[`themes.ts`](../src/lib/playroom/iq-test/themes.ts) does it for the IQ test,
in three parts.

1. **A scheme class on the wrapper.** Light themes use `wa-light`; dark ones
   use `wa-theme-default`. This makes Web Awesome re-declare its semantic
   tokens on the wrapper. Without it they arrive from `<html>` already
   resolved in the app's amber, because a custom property is computed where
   it is declared.

   Dark themes do not use `wa-dark`: `theme.css` re-declares brand, surface
   and neutral tokens on anything with that class, in a later layer, and the
   wrapper came out rust whatever its palette said.
   `.wa-dark .wa-theme-default` gives Web Awesome's dark tokens on an element
   `theme.css` does not name.
2. **Inline custom properties** for the brand and neutral palettes, the fonts
   and the corner rounding. Inline declarations beat every stylesheet, the
   override layer included.
3. **`<html>` and `<body>` backgrounds**, set from an effect, so the
   overscroll area matches the page.

## The IQ test

The test is at `/playroom/iq-test`. It is public: the load returns history
only for a signed-in visitor, and everything else runs in the browser.

### How the page is put together

The [page](<../src/routes/(standalone)/playroom/iq-test/[[id]]/+page.svelte>)
holds the stage (intro, questions, results), the run, the settings and the
setup dialog, and little else. What surrounds the question has a home of its
own:

- [`PornLayout`](../src/lib/components/iq-test/PornLayout.svelte): the frame,
  and the porn around the question in it — the bands or strips, the fill
  below, their sizing, which column is heard, the overload backdrop, and
  where the footer goes (see "Pictures").
- [`MediaDock`](../src/lib/components/iq-test/MediaDock.svelte): the tabs at
  the foot, which panel is open, and the settings tab's slider (see "The
  media dock"). It works from element references and the slider's own drag
  events, never by looking tabs up by test id.
- [`PornFeed`](../src/lib/playroom/iq-test/porn-feed.svelte.ts): the
  pictures and clips for a vibe, with its retries and "New porn".
- [`ResultBook`](../src/lib/playroom/iq-test/result-book.svelte.ts): past
  results, and keeping a new one — to the account, or on the device with a
  signed link — with its retry and deletes.
- The hypno session is derived from the settings (see "Hypno").

"Wide" — porn in bands beside the question rather than strips above and
below — is one media query,
[`wideWindow`](../src/lib/playroom/iq-test/wide-window.svelte.ts), read by
the page and `PornLayout` and handed to the CSS as classes. The CSS has no
breakpoint of its own, and the pixel sizes are worked out from the root's
font size rather than an assumed 16px, so a reader with a larger default font
gets one layout, not half of each.

### Flow

The page has three stages: intro, questions, results.

1. **Setup dialog.** [`SetupDialog`](../src/lib/components/iq-test/SetupDialog.svelte)
   opens at the start of every visit, a dialog over the dimmed page. It is
   the window's full height less a margin, whatever it holds, so options
   coming and going under the slider never resize it and move the slider. It
   holds:
   - the disclaimer;
   - a "Stimulation intensity" slider from None to Max, five
     levels, at most 300px wide and centred
     ([`IntensitySlider`](../src/lib/components/iq-test/IntensitySlider.svelte)). The knob moves freely while
     dragged (a step of 0.01), the level following whichever notch it is
     nearest, so the options under it change as it passes each one; let go
     (Web Awesome's `change`, which a click on the track fires too), it
     springs quickly onto that notch with a slight overshoot, or jumps there with
     reduced motion. The arrow keys and Page Up/Down still move a whole level,
     caught on the host ahead of the slider's own handler. Its notches are
     drawn by us, one per level, since Web Awesome's `with-markers` would put
     one at every hundredth: dots over the track in a stylesheet adopted into
     its shadow root, light on the filled part and dark on the unfilled part,
     where Web Awesome's own (the surface colour) all but vanished;
   - under it, the options that level offers (see "Settings"), all ticked to
     start with. Level 0 offers none. Beside each box — not in its label, where
     a click would tick it — an info button opens a `wa-popover` saying what
     it does, with what a taker sees ticked and unticked, in the real copy
     (`TOGGLE_HELP` in `copy.ts`). The visual ones (the look, porn,
     subliminals) picture both, side by side, at the current level and vibe
     (`exampleSettings`, beside `PagePreview`). Subliminal messaging's photosensitivity warning sits
     on a line of its own under its label, so its info button stays beside
     the label;
   - from level 2 (below it the page is the plain test, with nothing to
     show), beside the options, a bigger picture of the page as the current
     settings would make it, following every change. Where there is no room
     beside them it goes under them in the dialog, and above them in the
     dock's panel, whose order is the dialog's reversed ([`PagePreview`](../src/lib/components/iq-test/PagePreview.svelte)).
     Both pictures are drawn, not screenshots: the vibe's real colours, fonts
     and title, with porn and flashes as abstract tiles, and they ask the
     same helpers the page does (`themeFor`, `showsPorn`, `flashes`,
     `playsBackdrop`), so they cannot disagree with it;
   - from level 1, an optional sober IQ and target IQ, under "More options".
     Level 0 has neither, so it has no "More options" at all.
   Everything but the role is
   [`SettingsFields`](../src/lib/components/iq-test/SettingsFields.svelte),
   which the dock's settings panel shows too. It is controlled: it shows the
   `value` it is given and asks for every change through `onchange`. The
   dialog keeps a draft of its own, applied only when it closes or a role
   starts the test, so the page behind does not change under it; the dock's
   panel changes the page's settings directly. Only the IQ boxes' text is
   its own, since a half-typed "12" is not yet an IQ. Going down a level
   keeps the vibe and the IQs in the settings, so going back up finds them;
   below their levels they are simply not used (`effectiveVibe`,
   `effectiveIqs`).
2. **Starting or closing.** The two role buttons, "I'm a smart dom so I
   understand" and "I'm a dumb sub but even I understand", start the test.
   They are equal, both solid, and sit at the end of the dialog's contents:
   at its foot while everything fits, and below the rest, to be scrolled
   down to, once it does not. They are never pinned over the content. Closing the dialog (the
   X, Escape, or a click on the backdrop) keeps the picks, takes the role
   from last time, and shows the intro, which has its own start button. Until
   a role has been chosen on this device there is no last time, so the
   dialog cannot be closed at all: no X, and its cancelable `wa-hide` is
   refused. Whether one has is `playroom.iq-test.role-chosen` in
   `localStorage`, read on mount; the server's render, which cannot know,
   offers no way out.
3. **Remembered settings.** The last settings are kept in `localStorage`, so
   the dialog opens with them.
4. **First paint.** The server renders the dialog already open, so the page
   is never seen uncovered. Until Web Awesome registers `wa-dialog`, a
   `:not(:defined)` rule draws it as an empty panel over a backdrop in the
   same place. The remembered settings only exist in the browser, so they reach
   the dialog on mount, as a new `initial` it takes up.
5. **Once per visit.** Starting or closing the dialog sets a session cookie,
   `iq-test-dialog-seen`, scoped to the test's path, so a reload in the same
   browser session doesn't ask again. It's a cookie and not storage because the
   server decides whether the first paint is under the dialog, and only a
   cookie reaches it in time. It has no expiry, so a visit after the browser
   has been closed starts with the disclaimer again.
6. **Reloading mid-test.** A reload with no dialog goes straight back to the
   question it was on, with every earlier answer kept (see "Run in progress"
   below). Until storage has been read, the sheet is drawn empty rather than
   as an intro that would flash and vanish.
7. **Back out.** Back on the first question returns to the intro. A run with
   something answered is kept and offered as "Carry on"; an empty one is
   dropped, so the intro offers a fresh start.

### Settings

[`settings.ts`](../src/lib/playroom/iq-test/settings.ts) defines the settings.

**Role.** `dom` or `sub`. This is the only input to the rigging.

**Level** (`intensity`). The slider's five steps, 0 to 4, stored as the
number (in settings, results and share links alike) so levels compare with
`>=`; the labels, which a screen reader hears for each step and the history
lists, are `INTENSITY_LABELS` in
[`copy.ts`](../src/lib/playroom/iq-test/copy.ts). A level does
not impose a look: it offers options, each a checkbox (or the vibe's
dropdown) shown under the slider from that level up, and all on until turned
off. One table in `settings.ts` gives each option's level, and both
`togglesAt` (what the settings show) and the helpers below (what a run does)
read it, so the two cannot drift apart.

| Level | Label                               | Adds                                                      |
| ----- | ----------------------------------- | --------------------------------------------------------- |
| 0     | Standard assessment                 | nothing: an official test throughout                      |
| 1     | Standard assessment, honest debrief | Humiliating results analysis if deserved                  |
| 2     | Mood lighting                       | Theme/Vibe; Visual style matches theme; Question content matches theme; Hypno playing (bambi) |
| 3     | With visual aids                    | Porn displayed at the same time, spaced out; Hypno playing (the rest) |
| 4     | Sensory overload                    | Subliminal messaging, with its photosensitivity warning; the porn packed tight |

**What each option does.** Code never compares levels; it asks a helper,
which checks both that the level offers the option and that it is on:

- `humiliates` — the results mock a sub and flatter a dom. In the vibe's
  words from level 2; at level 1 there is no vibe, so in plain words, and in
  the institute's look.
- `looksThemed` — "Visual style": the vibe's palette and fonts, the page's
  title and tagline, and the intro. Results included.
- `themesQuestions` — "Question content": the vibe's word banks in the
  questions, the teasing line above each one (a sub's only), and the
  enough-for-a-score banner.
- `playsHypno` — "Hypno playing": from level 2 for bambi, whose bambicloud
  hypnos are audio, and from 3 for the rest, whose only hypnos are videos.
- `showsPorn` — "Porn": the columns, the porn tab, and the media feed behind
  them.
- `flashes` — "Subliminal messaging": pictures and taunts flashed over the
  page, ramping up. The taunts are the sub's, in the vibe, whatever the
  question-content box says; the teasing line above the question gives way to
  them.
- `playsBackdrop` — level 4's porn background video. Not a subliminal, so it
  stays when they are off, and goes with the porn.

Every toggle defaults to on in the schema too, so settings remembered before a
toggle existed still parse. Below level 2 there is no vibe even when one is
remembered (`effectiveVibe`): the dropdown keeps the choice for going back
up, but the run never leaks it.

**Vibe.** One of `gooner`, `bambi`, `misogyny`, `denial`, `feminisation` or
`degradation`, from the "Theme/Vibe" dropdown, which shows the chosen one's
description under it. It is required from level 2. The first, gooner, is the
one the dialog starts on.

The bambi vibe is labelled "Bambi & bimbo", but its pictures and copy lean
towards Bambi Sleep — trance, dropping deeper, good girls — without leaning so
far that only her fans would get it.

**`soberIq` / `targetIq`.** Optional numbers. They are compared against in the
results and nothing else. **The target never steers the rigging**, so hitting
it means something.

### The rigging

The rigging has four parts.

1. **Difficulty.** In [`run.ts`](../src/lib/playroom/iq-test/run.ts),
   question `i` of 36 is at difficulty `1 + floor(i × 5 / 36)`. A sub then gets
   +1 on that and a dom −1, clamped to the range 1–5.
2. **Which kinds come up** (`nextKind`). After the first round, where every
   kind is asked once, each kind's chance of coming next is weighted by how
   the taker has done on it, a skip counting as wrong. Rigged down (a sub),
   the weight is `(1 + 2·wrong) / (1 + 2·right)` (a question passes at half
   credit or more; see "Credit"), so they get more of what
   they fail and less of what they pass; rigged up (a dom), its reciprocal.
   The weight is clamped to 0.25–4, so no kind is ever ruled out, only made
   rarer.
3. **The norm.** [`scoring.ts`](../src/lib/playroom/iq-test/scoring.ts) turns
   accuracy into an IQ as `100 + 15 × (accuracy − mean) / sd`. A sub is
   measured against a norm that expects most answers right (mean 0.74); a dom
   against one impressed by under half (mean 0.42). Below the mean a sub's
   spread is narrower (0.1156 rather than 0.15), so nothing right reaches
   their floor of 4 while the top of their range is as it was.
4. **The clocks.** Every question a sub is asked runs against a clock; a
   dom's run against none (see "Clocks").

Further rules:

- Skips count as wrong; unseen questions do not count.
- Accuracy is credit earned over questions attempted, so a tick-all question
  partly right counts in part. The `correct` a result shows and stores is
  that credit rounded.
- The IQ is clamped to 4–160 for a sub and 40–160 for a dom. A real scale
  stops around 40; below it a humiliating run names ever lower made-up
  categories (see "Results"), and a straight-faced one says "Below
  measurable range".

**Nothing ever admits to the rigging**, in any presentation. Results used to
end with a "between you and us" confession; it went because it broke the spell
for the very people the test is meant to please.

### Questions

Questions are dealt from a seeded PRNG
([`random.ts`](../src/lib/playroom/iq-test/random.ts), mulberry32).

- **Dealing.** A run is up to 36 questions (one round of all 18 kinds, then
  18 weighted ones), dealt one at a time as each is
  first reached, because which kind comes next depends on the answers so far
  (see "The rigging"). Every kind appears once before any repeats, and the
  same kind never appears twice in a row.
- **Reproducible from the seed and the answers.** Each slot draws from a
  random source of its own, `mixSeed(seed, slot, …)`, so replaying the same
  answers deals the same run. The seed alone fixes only the first round. It is
  still stored with each result, but the answers are not.
- **Finishing.** A score is offered after 12 attempts, in a banner that can
  be dismissed from the × in its top right corner, which leaves a small
  "Finish early" button in its place. The
  last page, "That's every question", has its own finish button, so the
  banner is not shown there.
- **Moving on.** Answering or skipping goes to the next question after this
  one that is not yet answered: a skipped one, or the first not yet seen. One
  rule covers ordinary progress and working back through skips.
- **Skips.** "Return to skipped" goes to the first skipped question. It is
  beside Back and Skip, on the last page, and in the banner, which also says
  how many were skipped.
- **A skipped memory question is dealt again** when it is returned to: its
  digits, words, pictures or board were on screen once already. Same kind and difficulty, new
  items, still decided by the seed (`variants` on the run counts how many
  times each slot was re-dealt).

Generators live in
[`questions/`](../src/lib/playroom/iq-test/questions/index.ts), one per kind.
Each takes `(rng, difficulty, { vibe })`, and deals an untimed question: a
sub's clock is added by the run (see "Clocks").

| Kind                     | Answer                       | Notes                                                    |
| ------------------------ | ---------------------------- | -------------------------------------------------------- |
| Number series            | choice; typed at 3+          | Arithmetic up to Fibonacci and cubes                     |
| Letter series            | choice                       |                                                          |
| Analogy                  | choice                       | One themed relation per vibe                             |
| Odd one out              | choice                       | Near categories, then primes, at the top                 |
| Vocabulary               | choice                       | Themed entries: clever words for being dumb              |
| Syllogism                | true / false / cannot tell   | Nonsense terms when neutral                              |
| Matrix                   | choice                       | 3×3 shape cells; each attribute follows one rule         |
| Stroop                   | choice                       | "What does it say" (colour blocks) or "what ink" (words) |
| Stroop count             | typed                        | Count words printed in their own colour                  |
| Working memory           | typed                        | Memorise words, do a sum, recall them                    |
| Backwards digit span     | typed                        |                                                          |
| Word problem             | typed                        | Whole-number templates; plain, never props               |
| Synonyms                 | tick all                     | 3–5 synonyms among opposites and made-up words           |
| Mental rotation          | tick all                     | Turns of a shape, not its mirror images                  |
| Visual memory            | tick all, on a board         | A 5×6 board's shaded squares, shown for 4–5 seconds      |
| Anagrams                 | tick all                     | Letter sets that make a word                             |
| Central point            | a board's square             | The square nearest all the marked ones on average        |
| Exposure memory          | tick all                     | Pictures shown one at a time; which were shown           |

**After openpsychometrics.** The last six kinds are the six sections of
openpsychometrics' [Full Scale IQ Test](https://openpsychometrics.org/tests/FSIQ/),
read from its in-browser scripts and resized for one question among many
(theirs are whole sections: eighteen anagrams in a minute, say). Their items
were not copied: the word lists, shapes and pictures are our own.

- **Synonyms**: commoner synonyms first, so harder questions reach the rarer
  ones. Every made-up word was checked against a dictionary when written.
- **Mental rotation**: polyominoes (squares joined edge to edge) chosen so
  every turn differs and no mirror image is a turn, so a flipped one can only
  be told by turning it in the head. From difficulty 3 the shape as shown is
  never itself an answer. Named "Shape A", "Shape B"…: anything more would
  give it away.
- **Anagrams**: everyday words, scrambled afresh and never left in order. The
  non-words were drawn at random and kept only if no dictionary word uses
  exactly their letters, with none holding an S or both an E and a D, which
  the dictionary's missing plurals and past tenses let through ("OSMP" is
  "mops"). When the time is up, what is ticked is the answer.
- **Exposure memory**: emoji, which every device has, need nothing fetched,
  and come with names; 1.5 seconds each at the easiest, 0.6 at the hardest.

**Credit.** Each answer is worth from 0 to 1 (`credit` in
[`questions/index.ts`](../src/lib/playroom/iq-test/questions/index.ts)):

- a choice or a typed answer, right or wrong;
- a tick-all, one point per right tick and one off per wrong one, over the
  number right, never below 0 — as theirs, so guessing does not pay, and
  ticking everything is worth nothing;
- a central point, 1 at a best square, a whole point less for every half a
  square further from the points on average.

A tick-all is answered with Done, and comes back ticked as it was when
returned to; its response is the ticked ids, comma-joined. A central point
answers on the click, like a choice.

**The components.** [`QuestionCard`](../src/lib/components/iq-test/QuestionCard.svelte)
holds the phases and the prompt; each piece is its own component under
[`question/`](../src/lib/components/iq-test/question/): the memorise phase,
the display, and one per answer format (pick one, tick all, a board's
square, typed), not one per kind, since the eighteen kinds share those four.
Choice and tick-all answers share `AnswerCard`.

**Answers.** Every multiple-choice question's answers sit under an
"Answers" heading ("Tick all that apply" for a tick-all, whose ticked cards
also show a tick), each a raised card lettered A, B, C… in its corner (the
letter is hidden from screen readers, so each answer is still named by its
label). A matrix's answers are pieces like the grid's own, and without this
read as more of the board, which is also why the grid is drawn as one joined
board, its missing cell filled in the brand colour, rather than nine tiles.

**Stroop answers.** "What does this word say?" is answered with blocks of
colour, not words, so the word read has to be turned into a colour while the
ink pulls the other way. "What colour is the ink?" keeps word answers.

**Word problems** count ordinary things from the vibe's world, with verbs
that suit them ("Jay has 18 tabs open, opens 9 more, then closes 5"), not
kink props ("the sissy has 18 lipsticks"), which read as cringe. Suggestive at
most. Each cast's phrases are `Countable`s in `words.ts`.

A question with something to memorise goes through phases:

1. `memorise`: the items are shown for a set time, then hidden.
2. An optional `interference` sum, whose answer is not scored.
3. `answer`.

With the subliminals on, a burst of flashes fires as the items disappear,
which is when a distraction costs the most.

**Clocks.** Every question a sub is asked runs against one, and a dom's
against none: the generators deal untimed questions, and the run adds the
clock for a sub (`withClock`, policy in
[`questions/timers.ts`](../src/lib/playroom/iq-test/questions/timers.ts)).
Which clock depends on what hiding the question does:

- **Shown for a while** (`timed`), where looking back at the question is
  how it gets answered: a number or letter series, syllogism statements, a
  matrix, a shape to turn, colour words, a central point's points, and a
  word problem, which is all prompt, so its prompt goes too. After the
  time the question is hidden, keeping its place so the answers below do
  not jump under the pointer, and is answered from memory, with no deadline.
- **Answered in time** (`limit`), where the question is read once and
  looking back gains nothing: an odd one out, an analogy, vocabulary,
  synonyms, anagrams. The deadline is on answering, and running out fails
  it: a tick-all's ticks by then are its answer, and anything else is
  recorded as `TIMED_OUT`, answered and worth nothing — not a skip, so not a
  question to come back to. Returned to with Back, it says so and offers
  nothing to answer, and skipping it leaves it failed.
- **Memory questions** keep only their memorising time, which is already
  the clock, and the question itself.

Each clock is shorter as the difficulty climbs ("What does this word say?",
for one, is 4 seconds at the easiest down to 2; stroop count's follows its
length, a little under a second a word). Like a memorise question, a
skipped one with a shown-for-a-while clock is dealt again when it is
returned to, so going back is not a second look.

**Countdowns** (memorising, and both clocks) show the seconds large,
beside a bar that drains over the whole time, turning to the warning colour
for the last three
([`Countdown`](../src/lib/components/iq-test/Countdown.svelte)). The bar is
a CSS animation rather than stepped each second, which read as a stutter.

### Pictures

Pictures come from
[`/api/playroom/iq-test/media?vibe=`](../src/routes/api/playroom/iq-test/media/+server.ts).

**It is public, but not an open proxy.** The only input is a vibe, and each
vibe maps to a fixed list of sources, `SOURCES` in
[`media.ts`](../src/lib/playroom/iq-test/media.ts). That list is the one place
a tag or a subreddit is named.

**Two sources, one main.**

| Source  | What is fetched                                                | Role     |
| ------- | -------------------------------------------------------------- | -------- |
| Redgifs | a tag search on its API, with a keyless anonymous token        | the main |
| reddit  | a subreddit's `top/.rss?t=week` Atom feed                      | a top-up |

- **Why reddit is only a top-up.** Unauthenticated, reddit allows one feed
  request a minute: `x-ratelimit-remaining: 0` after a single request,
  measured. When reddit was the only source, whichever vibe asked first got
  the minute's request, and denial, feminisation and degradation showed
  nothing. Every vibe now has Redgifs tags with thousands of results each, and
  the API showed no rate limit in use — from a home connection.
- **From Workers, Redgifs is nearly always a 429.** Redgifs is itself behind
  Cloudflare, so every Worker and Durable Object reaches it from one shared
  address, `2a06:98c0:3600::103`, and its search limit is keyed to that
  address, which every other Worker on the internet spends too. Measured
  2026-10-13 from the Worker and from relays in six regions: all refused, with
  delays of 20 to 50 minutes. On Workers a refusal is therefore retried
  through [the tunnel](#the-tunnel-fallback). Its search sends CORS only for
  `www.redgifs.com`, so the browser cannot ask it instead.
- **A token is bound to the address that fetched it.** One fetched from
  anywhere else is a `401 WrongSender`. A 401 drops the token and the search
  is tried once more with a new one at once, which is what keeps a switch to
  the tunnel from costing a request's pictures.
- **`tags=`, not `search_text=`.** The search API accepts `search_text` and
  ignores it, answering every query with the same front page.
- **What is kept.** Redgifs answers give an id (for the player) and a poster
  still on `media.redgifs.com` (shown as an image). Both are checked before
  they go to the browser. From reddit, only `i.redd.it` images and Redgifs
  links are kept: `preview.redd.it` is often dead for NSFW posts.
- **Gone subreddits.** r/degradation and r/humiliation answer 404, so they are
  not in the list.
- **Bambi and gooner are Redgifs only**, like degradation. Every candidate
  subreddit answered 403 when they were added, so none could be checked.
- **Bambi's tags** are hypno, trance and mind-control porn, the bimbo PMVs
  her fans watch, and the few tagged "Bambi Sleep" by name: `Bimbo Hypno`,
  `Mind Control`, `Bimbo PMV`, `Brainwash`, `Trance`, `Bambi Sleep`. Not plain
  `Bambi`, which is mostly performers called Bambi, and not generic `Bimbo`.
  Gooner's are `Gooning`, `PMV` and `Gooner`. Each was checked against the
  search API on 2026-10-11, and the counts are beside them in `media.ts`.
- **Loading.** The browser loads the media straight from Redgifs and reddit.
  Images use `referrerpolicy="no-referrer"`. Clips are covered under "Clips
  and sound" below.

**Caching** happens in
[`playroom-media.ts`](../src/lib/server/playroom-media.ts):

- **Per-isolate.** A module-level cache is safe here: it holds public data,
  not a `db` or `auth`.
- **Per source, not per vibe.** A vibe whose reddit top-up was refused still
  shows its Redgifs pictures, and picks up the reddit ones later.
- **Fresh answers** last an hour. **One fetch per source** runs at a time, and
  a vibe's parallel tag searches share one token request.
- **On a 429** the whole host is left alone until reddit's
  `x-ratelimit-reset` says, or for a minute if it does not say.
- **Failures** are remembered for 5 minutes, and the source's last good answer
  is served meanwhile.
- **An empty answer is never cached** (`no-store`). The page asks again 30s,
  60s and 120s later while the test runs.

**Random on every load.** The page shuffles the feed as it arrives. The
server hands every visitor the same cached order, so without the shuffle every
reload showed the same pictures in the same places.

**Spacing by level.** Level 4 packs the porn: a 0.5rem gap, columns up to
20rem wide, strips 9rem tall. Level 3 shows less of it, bigger, with far more
room around it: a 2.5rem gap, columns up to 40rem, strips 18rem (`pornSpacing` in
[`media-fit.ts`](../src/lib/playroom/iq-test/media-fit.ts)). Below, "the gap"
is the level's.

**Columns.** From 60rem wide, the porn sits in a band either side of the
questions, each as tall as the window and staying put as the questions
scroll; the heading and the footer live in the middle column, so the page
is exactly a window high — nothing to scroll — whenever the question and the
footer fit. A band reaches to a gap from the window's edge, so the outermost
item sits as far from the edge as from its neighbour: as many columns as
that takes, each no wider than the level's widest, sharing the band equally
— so at least about half the widest — and never one running off the edge
(`sideColumns`). Running one off used to cut a picture down one side, with
its buttons off centre; cropping a little to fit is fine, a hard edge is
not. The bands are worked out from the frame's own width, not the window's,
which counts the scrollbar the page does not have. Narrower than 60rem, there is a strip
above the questions and one below, across the whole window, a gap from its
edges and the top one from its top.

**Filling the room below.** Whatever the question leaves before the footer
is filled with more strips, each about a strip's height (`stripRows`): under
the question in the middle column on a wide window, and on a narrow one by
the strip below the question growing, down to the footer. The space is
measured from a box that takes it whatever it holds, so filling it never
changes it, and a question that needs the room simply takes it: the strips
under it drop to none rather than push the footer down.

Each column and strip takes every `stride`th picture and clip from its own
offset, so no two show the same one, and never shows a picture twice at once.

**Places, and moving on.** Each column is a set of places — the clip's, and
one per picture — and each keeps what it has shown
([`MediaPanel`](../src/lib/components/iq-test/MediaPanel.svelte)). A place
moves on to something new from the column's share of the feed when its clip
ends, after 7 seconds on show for a picture, on "New porn" (a reshuffled
feed), and on its own Next button; its Previous button goes back through
what it showed. Each picture keeps its own clock: it counts only while the
picture is on show — not while it is pointed at, still loading, kept, or
while anything in its column is enlarged — and starts again whenever the
picture changes, so one gone forward or back to by hand gets its full time.
A place can be **kept** (locked): the rotation, "New porn" and the end of its
clip pass it by, and its clip loops; its own Next and Previous still work. A
see-through, shadowed lock shows in its corner while the buttons are not up —
deliberately unlike the solid buttons — and gives way to them when they are.

**Swapping without a gap.** What replaces an item loads out of sight while
the old one stays up, and takes its place only once ready — a picture once it
has loaded, a clip once it can play (`ClipPlayer` reports it as `loading`) —
with a bar running along the inside of the item's foot meanwhile. A picture
that will not load is passed over for another, three times running at most:
a host blocked outright would otherwise have it trying every picture in the
feed.

**Filling exactly.** Each column (or strip) is masonry: its items at their
own shapes, stacked, and the column filled to the pixel, never overflowing
its ends ([`MediaPanel`](../src/lib/components/iq-test/MediaPanel.svelte)).
It shows as many items as come nearest to filling it at their natural
lengths — dropping pictures as the window gets shorter (or a strip
narrower), adding them as it grows — and scales them all by one small
factor to fit, cropping a little (`object-fit: cover`) rather than leaving a
gap (`fitCount`). The hypno and the clip always stay; pictures come and go.
Shapes are learnt as each picture and video loads (`load` and
`loadedmetadata`, caught on the way down since they do not bubble), and
guessed until then: 3:4 for a picture, 9:16 for a clip, 16:9 for a PMV.

**Where each is from.** Each picture and clip knows the post it came from
(`origins` on the feed, by URL or `clip:<id>`): a reddit post's title and
page, or for Redgifs its description (else "By" who posted it) and its
watch page. Over a hovered item, above its buttons, the title links there,
in a new tab with no referrer. Being third-party data, a title is reduced
to plain text (reddit's are escaped twice, once by reddit and once by the
feed), and a page is only kept on reddit or Redgifs, never put in an `href`
otherwise.

**The hypno's video**, at the top of the first column, has the same: its
title over its buttons, linking to its page, and a scrub bar.

**A clip's scrub bar.** Along the foot of a clip's buttons, its progress,
which can be dragged to move through it
([`ClipScrubber`](../src/lib/components/iq-test/ClipScrubber.svelte)): a
native range input, following the clip on show and not the next one loading
out of sight. A clip that came only as a reddit link plays in Redgifs' own
player, which the page cannot reach, so its bar is shown but disabled.

**Its buttons.** Over each item, a row of round buttons — Previous, Keep,
Next and Enlarge (the hypno's only Enlarge) — shows while a pointer is over
it, after a tap on it (a touchscreen has no hover; another tap, or one
elsewhere, hides them), or while the keyboard is on one of them
([`ItemToolbar`](../src/lib/components/iq-test/ItemToolbar.svelte), inside
[`EnlargeableItem`](../src/lib/components/iq-test/EnlargeableItem.svelte),
which marks the item `revealed` on a tap).
A click or tap anywhere else on an item does nothing. Until shown they take
no pointer, so the tap that shows them cannot also press one. They are full
size, wrapping onto more rows inside a small item, and shrink only where
even two by two would not fit. Each grows and
takes the brand colour when pointed at, and what it does is said in words
under the row ("Show another picture", "Keep this picture, so it is never
swapped out", and once kept, "Kept: press to let it change again") — from
the button's `data-caption`, else its name. The caption is a popover, in
the top layer, placed by hand under the buttons and kept inside the window:
nothing moves when it appears, and a long one runs past the item's edges
rather than being clipped by the column (which clips its items to round
their corners). It goes as soon as the page scrolls, and is hidden from a
screen reader, which hears the names already. Keep is a native button with `aria-pressed`,
which a wa-button would not forward.

**Enlarging.** Enlarge shows the item big, in place.

- **The same element, made big.** Each item is a popover (`popover="manual"`),
  and opening one lifts it into the top layer without moving it in the DOM, so
  a clip carries on from where it was rather than starting again in a copy.
  Closed, the browser's popover rules (which would hide it) are undone, so it
  sits in its column like anything else.
- **Closing** is Escape, a click outside, or its close button. Not
  `popover="auto"`'s light dismiss, which closed it but let the click carry
  on to whatever was under the backdrop: closing a picture pressed an answer
  or Skip. While one is open, every pointer event outside it is stopped on
  the window, in the capture phase, and the click closes it. Focus goes to
  the close button on opening and back to the item on closing.
- **As big as fits, in its own shape:** the window's width or its height,
  whichever runs out first, the other from the shape read off the picture
  or video as it opens. A fixed height with `object-fit: contain`, as it
  once was, left a narrow window's picture with black bars above and below.
- **The column holds still** while one of its items is enlarged: pictures
  stop rotating, nothing is added or dropped, and a clip that ends loops on
  and moves to the next only once it is put back.
- **The enlarged clip is the one heard,** whichever column it is in; the
  first column's goes quiet meanwhile.

**Sensory overload's backdrop.** Level 4, with porn on, plays one more
clip, muted, filling the window behind everything and dimmed under the page's
own colour so the questions stay readable. It takes a clip no column is
playing.

**New porn.** A button in the porn tab (see "The media dock") swaps
everything on show for other pictures and clips. It reshuffles the feed the
page already has (`shuffleFeed`) rather than fetching again. A vibe's feed is
a hundred or more items, so a new order almost always shows unseen ones, at
once, without spending reddit's one request a minute.

### Clips and sound

Each panel has one clip. The clips have their own volume, the **Clips** slider
and mute toggle, shown during the test whenever a clip with sound is playing.
The hypno has its own as well (see "Hypno" below).

Clips are shown in their own shape, not cropped to a portrait frame. Only the
placeholder and Redgifs' fallback player, which have no shape of their own,
borrow 9:16.

**Playing the file, not the player.** Redgifs' embedded player can't be
controlled from outside: its code listens for no messages and reads no
settings from its URL. So
[`ClipPlayer`](../src/lib/components/iq-test/ClipPlayer.svelte) plays the
clip's SD MP4 itself.

- **No referrer.** Redgifs refuses its files to a request carrying another
  site's `Referer`: a 403 with one, a 206 without. `Origin` alone is fine, and
  its CORS headers allow any origin. A `<video>` can't drop its referrer, so
  the file is fetched with `referrerPolicy: 'no-referrer'` and played from a
  blob URL.
- **Not a page-wide referrer policy.** Setting `no-referrer` for the whole
  document would also blank `Origin` on same-origin POSTs and fail SvelteKit's
  CSRF check, and it would outlive the page on client-side navigation.

**Paused when it should play.** A clip that can play but is not playing —
autoplay refused (a phone in low-power mode, a browser setting), or paused
by the browser — is covered by a big play button, which starts it and goes
once it is playing. A pause at the clip's end does not count: it loops
straight back round. The background has none, sitting behind the page where
it cannot be clicked. The button sits over the column's "enlarge" button, so
a click on it plays rather than enlarges.

**The fallback.** None of this is how Redgifs means its files to be used, and
it could stop working without notice. Redgifs' own developer wiki, which
described signed, IP-bound links, has since been taken down. So if the fetch
fails, or the file won't play, the clip switches to Redgifs' own player, which
has a sound button of its own. When every clip has fallen back, the slider
hides, since there's nothing left for it to reach. Losing the global volume is
the whole cost.

**The volume** lives in
[`sound.svelte.ts`](../src/lib/playroom/iq-test/sound.svelte.ts):

- **Two channels,** `clips` and `hypno`, sharing one `AudioContext`.
  A PMVHaven hypno, which has no CORS, is on the `hypno` channel without
  going through Web Audio: the channel sets its element's own `volume`. Each has
  its own gain node, level, mute state and remembered level, so the two can be
  balanced or silenced independently.
- **Web Audio, not `video.volume`.** iOS Safari ignores `video.volume`: it's
  read-only there and always 1. Each audible element is routed into its
  channel's gain node, and the slider sets the gain.
- **One clip with sound at a time.** Only the first panel's clip can be heard;
  the other stays muted, because two soundtracks at once is just noise.
- **Every load starts muted, until the start.** The intro has a "Sound on"
  box whenever the settings have a hypno or porn, ticked to start with — so a
  start from the setup dialog's role buttons, which have none, has sound too.
  Starting the test with it ticked turns on the hypno's and the clips'
  sound, inside that click, since a browser lets sound start only from a
  gesture; unticked, both stay muted until their toggles or sliders. Until
  then, the slider shows zero, and the mute toggle beside it is pressed. This holds whatever volume was used last time:
  restoring it on load once left the slider showing full volume over silent
  clips, because a browser won't start sound before a gesture.
- **Mute toggle and level, kept apart.** The level is remembered in
  `localStorage`; muted is not, and starts true on every load. The toggle
  unmutes to the remembered level, or 50% if none was ever set. Dragging the
  slider above zero unmutes; dragging it to zero mutes and keeps the level, so
  the toggle doesn't bring back silence.
- **Gestures start the sound.** Both ways of unmuting are user gestures, which
  is when Web Audio is allowed to start.

**One clip after another.** Each clip plays once, then its panel moves to the
next.

- **Looping by hand, not `loop`.** An element with `loop` never fires
  `ended`. So the loop is done by hand, and the next clip is asked for once per
  file rather than once per time round.
- **Never blank.** The current clip keeps looping while the next downloads,
  and while it loads in a hidden video of its own over the current one. It
  takes over only once it can play (`canplay`), and the old one goes. Swapping
  the file in one element instead left a moment of nothing while it decoded.
  The same holds for New porn and the overload backdrop.
- **Timed fallback.** A clip in Redgifs' player can't report that it ended, so
  it moves on after 45 seconds.
- **No overlap.** The two panels take alternate clips from the feed, so they
  never show the same one.
- **Playable clips first.** Clips the page can play itself are preferred. One
  known only from a reddit link has no file, so it would sit in Redgifs'
  player, out of the volume's reach; those are used only when nothing playable
  is left.

**Data.** Clips are SD files, a few MB each, and each panel downloads one at a
time. Short clips mean more downloads: a 5-second clip is followed by the next
after 5 seconds.

### Hypno

A hypno plays alongside the test for every vibe, unless "Hypno playing" is
turned off (`playsHypno` in
[`settings.ts`](../src/lib/playroom/iq-test/settings.ts)). Its categories
(bambicloud's) default to music for a run without porn and to loops and
subliminals for one with it (`categoryTier`).

| Vibe            | From             | Source                  | Plays as                     |
| --------------- | ---------------- | ----------------------- | ---------------------------- |
| bambi           | Level 2 up       | bambicloud, or PMVHaven | audio, or video (switch)     |
| every other one | Level 3 up       | PMVHaven                | video, among the porn videos |

The others start at level 3 because their only hypnos are videos, which
belong with the porn. With the porn turned off, a video hypno plays on unseen,
for its sound. Bambi plays from bambicloud unless the taker switches
it, in the hypno panel ("Hypnos from"); the choice is remembered on the
device. Both sources make files of one shape (`HypnoFile`), so the session,
the dock and the drawer treat them alike.

#### PMVHaven

[PMVHaven](https://pmvhaven.com) hosts porn music videos, many of them hypno:
fast cuts, music, often a voice-over. Read off the site and measured on
2026-10-12, in [`pmv.ts`](../src/lib/playroom/iq-test/pmv.ts):

- **Its search pages, not its API.** It has a JSON API, but its robots.txt
  disallows `/api/`. `/search?q=` is allowed and server-rendered, with the
  results in the page's `__NUXT_DATA__` payload, which is what is read.
- **Searches per vibe** (`PMV_QUERIES`): gooning encouragement for gooner,
  Bambi and bimbo hypno for bambi, sissy hypno led by DeepSlutPuppy for
  feminisation, chastity and tease-and-denial for denial, and so on. Each
  gave a page of on-theme results.
- **The file.** A result has no file URL, only its HLS playlist, so the file
  is read from the video's own page (allowed too) when it is picked: once per
  video per isolate, kept a month by the relay, and only for a video already
  in the index, so nothing a visitor sends picks a page to fetch. A newer
  video's playlist sits in a folder named like an MP4, but that is the name it
  was uploaded under, not always its file's: guessing the file from it gave a
  403 for 4 of 29 videos measured on 2026-10-13, so it is not guessed.
- **Not HLS.** The playlists and segments send no CORS header either, and a
  JavaScript HLS player (hls.js, video.js) has to fetch them, so it would be
  refused everywhere but Safari, which plays the MP4 anyway.
- **No CORS.** The bucket serves MP4s with range requests and no referrer
  check, but no CORS header. So a video plays in a plain element without
  `crossorigin` (asking for CORS would refuse it), outside Web Audio, and its
  volume is the element's own (`registerDirect` in the sound module). On iOS
  that means mute only.
- **Voice-overs first.** A random pick favours a video PMVHaven flags as
  having a voice-over, three to one: talking is what makes it a hypno.
- **No content filter.** PMVHaven flags gay, trans and extreme content; none of
  it is filtered out.
- **Refuses Australia.** PMVHaven answers a request from an Australian
  address with `451 Not available in Australia`. A Worker's subrequests leave
  from the data centre that took the visitor's request, so for every visitor
  in Australia the index came back empty. On Workers its pages are therefore
  fetched through the [porn relay](#the-porn-relay); the MP4s themselves are
  not, since the browser loads those straight from the bucket.

[`playroom-pmv.ts`](../src/lib/server/playroom-pmv.ts) caches each vibe's
index per isolate for six hours, like bambicloud's.
[`/api/playroom/iq-test/pmvs?vibe=`](../src/routes/api/playroom/iq-test/pmvs/+server.ts)
searches it or picks at random, in the same shape as `/hypnos`; its
"triggers" are PMVHaven's tags, and it has no categories.

#### The porn relay

[`porn-relay/`](../src/lib/server/porn-relay/) is a Durable Object,
`PornRelay`. A Durable Object runs where it was first made, and its
subrequests leave from there, so a page fetched through it is fetched from
there whoever asked. `relayedFetch()` returns a `fetch` that sends URLs on a
relayed host through it and anything else straight out; the PMVHaven
endpoints pass it to `pmvIndex` and `withMedia` in place of the request's own.

- **Several regions, tried in turn.** A location hint names a region, not a
  country. Measured on 2026-10-13, the first `weur` object landed in France,
  which PMVHaven refuses too, while fresh objects in every other region but
  `oc` (Australia) and `afr` (also France) got through. So `RELAY_LOCATIONS`
  is a list, one object per region named after it, and a `451` moves on to the
  next. An isolate remembers the one that answered, so it pays for a refusal
  at most once.
- **A cache every isolate shares.** The object keeps each `200` it fetched in
  its own SQLite storage for as long as the caller's `x-relay-max-age` says:
  six hours for a search page (an index's lifetime), a month for a video page,
  whose file never changes. Without the header nothing is kept, and a failure
  never is. Each isolate still keeps its own index in front of it, so the
  relay is asked only when an isolate is cold; the cache is what makes a cold
  isolate cheap. Expired rows are swept on every write.
- **Only for sites that need it.** `RELAYED_HOSTS` in `hosts.ts` lists them,
  by exact hostname (only `pmvhaven.com` today). Every relayed request is a
  billed Durable Object request and a trip abroad, so a site that serves
  everyone stays off the list.
- **Not an open proxy.** The object passes on only a GET to an https URL on a
  listed host, with only `user-agent` and `accept`, and follows no redirects.
  Anything else is a 403 and no request. The callers build every URL from
  fixed searches and ids already in their index, so this is the second fence.
- **A refusal is logged.** `playroom-pmv.ts` logs a search that fails, status
  included: an empty index otherwise looks exactly like a quiet PMVHaven,
  which is how the 451 went unnoticed.
- **Workers only.** `vite dev` and the self-hosted build fetch directly from
  wherever they run, so a server in Australia is refused there too.

#### The tunnel fallback

[`porn-relay/tunnel.ts`](../src/lib/server/porn-relay/tunnel.ts) is the last
way out: a Cloudflare Tunnel to darcy, a machine of our own, reached through a
Workers VPC service per host (`TUNNEL_REDGIFS`, `TUNNEL_PMVHAVEN` in
`wrangler.jsonc`). A request through it leaves from darcy's own address, which
is what Redgifs answers when it refuses Cloudflare's shared one.

- **A fallback, not the route.** darcy is one machine that can be off, and
  everything through it spends its allowance. A request goes the usual way
  first (straight out for Redgifs, through the relay for PMVHaven), and only a
  403, 429 or 451, or a thrown fetch, sends it through the tunnel.
- **Sticky for 30 minutes.** A host that fell back stays on the tunnel for
  that long, per isolate, because a Redgifs token only works from the address
  that fetched it: token and searches must share a route. If the tunnel fails
  while holding a host, the host goes back to the usual route.
- **Down is not broken.** With darcy off, a request answers as it would have
  without the tunnel: the usual route's refusal, which the caches above
  already handle.
- **A host needs a service of its own.** `npx wrangler vpc service create
  <name> --type http --tunnel-id <darcy's tunnel id> --hostname <host>
  --https-port 443`, then a `vpc_services` entry, top level and `previews`
  both, and a line in `TUNNELLED_HOSTS`. Note the tunnel's id is not its
  connector's: `cloudflared` on darcy logs both, and only the tunnel's is
  accepted.
- **Workers only**, like the relay: dev and the self-hosted build send from
  their own address and need none of it.

**Among the porn.**
[`HypnoVideo`](../src/lib/components/iq-test/HypnoVideo.svelte) is shown as
one of the porn videos, at the top of the first column, and can be enlarged
like them. Where there are no columns (no porn, the intro, the
results) it plays on out of sight, for its sound. It is one element, moved
between the column and its hidden home by
[`hypno-video-host.ts`](../src/lib/playroom/iq-test/hypno-video-host.ts)
rather than remade, so it never starts the track again: a media element only
pauses if it is still out of the document once the task that removed it is
over, and every move is synchronous.

#### bambicloud

Files come from [bambicloud.com](https://bambicloud.com). Its
API is undocumented, so everything below was read off its own web app and
measured.

- **`GET https://api.bambicloud.com/files`** lists files with no account.
  `showLocked=false` drops the Patreon-locked ones, leaving about 750 of 1,277.
  Pages are at most 50, and `pageOffset` is an item offset.
- **Its `fileTypes` filter answers 500,** and it has no random sort.
- **The audio CDN** (`cdn.bambicloud.com`) streams with range requests, checks
  no referrer, and sends `Access-Control-Allow-Origin: *`. That last header is
  what lets the page route a file through its own volume.

**The index.** [`playroom-hypno.ts`](../src/lib/server/playroom-hypno.ts)
builds an index of every playable file: about 15 pages, 3 at a time, cached
per isolate for 6 hours, keeping the last good copy for 5 minutes after a
failed rebuild. A whole index rather than a query per request, because it
gives:

- category filtering, despite their broken filter;
- a true random pick within a category;
- instant search.

[`/api/playroom/iq-test/hypnos`](../src/routes/api/playroom/iq-test/hypnos/+server.ts)
searches it: `q`, `categories`, `trigger`, `maxMinutes`, `limit` (at most 50),
or `random=1` with `exclude`. Every input filters an index this server built,
so nothing a visitor sends reaches bambicloud. `parseFilesPage` keeps only
files with a real UUID and an audio file on bambicloud's own CDN.

**What plays.**

- **Random, from categories.** The pick is random from the session's filter.
  It defaults to **music** (`music`, `ai music`) in a run without porn, and
  to **loops and subliminals** in one with it. The drawer can widen or narrow it, and
  the choice is remembered on the device per tier (`categoryTier`: mood or
  porn), so tightening one doesn't change the other.
- **Next.** When a file ends, the next is picked at random, never the same
  file twice in a row.
- **Failures.** A file that won't play is skipped. After 3 in a row the player
  stops, and says in the console that `cdn.bambicloud.com` may be blocked.

**Playing it.**
[`HypnoSession`](../src/lib/playroom/iq-test/hypno-session.svelte.ts) holds
what is playing and its filter. One hidden `<audio crossorigin="anonymous">`
([`HypnoPlayer`](../src/lib/components/iq-test/HypnoPlayer.svelte)) plays it
on the `hypno` channel. Browsers only start sound inside a gesture, so:

- **The session is derived from the settings:** a key of the source,
  PMVHaven's vibe or bambicloud's tier, and a new session whenever the key
  changes. Derived rather than made by hand at each change, so no change can
  forget it; and since a derived is worked out the moment it is read, the
  session for new settings exists inside the click that set them, where
  `startFromGesture()` is called. None is made before storage is read, nor
  for someone else's result opened by its link.
- **The first pick is fetched early,** as soon as the settings call for a
  hypno, before the test starts.
- **The start click** unmutes the hypno channel and plays it, inside that
  click — with "Sound on" ticked (see "Clips and sound"). Unticked, it
  starts muted and paused, as after a reload.
- **A reload mid-test** has no click, so it waits, muted and paused, until the
  toggle or slider is used.
- **Zero volume pauses it.** Muted, or the slider at zero, pauses the file
  rather than letting it run down unheard. Turning it up resumes it where it
  was. The sound module does both synchronously inside the tap or drag
  (`data-pause-when-silent` and `data-wants-play` on the element), because
  that's the only moment a browser lets audio start again.

**The controls** are the hypno tab of the media dock (below). Its icon is a
spiral, drawn by [`SpiralIcon`](../src/lib/components/iq-test/SpiralIcon.svelte)
because Font Awesome has none.

- **The tab** shows what's playing, the time left, the volume and Next, as
  much of each as fits.
- **Its panel** is headed by the track name, a size up and linked to its
  bambicloud page for credit, with "by" its author under it and the time on
  the right. Below that are the volume and Next, plus:
  - **Pause / Play**, which is the mute toggle under another name: muted is
    paused (see "Zero volume pauses it");
  - **Select**, a disclosure that opens
    [`HypnoBrowser`](../src/lib/components/iq-test/HypnoBrowser.svelte) below
    the header: a search box, category chips, trigger chips, a length filter,
    results with their warnings, and Random from these. It scrolls with the
    rest of the panel's content, under the header. Choosing one plays it and leaves the list open; the one
    playing is marked "Playing" in place of its Play button. Each title links
    to the file's page on bambicloud or PMVHaven, in a new tab.
- **The tab stays once started,** through the results and a start-over, so
  the hypno can always be stopped.

### The media dock

The hypno's and the porn's controls sit in a dock fixed to the foot of the
window, a tab each, side by side
([`MediaTab`](../src/lib/components/iq-test/MediaTab.svelte)), with a third
for the settings. The page is padded underneath it, so the last
of the page is never hidden behind it.

- **Each tab shows what fits in its share of the dock.** A tab is as wide as
  its contents, so it cannot measure its own room: the page measures the
  dock, shares it out, and picks a `TabLayout` for each
  ([`dock.ts`](../src/lib/playroom/iq-test/dock.ts)). Widest first: the full
  title; a one-word title; the action (Next, New porn) as an icon
  rather than a labelled button; no slider and only the time left; no title;
  and at the last only the icon, the mute toggle and the "more" button. The
  thresholds are the widths measured in Chromium, and are in `dock.ts`.
- **No "more" when there is nothing more.** The porn tab, once its labelled
  New porn and (if a clip has sound) its slider both fit, shows everything its
  panel would, so it has no panel to open.
- **Expanding turns the tab into its panel.** The tab's own controls become
  the panel's header, in full, with the collapse button in its top-right
  corner, and the rest below. The panel is centred over the whole dock, up
  to 48rem wide, standing on its foot and on top of the other tabs rather
  than taking room from them: they keep their layouts and places
  underneath. The tab's bar stays in the row while it is up, unseen and
  `inert`, so nothing beside it moves.
- **The header stays put.** However long the panel, its header (the title
  line and the controls) stays at the top, and only what is below it scrolls,
  as one: the settings, or the hypno source and the list of hypnos. A panel
  whose content renders nothing (the hypno's, for a vibe with one source and
  the list put away) shows no content area at all: it is hidden while
  `:empty`, which ignores Svelte's comment anchors.
- **Sliders sit level with the row around them.** Web Awesome leaves room
  above a slider's track for its label, which these hide, and that put the
  track below the middle of the bar; the volume and intensity sliders take
  that room back (`::part(slider)`).
- **Every collapsed tab is the same height (49px) at every width:** every
  control in a bar is at most 2rem tall — buttons, labelled or icon, the
  mute toggle, the chevron, and the title over its detail. At Web Awesome's
  small size a button was 38px against the others' 32, which made a tab
  showing a labelled action (Next, New porn), or the settings tab with its
  icon action, taller than the rest.
- **A click on the header collapses it,** anywhere that is not a control of
  its own, as a click on the bar opens it.
- **The change is animated** as one box: the panel grows out of the tab's
  place to its own, its position, width and height all running from the
  bar's box to its own (a Svelte transition, so it shrinks back into the bar
  when put away too), with its contents fading in behind. Position and size
  rather than a transform, which would squash the text on the way.
  Animating `flex-grow`, as it once did, shrank a closing panel to the bar's
  height and then jumped to the bar's width. A bar that steps up or down as
  the dock's room changes is animated the same way, by measuring before and
  after.
- **A click on the bar opens it.** Anywhere on a collapsed tab that is not a
  control of its own (its icon, its title, the gaps) does what its chevron
  does. The chevron stays the control the keyboard and a screen reader reach;
  the bar's click is a bigger target for a pointer.
- **One panel at a time,** and a click anywhere outside it puts it away
  (except inside a dialog).
- **A disclosure, not tabs.** The "more" button is a native button with
  `aria-expanded` and `aria-controls`, and each tab and panel is a named
  region, rather than ARIA tabs: there is no single selected tab, and both
  tabs stay usable at once.
- **Sound in the porn tab** appears only when a clip with sound is playing as
  the page's own video.
- **The settings tab** is there during the questions only: the intro has its
  own Settings button, and the results only show it in fullscreen (below).
  It opens the same settings as the setup dialog, bar the role, and applies a
  change at once: the look and the pictures change, the
  settings are remembered, and questions not yet dealt are dealt under them.
  A change to how questions are worded (the vibe, or "Question content
  matches theme") deals every question not yet answered again in the new
  wording, the one on screen included (`withSettings`); answered ones stay
  as they were. On the results there is nothing
  left to set, so the tab is shown only in fullscreen, as the way back out,
  with no panel to open. Its order is the dialog's reversed (`sliderLast`):
  "More options", then the options the slider brings in (themselves in reverse,
  the vibe's dropdown staying with its two boxes), then the slider. Reversed
  in the markup, not with CSS, so keyboard order matches what is seen.
  The panel stands on the foot of the window and grows upwards, so with
  nothing that comes and goes below the slider, options appearing leave it
  where it was under the pointer, rather than pushing it out from under it.
  Once there are more than fit, the panel's content scrolls from its end
  (`scrollAnchor="bottom"` on `MediaTab`): it keeps its distance from the
  bottom as it grows or shrinks, so new options scroll in above the slider
  instead of pushing it down out of view. The scroller's own box does not
  change when its content does, so its children are watched for size.
- **The settings tab's own action is fullscreen:** a button in the bar,
  labelled or an icon, and a labelled button in the middle of its panel's
  first row, beside the title (`actionInHead` on `MediaTab`), since it is the
  panel's only control of that kind. Whether the bar's is labelled matches the
  media tabs' actions (Next, New porn): all labelled or all icons.
- **With room to spare, the intensity slider is in the settings tab's bar**
  too (`IntensitySlider`'s `compact`, through `MediaTab`'s `barExtra`), with
  rising bars beside it as the volume sliders have their speaker. As the
  window narrows the settings tab sheds in order: the fullscreen button's
  label first (and the media tabs' labels with it, to match), then the
  slider, leaving the icon button. Each only while every media tab still has
  its widest layout beside it, so neither is at the media tabs' expense
  (`dockLayouts`). On the results, where there is no slider, the button is
  labelled whenever every action fits labelled. Dragging it can
  bring the hypno and porn tabs in or take them out, and the tabs are
  centred, so while it is dragged the tab is held where it was (a
  `translate` making up the difference each frame) and the tabs' layouts are
  held too, so the slider is never taken away for want of room; let go,
  everything catches up and the tab glides to its place. The slider says
  when a drag starts and ends (`ondrag`), and `MediaDock` holds the tab by
  its element reference.
- **Fullscreen** is offered in two places: there, and on the intro, as a
  box at the left of its row, the buttons on the right, "Open in full
  screen for maximum focus". The box is ticked exactly while the page is
  fullscreen: ticking it goes fullscreen at once (the change is a gesture,
  which a browser grants fullscreen to), unticking it leaves, and leaving
  any other way unticks it. It is not remembered: it says what is, not
  what to do later. The setup dialog has no fullscreen control. Both are offered only where
  `document.fullscreenEnabled` says so, which leaves out an iPhone's Safari,
  and share
  [`fullscreen.svelte.ts`](../src/lib/playroom/iq-test/fullscreen.svelte.ts),
  which follows `fullscreenchange`, so Escape and the browser's own exit read
  the same.

### Diagnostics

When pictures don't appear, the console says why. Everything about media is
logged under `[IQ test media]` by
[`media-log.ts`](../src/lib/playroom/iq-test/media-log.ts):

- **The feed:** what the server found, by host and kind ("105 from
  media.redgifs.com, 9 from i.redd.it"), and when it is retrying.
- **Each picture that fails to load,** with its URL, so it can be opened
  directly in the same browser.
- **A blocked host.** Once four pictures from one host have failed and none
  has loaded, one summary names the host as probably blocked by a content
  blocker, tracking protection or a DNS filter. A browser refusing a host
  looks like nothing at all from inside the page, so this is the only signal.
- **Each clip that falls back to Redgifs' player,** with the browser's own
  reason: the HTTP status, or the fetch error (Firefox:
  `TypeError: NetworkError when attempting to fetch resource.`), or the video
  element's `MediaError`.

Progress is `console.info` and failures are `console.warn`. The e2e fixture
fails a run on any warning, and its stubbed empty feed is a normal case, not a
failure.

**Without pictures.** The page works without them. With an empty feed,
overload flashes are colour and taunt only. A failed feed request shows no
notice, because it is decoration nobody is waiting on.

**Flashing.** The setup dialog warns about flashing before overload can be
chosen. Under `prefers-reduced-motion`, flashes come half as often and fade
instead of cutting.

### Testing aid

An account holding the `iqTestAnswerButton` feature, granted from `/admin`,
gets a "Correct answer" button at the top of each question. It answers the
question on screen with its stored answer, skipping any memorise phase.

It sits directly under the progress line, above the "enough for a score"
banner, the taunt and the question, which all come and go or change height
between questions. So it stays in one place on screen, and a run can be tapped
through without moving a finger. A Playwright test checks the button's
position on every question of a run.

### Results

[`analysis.ts`](../src/lib/playroom/iq-test/analysis.ts) builds the results.

**The headline** depends on the run:

- **Not humiliating** (level 0, or the box off): "Full Scale IQ: N".
- **Humiliating, sub:** a line per vibe that mocks the score; at level 1, with
  no vibe, a plain one.
- **Humiliating, dom:** a flattering line.

**What else is shown:**

- a Wechsler-style classification ("Average", "Extremely low"), right under
  the number and as big, in every presentation. Below 40, where only a sub
  can go and a real scale stops, a humiliating run carries on in the same
  official voice, each band more degrading: Severely impaired (35),
  Profoundly impaired (30), Cognitively negligible (25), Functionally
  mindless (20), Decorative only (15), Vegetative (10), Sub-vegetative (5),
  and Inanimate object at the floor. A straight-faced run says "Below
  measurable range". The curve's axis runs on, flat, out to such a score;
- the percentile, on a normal curve, whose marker runs from the dot down;
- for a sub in a humiliating run that skipped questions, a line mocking them
  for it (`skipLine`, per vibe, or plain at level 1). A dom is not mocked; a
  plain report notes the skips among its facts;
- an "as smart as…" comparison, themed per vibe below 100 (plain at level 1);
- the sober and target deltas.

**Score-driven layout.** How much the page says depends on the score, in every
presentation:

| IQ        | Simplicity    | What is shown                                    |
| --------- | ------------- | ------------------------------------------------ |
| 85 and up | `full`        | Report-style facts                               |
| 70–84     | `simple`      | No facts, bigger number                          |
| below 70  | `very-simple` | Huge number, short sentences in big type         |

Below 85, the bell curve gets an explainer.

### History and storage

**Each result has its own page,** `/playroom/iq-test/<id>`
(`[[id]]` on the test's own route, so moving there keeps the page, and the
hypno playing). Finishing moves the URL there once the result is saved or
signed; a failure leaves the URL alone and offers a retry. Anyone with the
link sees the score in the look it was taken in, with "Take the test
yourself" in place of a history; the person who took it sees their history
beside it. The borrowed settings are never remembered as the viewer's own. A
link to a deleted result, or an edited one, is a 404.

**Signed in.** A finished run is posted to
[`/api/playroom/iq-test/results`](../src/routes/api/playroom/iq-test/results/+server.ts).
Each row in `iq_test_results` holds:

- the score, with how many were attempted, right and skipped;
- the settings it was taken under: the role, level, vibe and the two IQs,
  and, of the toggles, the two its results screen depends on, as they were in
  effect (`humiliating`, `themed_look`). The rest only shaped the run;
- the seed.

The row is plaintext, like tasks and rewards, and reported by the browser. A
failed save offers a retry, and the result stays on screen.

Deleting a result goes through `DELETE …/results/[id]`. Someone else's id gets
the same 404 as a missing one.

**Signed out.** History is kept in this device's `localStorage`, capped at 20.
Nothing is stored on the server, so the result's link carries the result
itself: [`iq-test-share.ts`](../src/lib/server/iq-test-share.ts) packs it into
thirteen bytes (the last holding the two toggles), adds a truncated HMAC under the auth secret, and base64url
encodes the lot into about 32 opaque characters, signed by
`POST /api/playroom/iq-test/results/share`. The signature stops the score in
a link being edited by hand. It does not prove the test was taken honestly:
the browser reports the score here as it does for an account, and nothing
depends on it. The enums have fixed codes in that file, so adding a vibe
never changes what an old link decodes to. Each device result keeps its
token, so its row in the history links to it.
Beside it is a link to sign up, and a "Clear history on this device" button
that asks once before clearing. An account's history has no clear-all, so a
slip cannot wipe it; results there are deleted one at a time.

**What a row shows.** "IQ n", when, and how the test was taken (intensity and
vibe). Not the role: it is stored, but a dom and a sub may be reading the same
list.

**Starting over.** The footer has a small "Start over" button whenever the
dialog is closed. It drops any run in progress,
rather than keeping it for "Carry on", and reopens the dialog.

**Run in progress.** It is kept in `sessionStorage`, per tab, so nothing
answered is lost to a reload. A reload resumes at the same question. If the
dialog is showing instead, after a new visit in the same tab, closing it offers
the run back on the intro as "Carry on". A question with something to memorise
starts that question over: its words were only ever on screen once.

**Plain HTTP.** Nothing on the page may use `crypto.randomUUID()`. Browsers
only provide it on a secure origin, and the test is also reached over plain
HTTP: a phone on the LAN hitting a dev server, or a self-hosted box without
TLS. It used to be the first thing `finish()` called, and there the Finish
button silently did nothing. Device-history ids come from `localId()`, which
uses `getRandomValues`. `finish()` also switches to the results before any of
its bookkeeping, so a later failure cannot leave the score unshown.

**Robustness.** All browser storage goes through
[`device.ts`](../src/lib/playroom/iq-test/device.ts). It treats anything that
does not parse as absent.
