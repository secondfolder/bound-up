# Daydreams: write out a turn the user only described

## Context

A user in a daydream sometimes writes what their turn should be rather than
the turn itself: "Tell Charlie the fox is safe" instead of the words they say
to Charlie. Today the model reads that as an action, a direction or co-writing
(`readAs`), and answers it as one, so the story has no turn in which the user
actually tells Charlie anything.

The request: the model should notice such an instruction, first write it out
as the user's full turn (the user telling Charlie the fox is safe), and then
answer that turn. The user's bubble shows the written-out turn, with a control
to switch between it and what they actually sent.

## Decisions

- **One request, not two.** The model writes the turn out at the start of the
  same reply, in a leading block, before the passage:

      <yours>
      "Charlie — the fox is safe. I promise."
      </yours>
      The passage…
      <meta>{… "readAs": "instruction"}</meta>

  A separate "expand" call first would double the latency and cost of every
  sent turn just to find out most of them need nothing. A leading block also
  means the model writes the passage *after* the turn it is answering, so it
  answers the written-out words, not the instruction.
- **Stored on the passage, like `readAs`.** Turns never change once written
  (quote offsets depend on it), so the user's turn keeps what they sent and
  the written-out turn goes in the following passage's meta as `expansion`.
  That is also already how `readAs` reaches the user's bubble. Consequence:
  "Write again" on that passage writes the turn out afresh, and each take
  carries its own — which is coherent, as each take answers its own wording.
- **The model is sent the written-out turn afterwards.** When a user turn on
  the branch is followed by a passage with an `expansion`, the context sends
  the expansion in place of the instruction, so the story the model reads is
  the story the user sees. A rewrite of that passage sends and keeps the same
  expansion rather than writing the turn out again.
- **Only when the user is in the story.** A watching user (`stance: absent`)
  has no turn of their own to write out; their instructions are directions.
  Explicit out-of-character turns are never written out.
- **A new turn version (v3).** `passageMetaSchema` gains `expansion` and the
  `instruction` reading. v2 is frozen, so its meta schema is kept as it was
  and v3 is v2 with the new meta; the upcast is the identity. New fixture.
- **Streaming.** While the block arrives it shows in the user's bubble, and the
  passage bubble keeps its spinner; nothing of the tags flickers on screen.
  An unclosed block degrades: no expansion, the rest kept as the passage.
- **UI.** The bubble shows the written-out turn by default, with a quiet
  "written out from your note" label and a plain button to "Show what you
  wrote" / "Show it written out". Showing the original styles the bubble as a
  note (italic) so the two are not confused.

## Steps

1. `sealed-kinds/daydreams.ts`: frozen v2 meta, v3 meta and turn v3; fixture.
2. `daydream/reply-format.ts`: parse the leading block, live and finished.
3. `daydream/client.ts`: `writeReply` reports the expansion as it streams.
4. `daydream/context.ts`: send the expansion in place of a written-out turn.
5. `daydream/story.svelte.ts`: stream it, store it, carry it through a rewrite.
6. `server/daydream/prompt.ts`: the reading, the format, the user-side carve-out.
7. `DaydreamUserTurn.svelte` / `DaydreamThread.svelte`: show it and toggle.
8. Model stub + e2e, unit and component tests; docs/daydreams.md.

## Extended during implementation (2026-10-18, at the user's request)

The user asked, mid-way, for the composer to tell an instruction for the
user's own turn apart from a general direction for the story ("Make the
story super steamy"), and to let them override how a turn was read:

- A turn read as a direction is treated exactly like a direction button and
  drawn as a direction marker, not a speech bubble. The prompt says so
  explicitly.
- Every turn the user wrote gets a "Read it differently" menu. Picking a
  reading forks: the user is moved to their turn and a new passage is written
  after it with the reading forced, beside the existing one (or the one still
  arriving, which is stopped and kept). The forced reading is sent as a note
  before the user's words (a direction as `(Direction: …)`), recorded on the
  passage as `readAsChosen`, and kept by later requests, Write again and
  rewrites. v3 had not shipped, so it gained the field in place.

Then, after the user tried it against the real model: "Make the story super
steamy" sent after a fork was not read as a direction. The model named its
reading only in the trailing metadata, after writing the passage. So a reply
to words the user wrote now opens with `<reading>…</reading>`, deciding the
reading before anything else; the page draws the turn as read as soon as
that tag arrives, and it outranks the metadata's `readAs` (kept as a
fallback). Probed against the configured model: direction, instruction and
action phrasings each came back with the right opening reading.
