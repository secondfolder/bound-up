# Plan: easier-to-read daydream passages

Make a daydream passage easier to read, from the brainstorm's list less the
ones set aside (paragraph discipline in the prompt, a serif face, the
book-page layout, reader settings, dimming earlier passages, collapsing
history, read-aloud).

## What changes

1. **A small Markdown subset.** `*italic*` / `_italic_`, `**bold**`,
   `***both***`. No headings, lists, links or tables: an unpaired marker is
   shown as written.
2. **Scene breaks.** A line of `***`, `* * *`, `---` or `___` on its own (or
   `⁂`) is drawn as a centred ornament with space around it.
3. **Dialogue set apart.** Text inside `"…"` / `“…”` is drawn in a dialogue
   colour, quote marks included. Speech that runs on past the end of a
   paragraph (no closing quote, the fiction convention) is dialogue to the
   paragraph's end.
4. **Who is speaking.** The model wraps spoken lines in
   `<say who="Name">"…"</say>`. Each known voice gets its own colour (the
   user's own, then the setup's characters in order); an unknown name gets
   the plain dialogue colour. When a passage has more than one speaker, a
   small name label is drawn where the speaker changes. Tags are never shown.
5. **Inner thoughts in italics**, by the prompt's new formatting section,
   which also names the subset, the scene break and the say tag.
6. **A comfortable measure.** Paragraphs are real `<p>`s with space between
   them, a line length capped near 65ch, and a looser line height.
7. **Drop cap and small caps.** The story's opening passage gets a drop cap;
   the first line after a scene break is set in small caps.
8. **Smooth streaming.** A passage arriving is revealed at a steady pace that
   adapts to the backlog, rather than in the provider's bursts; formatting
   applies while it streams, with half-arrived markers and tags hidden.
   Reduced motion shows it as it arrives.
9. **Keep the reader's place.** Following a passage as it streams stops once
   the passage's top reaches the top of the scrollport, so a long passage is
   not scrolled past before it is read. Following never moves the reader up.

## How

- `src/lib/daydream/passage-format.ts` (pure, alias-free): `formatPassage(text,
  { streaming })` → blocks (paragraphs of runs, or breaks). Every run's text
  is a contiguous verbatim slice of the stored text with its `start`/`end`,
  so quote offsets stay offsets into the stored passage — existing bookmarks
  still match, nothing migrates. `plainPassage()` for showing a quote or a
  written-out turn without markup. `withQuotes()` splits runs at highlighted
  quotes.
- `quotes.ts`: `highlightSegments` becomes `quoteRanges` (the merged ranges),
  since runs are now cut by the formatter.
- `DaydreamProse.svelte` draws the blocks; each run is a leaf carrying
  `data-start`. `DaydreamPassage` and the streaming bubble both use it.
- Selection (`DaydreamThread`) maps each end of the range to a source offset
  from the leaf it is in (`data-start` + offset in its text), not from the
  rendered text's length.
- `src/lib/daydream/reveal.ts` (pure step) + `SmoothReveal` in
  `reveal.svelte.ts` (rAF loop).
- `followEnd(from, { holdAt })` in `scroll-parent.ts`; the thread marks the
  passage streaming in, and the passage it became, with `data-hold-scroll`.
- Colours are tokens in `theme.css` (`--daydream-dialogue`,
  `--daydream-voice-you`, `--daydream-voice-1..4`).
- Prompt: a `# Formatting the passage` section in `replyFormat`.
- Bookmark/not-this/bookmarks list, and written-out turns, show quotes
  through `plainPassage`.

## Tests

- `passage-format.test.ts`: paragraphs, breaks, emphasis pairing and
  unpaired markers, `_` inside words, dialogue (straight, curly, run-on),
  say tags (attribution, labels on change, unclosed, stray close), runs are
  verbatim slices, streaming leniency (partial tags, open markers), quotes
  across formatting, `plainPassage`.
- `quotes.test.ts` for `quoteRanges`; `reveal.test.ts` for the step.
- `scroll-parent.svelte.test.ts`: holding at a passage's top, never moving up.
- `prompt.test.ts`: the formatting section is in the reply format, not in a
  check-in.
- Component: a passage renders formatting, and selecting across bold text
  quotes the stored offsets.
- e2e: the existing quote test still passes; the model stub's passage gains
  formatting.

## Docs

`docs/daydreams.md`: a "Reading a passage" section (format, dialogue and
voices, measure, streaming, keeping place), the reply format, bookmarks
(offsets against the stored text), following the story, tests. This plan
copied to `docs/historical-plans/`.
