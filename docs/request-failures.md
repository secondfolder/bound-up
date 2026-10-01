# Request failures

**Every request the browser sends ends in visible feedback if it fails.** This
became a rule after a signup against a database missing a migration answered
500 and the form simply sat there. superforms' default `onError` rethrows, so
the error reached the console and nothing reached the page.

## Two kinds of failure, two places

- **Expected** failures are answered next to what caused them, by the code
  that knows what they mean: a validation error, a wrong password, a rate
  limit, a file too large, a tag name already taken. Each site already does
  this, with words of its own.
- **Unexpected** failures mean the same thing wherever they happen: the
  server erroring, the network being down, a timeout. They go to one
  app-wide notice, a dismissible `role="alert"` callout at the top of every
  page (`RequestFailureNotice.svelte`, rendered by the root layout).

A site with an inline slot of its own may show the unexpected kind there
instead, using the same wording from `describeRequestFailure` or its
constants. The composer does, so a message that could not be sent is
explained beside the text that is still in the box.

## The pieces

All in `src/lib/request-failure.svelte.ts`:

- `describeRequestFailure(cause)` turns a `Response`, an action error result,
  a thrown error or `null` into a sentence. A status of 5xx blames the server;
  a `TypeError` (what `fetch` throws offline) or a timeout blames the
  connection. superforms and `use:enhance` wrap a submit that never got an
  answer in an error result with a made-up status, so the error inside is
  checked first: otherwise a dropped connection would be blamed on the server.
- `tryFetch(input, init)` is `fetch` that never throws: a request that got no
  answer resolves to `null`, so `if (!response?.ok)` covers both ways a
  request fails. An abort still throws, because cancelling on purpose is not a
  failure. Use it wherever a `fetch` result is acted on.
- `reportRequestFailure(cause, message?)` shows the notice. A newer failure
  replaces the one on screen rather than stacking. The notice clears on
  navigation, because a failure belongs to the page it happened on.

## Forms

**Import `superForm` from `$lib/superform`, never from `sveltekit-superforms`.**
The wrapper adds an `onError` that reports to the notice. Biome's
`noRestrictedImports` makes the library's own export a lint error everywhere
but the wrapper, so a new form cannot quietly go back to silent failures. A
form that passes its own `onError` still gets its own.

A `use:enhance` callback that calls `update()` gets SvelteKit's default for an
error result, which swaps the whole page for the error page. The app's
`use:enhance` forms report an `error` result to the notice instead and return,
so the page and anything typed into it stay put.

## The safety net

`RequestFailureNotice` also listens for `unhandledrejection` and shows the
notice for it. A rejection nothing handled is nearly always a request whose
caller forgot it could fail. It does not `preventDefault()`, so the rejection
still reaches the console and fails the e2e suite's `pageerror` check: the net
is there so a person is told, not so the bug goes unfixed.

## Left silent, deliberately

Background work nobody asked for and nobody waits on stays quiet, because a
notice about it would only alarm: the embed metadata backfill, the legacy
rich-text migration, re-syncing a push subscription on the notifications
screen. Each tries again on its own next time. The same rule decides it every
time: if a person pressed something and is waiting, they are told.

## Testing

- `request-failure.svelte.test.ts`: the wording, `tryFetch`, the notice state.
- `RequestFailureNotice.svelte.test.ts`: showing, dismissing, clearing on
  navigation and the unhandled-rejection net.
- `e2e/request-failures.spec.ts`: a signup answered with a 500, and one whose
  request never arrives, staged with `page.route`, so the suite's shared
  database is never broken on purpose.
