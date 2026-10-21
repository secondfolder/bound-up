# Write again: another take

The plan as it was agreed in chat, before implementation.

## Why

"Write again" sends exactly the same request as the original take, at the
same temperature (0.9). The model never sees the take it's replacing, so the
only source of difference is random sampling, and a long, specific context
pulls it back to much the same passage. That's also why the anti-repeat lines
added to the writing guide don't help here.

## What

- **Show the model the previous take(s)** with a note like "the user asked
  for another take; go a different way: a different beat, line of dialogue or
  direction". The "Rewrite" action already does this: it stores the request
  on the new passage, so the history still replays exactly and caching isn't
  affected. Write again could reuse that with different wording. The cost is
  the old passage's text added to one request.
- **Raise the temperature a little for Write again only**, to around
  1.0–1.1. Much higher tends to break the reply format (the `<meta>` JSON
  especially) and makes the story lose track of details. Some reasoning
  models also ignore temperature, so the note is the part that reliably
  works.

## How

- The request: a rewrite with `again: true`, given the take being replaced.
- The prompt: a new "another take" note asking for a passage that goes a
  different way.
- The temperature: 1.05 for another take, instead of 0.9.
- Storage: turn v8, so the passage records `rewriteOf.again` and later
  requests replay it as sent.
- The catalogue: a new `again` state on the reply axis.
