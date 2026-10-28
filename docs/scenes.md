# Scenes

Planning a scene: a notebook entry of its own kind, with a column of ideas
and prompts beside the page. People differ a lot in what they care about when
they plan, and in how much they want to write down, so the designer is loose
by default: a page anyone can write on freely, gentle prompts they can take or
leave, and structure (blocks, a menu) only where someone adds it. Nothing is
ever required, and nothing is ever counted as missing.

It is the planning half of the roadmap's "Play and scene sessions"; running a
scene live and reviewing it afterwards are not built yet.

## A scene is a notebook entry

A scene is a notebook entry with `kind: 'scene'` (`src/lib/notebook.ts`), so
it is everything a notebook entry is ([notebook.md](notebook.md)): sealed from
its first byte, edited live by everyone with it open, versioned, kept in an
outbox while offline, in a person's own notebook or a partnership's. The
notebook lists scenes on a tab of their own. Every account can plan scenes;
there is no feature to grant.

Read-only and hidden work as for any entry. Who may make a shared entry
read-only or hidden is the notebook's rule (notebook.md, "Access"): whoever
holds the partnership's control, or with control shared, the entry's creator.

## The page and the column

A scene opens on the notebook's entry page (`NotebookEntryPage`), in a
`SidePanelLayout` (docs/theme.md, "Side panels"): the page's editor on the
left, and the column (`ScenePrompts`) as the panel on the
right.

- **The column can be put away** for focus, and comes back from a tab on
  the screen's right edge. Beside the page, whether it is away is
  remembered on the device; on a narrow screen it slides in over the whole
  page, and starts away.
- **Inside a menu, the column is the menu's options** (`MenuOptions`) rather
  than ideas and prompts, and its title and the icon on its button say so. Out of the menu, the ideas come back. They are the
  whole menu's: its title and subtitle, whether items are rated or numbered
  (switches, each with a field for what it means), hiding it ("Whole menu
  only me", which makes the whole menu a surprise for the partner), "Convert
  menu to plain text", and its design. An item has no options of its own: it is rated and
  numbered on the page, and made a surprise from the selection's toolbar.
  The fields write to the menu as they are typed in without putting the
  page's selection back on screen (`editAside` in `scene-blocks.ts`), which
  would take the focus out of the field after every key.
- **A section's options** (hide it from the partner, turn it back into text)
  sit above the page while the caret is in one (`SceneBlockBar`).
- **"Make a menu"** is on the selection's formatting toolbar, offered only
  when none of the selection is in a menu already. Headings in the selection
  become the menu's course headings, subheadings its subheadings, and every
  other line an item; "Convert menu to plain text" turns them back into
  headings. The
  `FloatingFormatToolbar` takes buttons of its caller's own (`ToolbarAction`,
  with `offered` to say when), and a scene's editor adds this one.

### The prompt types

The column has five types, each with its own **Fewer** and **More**
(`PromptSection`). There is no single "how much do you want to plan" dial:
someone who loves story ideas and finds questions annoying sets each once.
Fewer at the lowest step hides a type, leaving its heading so it can come
back.

| Type | What it holds | From |
| --- | --- | --- |
| Add a block | Menu, Signals, Limits, Aftercare… | `ScenePrompts` |
| Things to think about | Open questions with a one-line why | `considerations.json` |
| Questions | Questions with answers to tap | `considerations.json` |
| What you're into | Kinks as chips | the kink lists (below) |
| Story ideas | Starting points, chips per story line, characters, a die | `src/lib/scenes/story.ts` |

Blocks come first, as the most direct way to give a page shape, and the
model's help (`SceneHelp`, below) comes last, after everything that works
without it.

A prompt card offers **Add** (or an answer), and in its menu **We've got
this**, **Not for this scene** and **Never show me this**. The foot of the
column brings back anything set aside in this scene.

### The considerations catalogue

`src/lib/scenes/considerations.json`, loaded and checked by
`considerations.ts` the way the roadmap and the kink catalogue are: a bad edit
fails the tests and the type check. Each entry has an id (stored, so never
reused), a type (`think` or `ask`), a group (the four questions negotiation
keeps coming back to, plus before), a `level` (which step of More shows it), a
title, a why, answers for a question, an optional `when`, and what Add
inserts (a section and a line, `{answer}` substituted).

`when` makes a prompt wait until the page mentions something: kinks by id,
tags (`risky`, `consent-play`), or an intensity. A prompt about a non-verbal
signal appears once someone writes "gag".

### Noticing what the page mentions

`recognise.ts` matches the kink catalogue's names and aliases against the
page's text, as whole words or with an "s", and adds every kink above a match
and their tags. It runs in the browser, on the text this viewer can see
(`visibleText`): a partner's surprise must not bring up prompts that give away
what is in it. It is a nudge, not a classifier.

### Where the prompts' state lives

- **Per scene** ("added", "we've got this", "not for this scene"): a third
  Yjs shared type, `prompts`, in the entry's document beside the body and the
  title (`scene-doc.ts`). It syncs, is sealed and is versioned with the page,
  and both partners see what was dealt with.
- **Per person** (each type's step, and prompts never to show): a sealed
  record, `scene-preferences`, in the person's own vault, in the
  `scene_preferences` table, saved through `PUT /api/scenes/preferences` with
  a compare-and-swap on its revision (`ScenePreferencesStore`). Sealed,
  because which prompts someone waves away for good says something about what
  they are into.
- **Per device**: whether the column is folded.

## What you're into

`KinkChips` opens the lists in the browser. In a shared scene it compares your
list as you share it with this partner against theirs for you
(`compareLists`, as the comparison page does, `kink-list.md`) and offers what
you both said yes to (`sharedKinkChips`), strongest first; from the third step
of More, what one of you wants and the other is curious about too. Never a
limit, never a mismatch, never anything held back: a chip must not tell anyone
something the comparison page would not. Blind comparing, either partner's,
keeps it to what you both want. A kink you both want either way round is one
chip saying "Either way".

In a solo scene the chips are what the person likes or loves. Until both have
shared (or, solo, until there is a list), the section says how to get chips.

A chip goes into a menu as an item, with its kink, when there is one;
otherwise it is a line of its own.

## Story ideas

`story.ts`: ready-made starting points from sweet to filthy (More shows hotter
ones), and chips for each line of a story: what's going on, where, who you
each are, the feel, lines to use. They live in the page's Story section as
labelled lines ("Where: …"), and a chip toggles its phrase in and out of its
line (`toggleChip`, as daydreams' chips do), adding the line if it has gone.
No chip has a comma in it, because a comma separates phrases on a line.

With Daydreams, "Play as" lists the person's daydream characters and adds
their name, type, personality and how they talk. A die rolls in the column,
and "Add a roll to the page" leaves a line to fill in.

## Blocks

A scene's page has blocks besides ordinary text, inserted from the column, an
answer, or a chip:

- **Sections** (`SceneSectionNode`): Signals, Limits, Aftercare, Rituals,
  Beforehand, Story, Notes. Ordinary paragraphs and lists inside a labelled
  block. Answers to a question go into the section of their kind.
- **A menu** (`MenuNode` → `MenuCourseNode` → `MenuLineNode`): courses, each
  a heading and everything after it up to the next heading, subheadings
  included. A line is a heading, a subheading or an item, set from the
  selection's toolbar like any line's heading (docs/rich-text.md, "Headings"),
  and the menu divides itself into courses wherever its headings are. Lines
  before the first heading are a course with no heading. An item carries the
  kink it came from, and its rating and number (below). A menu has its own
  title, which takes the place of the design's (empty, the design's shows,
  and is the field's placeholder), and a subtitle under it (empty, the
  design's if it has one, otherwise none). Both are someone's words, so they
  count in the page's text.
- **Words written on the menu itself.** Its title, its subtitle, what its
  rating and number mean (in its key) and its design's copy (below) are
  tapped and typed into on the menu (and, where they cannot be, still
  selected and copied like any words, unlike the drawing around them), each a small
  `contenteditable` of its own inside the frame (`registerFrameText`).
  Lexical does not draw or edit them: their events are stopped at the root
  on the way down, before Lexical's listeners see them, and Lexical already
  leaves the selection alone while one has focus (it takes it for a
  decorator's input). Select-all is kept to the text, since the browser's
  would take the whole page. Tapping into one moves the page's selection
  into the menu, so its options show, and what is typed is the menu's at
  once: the options' fields follow it, as they follow the partner. A press
  anywhere else in the editor leaves it, as a press off any field does: the
  menu takes presses on its frame for itself and cancels them, which would
  otherwise keep the focus in the words. Emptied,
  a title or subtitle is the design's again, shown as a placeholder while
  it is typed in and drawn as soon as it is left. Rewritten copy, and a
  title or subtitle of the menu's own where the design has one, show a
  floating **Reset** beside them while they are being edited, which moves
  with them when the page scrolls or changes width.
- **Getting into a menu.** Its frame is drawn, not written, so a tap on its
  title, its key or its drawings would land nowhere: the menu puts the caret
  in itself instead, at the start of its first line from its heading and at
  the end of its last from anywhere else, and a tap beside a line's words
  ends that line (`registerMenuCaret`). While the caret is in a menu that
  can be edited it is marked `caret-in` (never in a read-only editor, where
  a click still puts a selection in it), which shows its **Add a section**
  button under the
  courses: a new course, its heading's words selected to be typed over. A
  heading typed anywhere does the same; the button is for anyone who would
  not guess that.
- **A menu's corner** (`.menu-tools`) holds two buttons, shown while the
  caret is in the menu, while the menu is pointed at, or while one of them
  has the focus, so a menu can be linked or deleted without first clicking
  into it. The **link** button copies a link to the menu's own page and
  shows it (below). The **delete** button deletes the whole menu, words and
  all, and puts the caret in what follows it (a new line if nothing does):
  otherwise deleting one took selecting every line in it and then the
  frame. A reader is offered the link and not the delete, which refuses
  them anyway. A press on the page below a menu or a section that ends
  it starts a new line after it, since otherwise the caret would land
  back in the block and nothing could ever be written after it.

### Ratings and numbers

An item is only words until someone gives the menu more, in its options;
each is off on a new menu, because what is worth rating differs from scene
to scene (`MenuExtras`, stored on the menu as `scale` and `value`).

- **A rating** is one to five on a scale someone names ("Intensity",
  "How much I want it"). **A number** is any number someone names ("Price",
  "Minutes"). Each name is the menu's key to it, under the courses
  (`.menu-key`); an empty name is on but unexplained.
- **Unset ones show only while the caret is in the menu.** Out of it, and in
  a stored version, an item shows only the rating or number it was given.
- **Every item shows them** once they are on, set or not, at its right
  (`.menu-line-extras`), each as one button. Tapping either opens a popover
  pointing at it (`MenuItemExtras`, a `wa-popover` outside the editor's
  text, whose typing the editor would otherwise take): a slider for the
  rating, easier to hit than five small marks, with the base slider's Clear
  (docs/sliders.md, "Clearable"); a number field for the number, which says
  under itself when what is typed is not one (docs/theme.md, "Invalid
  fields") and changes nothing until it is. Each
  change is made as it happens, with nothing to confirm, and a tap
  elsewhere or Escape closes it. The buttons are changed
  in place as the item is redrawn, never replaced, so the popover stays
  pointing at the one it came from. Nothing is asked in an editor that
  cannot be edited.
- **The design writes them**: the marks of a rating are its own (hearts,
  daggers, bones, a toy's setting lights), and so is a number, a price on
  most, a percentage on the nutrition label, milligrams on the prescription
  pad (`MenuDesign.value`). An unset number is written the same way with a
  dash for the number ("$–", "– treats": `unsetValue`).
- **The marks and the number are drawn, not written**: they are not text in
  the item, so they do not merge with what someone types, and converting
  the menu to plain text writes them out in words ("(Intensity 3/5, Price $12)").
- A menu turning them on or off, or changing design, redraws its lines
  (`registerDesignRedraw`), straight into their elements: the lines
  themselves have not changed. The element they are drawn in is marked
  unmanaged (`setDOMUnmanaged`), as the menu's frame is, or Lexical would
  undo the drawing as DOM it did not make.

### To-do items

An item can be a to-do, with a box before its words, ticked when it has
been done, as a line of a to-do list can ([rich-text.md](rich-text.md#to-do-lists)).
A menu's line is not a list item, so Lexical's check list does not reach it;
the item carries `checked` instead (null when it is not a to-do), stored on
`scene-menu-line`.

- **Making one** is the same as in a paragraph: `[] `, `[ ] ` or `[x] ` typed
  at the start of an item (a `TextNode` transform, since Lexical runs a
  line's own transform only when the line itself changed, and only with the
  caret right after the brackets, so a pasted line starting that way is left
  alone), or the selection toolbar's To-do list button, which in a menu
  makes the selected items to-dos, or plain items again, rather than
  wrapping the menu's lines in a list (`setSelectedChecklist`). Headings
  are never to-dos.
- **Enter after a to-do** makes the next item an unticked one, and
  **Backspace at its start** makes it a plain item, still in the menu, before
  Backspace there would take the line out of it.
- **The box** (`.menu-line-check`, `drawLineCheck` in `menu-frame.ts`) is
  drawn beside the words, like the rating and number: a `role="checkbox"`
  button named by the item's words, unmanaged by Lexical, ticking on a tap
  only in an editor that can be edited, or one marked tickable
  (`setTickable` in `viewer.ts`), as a menu's own page is for a writer. It is drawn in the menu's ink, an
  outline and a tick, so it suits every design; a done item's words are
  struck through. A stored version draws the same element as a picture
  saying "Done" or "Not done".
- **Turning a to-do list into a menu** keeps its items to-dos, ticked as they
  were, and **converting a menu to plain text** puts its to-dos in to-do
  lists, so nothing is lost either way.

They are **element nodes**, not decorator blocks. Their text is ordinary
Lexical text, so `@lexical/yjs` merges two people typing in one menu
character by character, where a decorator's data is one property the last
writer replaces whole; and converting one back to text is lossless, because a block is
only a wrapper around lines someone wrote. Each is a shadow root, so a line
added inside stays inside. See [rich-text.md](rich-text.md) for the node set.

Keys inside blocks (`registerSceneBlocks`):

- **Enter** on an empty last line leaves a section, or the last course of a
  menu.
- **Backspace** at the very start of a block's first line takes that line
  out, above it; at the start of a later course, it joins that course to the
  one before.
- Transforms keep the shape whatever made it: a menu holds courses, a course
  holds lines, a heading made anywhere but the top of a course starts a new
  course there,
  an empty block goes.

The stored document carries the blocks as `scene-section`, `scene-menu`,
`scene-menu-course` and `scene-menu-line` (`richtext.ts`), every field read
leniently, as anything a partner's browser wrote is. A version in the history
is drawn by `SceneBlock.svelte` with the same elements and classes the editor
makes, so `scene-blocks.css` and `menu-designs.css` style both.

### A menu's own page

A menu can be shown on a page of its own, filling it:
`/notebook/[entryId]/menus/[menuId]`, for a solo scene and a shared one alike,
since the page takes its space from the scene ([notebook.md](notebook.md#the-list-in-every-context)).

- **A menu's id.** Lexical's node keys are made afresh on every load, so a
  link needs a handle kept with the menu: `MenuNode.__menuId`, stored as
  `id` on `scene-menu` (null on a menu from before links). A new menu is
  made with one. A menu without one, or with one an earlier menu in the
  scene already has (a paste of a menu), is given a new one by any writer's
  editor (`registerMenuIds`). That happens in an update of its own, after
  the update that showed the problem rather than in a transform:
  `@lexical/yjs` sends nothing a transform changes during an update that came
  from another writer, which is how a scene from before links arrives. Two
  writers giving one at once settle on one of them, as Yjs settles any
  property. A reader cannot give one, so a menu from before links has no link
  button until a writer has opened the scene.
- **The link.** The corner's link button dispatches `MENU_LINK_EVENT` from
  the click itself. `MenuLinkPopover.svelte` answers it by starting the
  clipboard write there and then, before anything is awaited, because a
  browser may refuse a write that is not part of a gesture
  (`copyText` in `share.ts`). It then opens a popover pointing at the
  button, which says whether the link was copied, shows it in a read-only
  field that selects it all when clicked (`InputField`'s `selectOnFocus`),
  and has an **Open** button that opens it in a new tab. The menu is
  marked `link-open` while the popover is open, so its corner, and the
  button the popover points at, stay put.
- **The page** (`SceneMenuPage.svelte`) is in the app shell, since that is
  where the keyring is opened (`EncryptionGate`), but the shell leaves out
  its nav and notices for it. It opens the scene's session as the scene's
  page does (`entrySession`), binds the same collaborative editor to the
  whole scene, and shows the one menu (`registerOnlyMenu`). The root is
  marked `menu-page` and the menu `only-menu`, and everything else is
  hidden. The editor keeps every edit inside the menu, because changing
  what nobody can see is how a page of one menu would lose a scene's words.
  A caret that leaves it is brought back, a selection past either end is cut
  to it, and Enter, Backspace and Delete at its edges do nothing. In edit
  mode, selected words get the same formatting toolbar as on the scene's
  page (surprises included, for a shared scene's partner), and an
  **Options** button beside Done opens the menu's options in a drawer
  (`MenuOptionsDrawer`): the same as the scene's column shows for a menu
  the caret is in, for the page's one menu wherever the caret is
  (`menuById`), less "Convert menu to plain text", which would take away
  the page's menu. It is mounted closed and opened once drawn, since Web
  Awesome shows a drawer that starts open without sliding it in. The corner's buttons and the column are left off. The menu is
  the page, edge to edge: no column, gutter or block margin around it, and
  it is stretched to at least the window's height, with the Edit button
  floating over its top corner. Nothing shows while it opens, not a
  skeleton: the page is the menu, and a skeleton shaped like no design in
  particular only flashed up before it.
- **Read only, and ticking.** The page opens read only. For anyone who may
  edit the scene, its to-dos still tick (`tickable`), and an edit button in
  its top corner (just a pen, named "Edit") makes the menu editable, turning
  into **Done**. While
  it is editable the menu is marked `caret-in` the whole time, wherever the
  caret is, so Add a section and the unset ratings and numbers show without
  clicking into it first; read only, they never do. A tick
  is an ordinary edit, made through `editor.update`, which a read-only
  editor still sends to the scene. Anyone who may only read the scene gets
  neither. Out of edit mode nothing that only changes in it looks pressable:
  ratings, numbers and a design's pictures get the ordinary cursor, and a
  to-do's box keeps its hand only where it ticks (the root is marked
  `tickable`).
- **Access** is the scene's own (`loadSceneMenu` in
  `server/notebook-pages.ts`), and anything but a scene is a 404. Whether the
  menu is in the scene is for the browser to say, since the server cannot
  read it. Until the scene has been applied the editor is empty, which is not
  the same as the menu being gone, so `registerOnlyMenu` says nothing until
  the first update after it was registered. A menu that is not there says so,
  with a link back to the scene.

### Surprises

Anyone in a shared scene can mark a section, a whole menu, or menu items
**only for themselves**: a section from the bar above it, a menu from its
options, and items by selecting their words and choosing **Make a surprise**
on the selection's toolbar (`setSelectedSurprise`; only items whose words are
selected, not one the selection merely starts at the end of). Its writer
sees it marked as wrapped: a present before an item's words and gift-wrap
stripes behind them, a dashed edge on a section or a menu. The partner sees "A surprise" in its place: there,
but not readable, reachable or deletable. Only the person who hid it can show
it again.

- **It is on screen only.** Both partners hold the partnership vault's key, so
  the text is in the partner's document too; the editor draws a placeholder
  (`drawSurprise`) and makes it not editable. Partners are trusted, and this
  is a courtesy between them, as the notebook's "hidden" is.
- **Nobody can delete what they cannot see.** A guard refuses Backspace,
  Delete, cut, paste and typing over a selection that touches a surprise, and
  Backspace or Delete next to one.
- **Kept out of everything else**: the shared header's excerpt leaves out
  anything hidden from anyone; what the page mentions is read without the
  viewer's surprises; a version preview draws them as surprises; help from
  the model is sent the page as the asker sees it.
- **Moving a scene leaves its surprises as they are**: each is hidden from
  the same person wherever the scene goes, its own space included, so moving
  a scene out and back never gives one away. In the mover's own space a
  surprise hidden from them is still "A surprise" they cannot open or delete.
  See [notebook.md](notebook.md#moving-an-entry).

## Menu designs

A menu has a design (`menu-designs.ts`), stored on it, so both partners see
the same one, and chosen in the menu's options from previews that are each
design itself, at half size, two to a row. There are twenty-four, from
restaurant menus (fine dining, a diner, an izakaya, a bistro's slate, a
trattoria, a deco lounge) to kink vibes (a dungeon board, a glossy magazine
cover, a club ticket, a nutrition label, pet play, Harajuku decora, a love
letter, a prescription pad, a bedtime story, a royal decree, a corkboard, a
tarot spread, seed packets, a cross-stitch sampler, a toy chest and more). Fine
dining is the default, and an id this build does not know reads as it.

- **Every menu has the same frame** (`menu-frame.ts`): a sheet with drawings
  laid over it, a heading (the title, a subtitle, a note), the courses, the
  key and a foot. The editor's menu node builds it in `createDOM` and puts
  its courses in it through its DOM slot, and adds the editor's own "Add a
  section" after them; a stored version draws the same frame in
  `MenuFrame.svelte`, and a test holds the two to one shape. Lexical edits
  none of the frame; its title, subtitle and copy are written on it another
  way (above).
- **A design's copy** (`MenuDesign.copy`) is the words that only make sense
  on it: the memo's "TO:", "RE:" and "FROM:", the nutrition label's small print,
  the letter's sign-off. Each is a key, a place in the frame (the heading,
  its note, an intro before the courses, the foot, or a drawing) and its
  words, drawn as a `.menu-copy` span there. What a menu rewrites is kept on
  it per design and per key (`copy`, only what differs; `menuCopy`,
  `withMenuCopy`), so another design never shows it and switching back
  does. Copy takes as many lines as someone types (Enter starts another,
  and a pasted one keeps its lines), except where another line would break
  the design (`MenuCopy.oneLine`: a stamp, the starburst, a ticket's stub),
  where Enter is done with it. A last line just started is held open by a
  line break at the end, since a trailing newline draws nothing to put the
  caret on. Emptied copy is gone from the menu, except while the caret is in
  it, where the design's words show in its place to be written over. A
  design's numbering and per-course flourishes (a lecture's number, the
  marginalia, a course's time) stay generated content.
- **Copy that is a form's fields** (`MenuCopy.fields`: the memo's lines,
  the prescription's patient and date, the nutrition label's small print)
  is drawn a line at a
  time, each split at its first colon into a `.copy-label` (the colon
  included) and a `.copy-value` (`copyFields`), so a design can print the
  one and handwrite the other. The prescription puts every value on a line
  of the same length, starting after its longest label. A line with no
  colon is all label, a field still to fill in. The split is redone as it is
  typed, keeping the caret where it was, so typing or deleting a colon
  moves the label with it. An empty line holds a zero-width space in its
  label (`HOLD_OPEN`, never part of the words): with nothing there, the
  browser moved a caret to the end of the line before, and beside a lone
  line break drew it well below the line.
- **A title drawn a letter at a time** (`MenuDesign.titleLetters`: decora's,
  each letter its own colour of the rainbow) and **a subtitle drawn in
  beads** (`MenuDesign.subtitleBeads`: decora's kandi bracelet, "MORE IS
  MORE") are drawn a span per character (`.title-letter`, `.bead`; a space
  is also `.gap`), since no selector reaches one letter. A beaded
  subtitle's words are each a `.bead-word` with a pony bead at either end,
  its last bead lying under the next word's first, so one bead is the gap
  and the string runs unbroken; a space is nothing to see. Wrapped, it
  breaks only between words, and every line is a bracelet of its own,
  beaded at both ends, with the string's loose ends curling out past them.
  Where a line ends is only known once it is laid out, so `bracelet.ts`
  marks each line's first and last word (`data-line-start`,
  `data-line-end`) and marks them again when the subtitle's width or words
  change; the ends are drawn out of the flow, since moving a word onto
  another line would change the marks, and round again. Each of a lettered
  title's letters has its place in the title (`--letter`), for a wave to
  run along all of it. The spans are loose rather than lines, so they
  read back as one run of words, and they are split again as they are
  typed, the caret put back by counting characters, as fields are. A bead
  is a block and not a grid, though a grid would centre its letter: a grid
  draws no whitespace-only text, so a space had nowhere for the caret, and
  what was typed next went in before the space.
- **Pieces that spin** (`MenuDesign.spinners`: decora's hair clips along
  its top) are a row of `<i>`s the frame adds before the sheet. Each spins
  on its own as the pointer comes over it (`spinners.ts`, attached by the
  menu node and by `MenuFrame.svelte`): further the faster the pointer was
  moving (a quarter turn to four), the way it was moving, and from wherever
  an earlier spin has it. It comes to rest wherever the spin ends, not
  where the design set it, so a sweep leaves its mark. Nothing spins for anyone who asked for less motion.
- **A course's picture** (`MenuDesign.courseArt`): on a design whose courses
  each have one (the toy chest's toys, the toy on each pet card's corner,
  each seed packet's flower, and the sticker on each decora card), each course shows the design's next
  picture in turn by its place, or the one someone picked by tapping it
  (`MenuArtPicker`, a popover like an item's rating). The pick is kept on the
  course, per design (`art`), so it goes with the course if it moves and
  only shows on that design. In the editor the picture is a button after
  the course's lines (its DOM slot puts the lines before it), redrawn
  whenever the menu changes, since a place in turn moves with the courses
  around it. A picture can bring more with it (`MenuArtChoice.caption` and
  `tint`): a flower brings its made-up Latin name, written under the
  packet's title, and its plate's colour, handed to the design as
  `--course-caption` and `--course-tint` with the picture's own
  `--course-art` (`courseArtVars`).
- **A row of pictures in the heading** (`MenuDesign.pictures`): the
  sampler's bunny, flower and fox, each of which can be changed to another
  stitching by tapping it, and decora's star and heart either side of its
  title, from the same stickers as its courses (the row is
  `display: contents`, so each picture takes its own place in the
  heading's grid). The design names the default for each place in
  the row; what is picked is kept on the menu, per design and per place
  (`pictures`, `picturesFor`).
- **A design's mascot** (`MenuDesign.mascot`): the pet design's pup, which
  can be changed for a kitty the same way, by tapping it. The pick is kept
  on the menu, per design (`mascot`). A mascot can bring its own title for a
  menu with none ("Good Kitty"), and the menu is marked with its id
  (`data-mascot`), so the design dresses the rest to match: the kitty's sky
  and rating are fish where the pup's are bones.
- **A design is CSS** (`menu-designs.css`), keyed by `.design-<id>`, that
  paints that frame: its backgrounds, its drawings (up to eight pieces, each
  with `::before` and `::after`), and its copy. Course-by-course variety (a card's
  colour, a tarot frame) repeats every four courses; the cork board tilts
  each note its own way, from two tilts in cycles of five and three courses
  added together, so the same tilt comes round only every fifteen.
  A design may move (the bimbo's twinkles; decora's confetti, falling
  slowly and spinning each at a pace of its own, and bobbing stickers,
  and, only while pointed at, its clips spinning, its title's hopping
  letters, each card's frame in a way of its own (the stripes drifting,
  the dots swelling by halves, the checks trading shades, the rainbow
  running round, some through registered custom properties so a gradient
  can animate), and a wave of swelling beads along an item's rating, the
  string staying put), only
  under `prefers-reduced-motion: no-preference`, and a title being typed in
  holds still. What plays while pointed at is not `:hover` but a mark,
  `data-playing`, which `play-on-hover.ts` puts on the title or an item as
  the pointer comes over it and, when it leaves, takes off only
  once what the mark set going has finished the cycle it was in: a
  `:hover` animation stops dead, snapping back from wherever it had got
  to. So every such cycle ends as it began, and coming back before it ends
  plays on. A card's frame is different: its animation is always there,
  paused, and runs only while pointed at (`animation-play-state`), so it
  stops wherever it is and goes on from there. Decora's confetti (`MenuDesign.confetti`) is a layer of
  its own behind the menu that `confetti.ts` fills to suit its size: the
  menu is cut into lanes across and slots down, a piece to each, and each
  piece is worked out from its lane and slot alone (where, how fast, what:
  mostly rainbow sprinkles, now and then a star), so the confetti is as
  thick on any size of menu, and a menu that grows keeps the pieces it had
  falling as they were and gains pieces only where it grew. A fall is the
  menu's height, in `cqh` units from a size container. The layer is marked
  unmanaged (`setDOMUnmanaged`), as the rest of the frame is, or Lexical
  takes the pieces added to it for stray DOM and removes them. Nothing a
  popover
  is anchored to may move: a picture that wiggles is drawn inside its
  button, which stays put, since the picker followed the button up and
  down. Decora also has pointers of its own
  over the menu (an arrow, an I-beam where words are written, a pointing
  hand for what can be tapped: files in `static/menu-art/`), set on the
  menu itself to outrank the editor's. Its stickers have a white edge
  traced round their whole silhouette by an SVG filter (blurred and cut
  off hard), since a stroke round one shape missed whatever stuck out of
  it. A Playwright click waits for an element to stop moving, so a spec
  that taps something animated emulates reduced motion first.
  The love letter writes each course as a sentence ("First, Starters, which
  I shall begin with this, that and the other"), in six ways from the first
  course's to the last's: the first and the last two always go first and
  last, and the middle fills with the second, third and fourth in turn, so
  one course more adds a sentence rather than rewording the others. A
  missing title or item is a blank underlined in red, to tap and write in
  (a tap on a course with no items starts one), and while the caret is in
  it a line at the top of the paper says to press Enter for the next item. It is
  one column at any width, being read line by line.
- **Its pictures are files**, `static/menu-art/*.svg`, drawn by
  `scripts/menu-art/build.mjs`: worked out in code (a seeded sky, a stitched
  vine, a cloud's bumps rising to a crest) rather than kept as data URLs in
  the CSS. Used as backgrounds, an SVG cannot reach the page's fonts or
  `currentColor`, so each has its own colours, any words are the CSS's, and
  a picture a design recolours (a paw, a bone) is a mask. The slate's chalk
  is the one SVG filter on text, and a CSS filter only reaches one in the
  same document, so it travels in the frame (`MENU_FILTERS`).
- **Layouts respond to the menu's own width**, not the screen's: the editor
  surface is a `scene-page` container, and a design breaks into columns,
  boxes, a spread or a fanned hand of cards only where the menu has room,
  beside the prompts or not. Every design is one column when narrow.
- **And they stop growing.** However wide the page (a menu's own page is
  the whole window), a design's sheet is no wider than its
  `--menu-max-width`, centred on whatever the design draws around it: 64rem
  for the two-column designs, 80 to 84 for the ones four across, 56 and 60
  for the letter and the decree. Each limit is generous, and never under the
  design's widest `scene-page` breakpoint: the container is the page, not
  the sheet, so a sheet narrower than a breakpoint would get the wide layout
  squeezed into it. Anything a design draws on the menu, outside its sheet,
  that belongs to the sheet follows it (the dungeon's chains, whose inset
  is worked out from the limit).
- **And where they sit, on a menu's own page.** That page is the only
  place a menu is ever taller than what is on it, so there a menu is a
  grid of the space above, the sheet and the space below, and each design
  says how the spare height is shared (`--menu-space-above`,
  `--menu-space-below`). A card on a table sits a third of the way down, a
  board on a wall a quarter, a ticket and a tarot spread in the middle, and
  a clipboard's paper a little way down, its clip with it, and a memo a
  little way down its paper. Anything else in the menu's flow goes above the
  sheet: just above it, or along the top of the page for a strip
  (`--menu-strip-align`: the pet collar, the decora clips, which there are
  enough of for a 4K window), or reaching all the way up (the dungeon's
  chains, a link at a time). The pet collar's tag hangs from the sheet's
  top, so there the sheet stays under the collar and the spare height
  goes inside it instead.
- **Where a design's surround is part of the object** (the slate's wooden
  frame, the magazine's cover, the fine dining card and its gold rules), a
  menu's own page does not stretch it to the window: the slate keeps a
  narrow frame all round, the cover and the card are no bigger than what is
  on them, each with a shadow, and the page around them is the app's own,
  dimmed behind the fine dining card and the magazine. The deco lounge's
  dark goes inside its gold frame, the page dimmed around it in the same
  way. Treat Yourself is a rounded card on a backdrop of its frame's own
  pink (#ff5fae).
- A preview is its own container, so it shows the narrow layout, at half size
  (`zoom`). Two things about previews cost a round each: a preview sits in
  a `<button>`, whose centred, unwrapped text (Web Awesome's) has to be
  undone or every design's lines move; and `zoom` does not scale a
  repeating gradient's stops, so a ruled background is a tile sized with
  `background-size` instead. A few designs set a smaller title or drawing
  below 20rem, which is what a preview is.
- **Its faces are self-hosted**, as the app's own are: Latin subsets in
  `static/fonts/menu/`, fetched by `scripts/menu-fonts/fetch.mjs`, which also
  writes `menu-fonts.css`. A browser downloads a face only when a menu on the
  page uses it. Every Google face is OFL except Special Elite (Apache 2.0);
  `SOURCES.txt` records each. **Tan Pearl** (the tarot spread's, from
  Build-a-Date) is not Google's: it is kept beside the script and copied
  across, and its licence for this app has not been checked.

## Help from the model

Only ever when someone presses a button: **What might we have missed?**,
**Suggest a menu**, and **More ideas** on a story line. The first press shows
what is sent and asks the person to agree (`HelpConsent`), once; the server
refuses to send anything until there is a row in `scene_help_consents`.

`POST /api/scenes/help` is one of the places the server handles a person's
words in plaintext, under the daydreams' rules (daydreams.md, "What the
server sees"): agreement first, the text forwarded and the answer passed back,
nothing stored, nothing but a status logged. It uses the daydreams' model and
provider, which the admin sets up; with none set up, no help is offered. It
shares the daydreams' suggestion rate limit, and asks the provider not to keep
the data.

The prompt (`model-help.ts`) rules out anything involving a minor, tells the
model to respect the page's limits, and asks for JSON in one shape per task;
the browser checks the answer against the same shapes. What is sent is the
page as the asker sees it, so a partner's surprise never reaches the model
through them.

## Tests

- **Pure**: the catalogue and its `when`, recognising kinks, the chips from a
  comparison, story lines and starters, the help prompt and answer parsing,
  the access rule (notebook.test.ts).
- **Server**: scenes listed and created; the scene's load (partner, kink
  lists, characters); preferences saved compare-and-swap; the help endpoint's
  refusals, its agreement, and that it never logs what was written.
- **Component**: the prompt column; the blocks in a real editor (menus,
  courses, sections, the keys, surprises and their guard, story lines,
  designs, a menu's title, the caret taken by a tap on the frame, "Add a
  section", the focus left in a field that changes the menu, words and key
  names written on the menu, copy kept per design and Reset, a course's
  picture picked, a menu's id given and kept, the link button, a menu's own
  page keeping the caret and every edit inside the menu, a to-do ticked
  while read only) and two writers in one menu, an id reaching both; the
  link popover, copied or not; `InputField` outside a form selecting its
  text.
- **Server, a menu's page**: the scene's access, and a 404 for anything but
  a scene.
- **End to end** (`e2e/scenes.spec.ts`): prompts beside the page and what was
  written kept sealed; Fewer and More remembered and the column folding; story
  chips; help from the model through its agreement; a shared scene's outcomes
  live and its access its creator's; "Make a menu" from the toolbar; a design
  both partners see; a menu's own title and subtitle, cleared back to the
  design's, and written on the menu itself; a design's copy rewritten and
  reset; a toy picked; items rated and numbered from their popover, a number
  that is not one refused; a surprise the partner cannot read or delete; a
  menu's link shown on hovering, copied and opened on its own page, which
  is read only, ticks for the scene, and edits from its Edit button; a read
  only partner's menu page, with no Edit and no ticking; a menu that is not
  in the scene any more.
