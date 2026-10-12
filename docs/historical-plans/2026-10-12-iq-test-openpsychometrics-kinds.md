# IQ test: the openpsychometrics FSIQ question types

## Request

Go through the questions of https://openpsychometrics.org/tests/FSIQ/ and
adapt the same question types into ours. Its six sections (read from its
`subtest-*.js`, which run in the browser; nothing was submitted):

1. **Vocabulary** (`V`): a word, ten options, 3–6 of them synonyms (some
   obscure); the rest an antonym, unrelated words and made-up words. Tick all
   that mean the same.
2. **Mental rotations** (`MRT`): a shape, eight options, tick every one that
   is the same shape turned, not a mirror image.
3. **Visual memory** (`VMT`): a 5×6 grid with some cells shaded for 5
   seconds, then reproduce it from memory.
4. **Anagrams** (`A`): eighteen letter sets, half of which unscramble to an
   English word; tick as many as possible in 60 seconds.
5. **Central point** (`CP`): a grid with some points shaded; pick the point
   with the lowest average distance to all of them. Scored by how close.
6. **Exposure memory** (`ISM`): icons shown one at a time, faster as it
   goes, then eight icons: tick the ones that were in the sequence.

The tick-all ones score +1 per right pick and −1 per wrong one.

## Decisions (asked and answered)

- **Partial credit** for the tick-all kinds: (right − wrong) / number right,
  never below 0. The accuracy behind the IQ uses it. The kind-weighting
  rigging counts a question as passed at half credit or more.
- **The run is 36 questions**; a score is still offered from 12.

## Design

**Model** (`questions/types.ts`, `questions/index.ts`):

- `credit(question, response): number` in [0, 1] is the one measure;
  `isCorrect` is `credit === 1`. `scoreRun` sums credit; its `correct` is that
  sum rounded (stored and shared as before), and accuracy is the unrounded
  sum over attempted.
- A new format `multi`: `choices`, `answers: string[]`. The response is the
  picked ids, comma-joined. An empty pick is a skip, as an empty answer is.
- A new format `point`: a grid and the points shaded; the response is a cell
  index; credit 1 for a best cell (lowest mean distance), falling off with
  how much further on average the picked cell is.
- `layout` on a multi question: `grid` (columns, rows) for the visual memory
  board, its choices being cells.
- `Memorise` gains `grid` (the shaded board to remember) and `sequence`
  (show the items one at a time, every `intervalMs`) beside `items`.
- `limit` on a question: answering ends after this many seconds and what is
  picked is submitted (anagrams).
- `Choice` gains `polyomino` (cells to draw) and keeps `label` as the name.

**Generators** (new files under `questions/`): `synonyms`,
`mental-rotation`, `visual-memory`, `anagrams`, `central-point`,
`exposure-memory`. Difficulty scales size, speed and obscurity. Word lists
are curated by hand and checked against a dictionary when written: no
made-up word or non-word letter set may be a real word or an anagram of one.

**UI** (`QuestionCard`): multi answers as lettered toggle cards with a
Done button, the visual memory board as a grid of toggles, the central point
grid as cell buttons, polyominoes drawn in SVG, the exposure sequence one
item at a time with the countdown, and the anagram limit as a countdown that
submits.

**Run**: `RUN_LENGTH` 36; the intro copy says 36. The testing aids answer
every new format (all right; all wrong).

## Tests

- Node: each generator over many seeds (counts, answers present, rotations
  really rotations and mirrors really mirrors, no fake word real, central
  point's best cell right), credit for each format, scoring with partial
  credit, nextKind's half-credit pass, run length.
- Browser: QuestionCard for each new format: toggling, Done, previous picks
  restored, grid layout, the sequence advancing, the limit submitting.
- e2e: counts updated to 36; answering every question still reaches the end.

## Docs

`docs/playroom.md` (Questions table and sections, rigging, results). Copy
this plan to `docs/historical-plans/`.
