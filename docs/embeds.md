# Embeds

URL rendering is split into two jobs:

1. `RichText.svelte` tokenises prose with `linkifyjs` and emits escaped text
   nodes plus real anchors.
2. `UrlEmbed.svelte` decides whether a URL becomes an inline embed, a metadata
   card, or stays a plain link.

For messages specifically, there is a third piece in the flow: the browser may
cache resolved preview data for supported URLs in an encrypted
`metadataCiphertext` sidecar on the message row. That cache is used first for
board previews and inline message embeds, and is filled at send time for new
messages. Older rows are backfilled the first time an embed with no cached
entry actually loads.

**Whether a message has an embed is decided by whoever wrote it, not by a
setting.** There is no per-account preference and no consent gate: an embed the
sender left in the message renders, and a link they did not embed renders as a
link with a `Show` button the reader can press for themselves. That reveal is
view state only — the sender's message is unchanged, and a reload brings the
button back. The button spins until the details are in, and a failed lookup
still inserts a card titled with the error; see
[docs/rich-text.md](rich-text.md).

An embed draws at the start of the line its URL is on, in the composer and in
the thread alike — the composer shows the real `UrlEmbed`, not a placeholder.
Where the node lives to make that work is [docs/rich-text.md](rich-text.md).

The current scope is every prose field the app renders for a user: message
bodies, task titles and descriptions, task-completion messages, reward titles
and descriptions, reward history descriptions, and edge-task reveal prose.
Identifier fields are deliberately excluded: partner names, email addresses,
passkey names, thread tags, attachment filenames, and guide titles are still
plain text.

## Providers

The provider map is deliberately small and explicit where the payoff is high:

- Redgifs: `redgifs.com/watch/<id>` and `redgifs.com/ifr/<id>` become the
  documented `https://www.redgifs.com/ifr/<id>` player.
- YouTube: `youtube.com/watch?v=...`, `youtu.be/...`, and Shorts URLs become a
  `youtube-nocookie.com` player.
- Direct image URLs: known image extensions (`jpg`, `png`, `gif`, `webp`,
  `avif`) become plain `<img>` embeds.
- Reddit: post permalinks and share links go through the special path below.
- A curated set of other hosts goes through `https://noembed.com/embed?url=...`
  for metadata and, when the returned HTML contains a plain iframe, a
  sandboxed player.

If a host is unknown, if a provider is down, or if the response does not hand
back a directly usable iframe, the URL still renders as a normal clickable
link. The failure mode is always "link still works", never a broken message.

## Reddit

Reddit is the awkward one.

The browser cannot fetch reddit's oEmbed endpoint directly because
`https://www.reddit.com/oembed?url=...` sends no CORS headers, and
`noembed.com` does not support reddit at all. So reddit URLs are the one case
that reaches the server.

- `/api/oembed` accepts only reddit post URLs, requires a session, resolves
  share links (`/r/<sub>/s/<id>`) to their canonical comment thread, and fetches
  reddit's oEmbed server-side.
- It is called when the embed reaches the scrollport, not on a click. Those
  lookups are not logged, and the alternative — a button in front of every
  reddit link somebody deliberately embedded — asked the reader to consent to
  something the sender had already decided.

The proxy returns two things the client cares about:

- `permalink`: the canonical reddit post URL.
- `outbound`: the URL the reddit post links to, extracted from the post's RSS
  entry when one exists.

`outbound` matters because reddit's own embed frame serves dead preview images
for some NSFW posts. When the post links to something we already embed natively

- the important case here is Redgifs - the client uses that outbound URL and
  renders the real media instead of the reddit frame. If there is no embeddable
  outbound URL, the client falls back to `embed.reddit.com` for the post itself.

This is still the only place where a reddit URL is sent for a live embed.

Message metadata caching widens the privacy boundary deliberately: while a URL
is being written, at send time, and the first time an embed with no cached
entry loads, the browser may send that supported URL to `/api/embed-metadata`
so Bound Up can resolve a first-party preview and the client can encrypt it
into the message's metadata sidecar. The database still stores only ciphertext
for that sidecar.

## Safety model

Two rules carry the security weight:

1. Only `http:` and `https:` URLs are ever allowed through to `href`, `src`, or
   iframe URLs. `javascript:`, `data:`, `vbscript:` and similar schemes are
   rejected before rendering.
2. The app no longer renders third-party embed HTML with `{@html}`. For
   generic oEmbed providers it will only extract a plain iframe `src` and
   sandbox that iframe itself; richer HTML falls back to a metadata card.

The iframe sandbox is the same posture used for the rest of the app's hosted
players: scripts may run inside the embedded origin, but the frame cannot
navigate the top page away.

## The head row

Every embed that has something to say about itself, or something that can be
done to it, draws a head row: the site and title on the left as a link, and an
actions section on the right.

**The actions section exists only when something is in it.** An embed with no
buttons has no row, so a bare player or a lone image looks exactly as it did
before the row existed. The reverse is also true and is the point of the
design: an embed with no card of its own grows a head _because_ of its buttons,
so they have something to sit beside instead of floating over the media.

Three sources feed it, in this order:

1. Whatever the surrounding component passes as the `actions` snippet prop.
   `ComposerEmbed.svelte` puts its "remove" button there.
2. The "Open" button, on a narrow window (below). It is the row's one labelled
   action, because it is the only way to reach the embed's content there.
3. The refresh button, when the embed is drawn from a cached entry the viewer
   can ask to have re-resolved.

Buttons floated over a corner of the media before this, which does not survive
a second one — remove and refresh would have landed on top of each other. Two
details are load-bearing:

- **Action buttons are sized in absolute units, not around their contents.** A
  `wa-icon` fetches its SVG, so a button sized to its icon is one height before
  that lands and another after, reflowing the row under whatever is being read
  or pressed.
- **The card's thumbnail is no longer a link.** It used to sit inside the card's
  anchor; the head row's anchor holds only the text. A second link to the same
  place with no text of its own is a name-less entry in a screen reader's link
  list, so the title above it carries the link instead.

In the composer everything in the preview is inert except remove: a click
inside the editable surface belongs to the editor, which selects the widget it
landed on.

## Narrow windows

Below 640px — the same breakpoint the rest of the app treats as "phone" — an
embed that would be an iframe is not framed in place. A hosted player's chrome
is built for a desktop-sized frame: squeezed into a phone-width message bubble,
reddit's header, vote rail and "open in app" bar cover most of the post they
wrap. Rather than restyle an iframe we do not control, `UrlEmbed.svelte` puts an
"Open" button in the head row and builds the frame inside a near-fullscreen
`wa-dialog` when the reader presses it. The dialog is headed by the site and the
title, and carries its own close button.

Three consequences worth knowing:

- **Nothing loads until it is asked for.** The frame is built when the dialog
  opens and unmounted when it closes, which is also the only thing that
  reliably stops a player left running.
- **The breakpoint is live.** Turning a phone landscape crosses back over it,
  the inline frame returns, and an open dialog closes with it.
- **`narrow` starts false and is corrected in an effect**, rather than read
  from `matchMedia` during initialisation, because the first client render has
  to match the server's or Svelte logs a hydration mismatch — which the e2e
  fixture fails a run on. So an SSR-rendered page briefly carries the iframe in
  its markup on a phone. A message thread never does: it is decrypted and
  rendered client-side well after the effect has settled.

Cards and images are untouched: they read fine at any width.

## Caching

`src/lib/embeds.ts` keeps a module-level cache of oEmbed responses in the
browser. Re-renders and `invalidate()` calls reuse the cached response instead
of hitting the same provider repeatedly.

Messages also have a persistent encrypted cache in `messages.metadata_ciphertext`.
New sends try to fill it before posting the message. Older rows fill it the
first time an embed loads with no cached entry for that URL — which, because
activation waits for the scrollport, means the ones the reader actually
reaches. Once a cached entry exists it is reused, but the embed offers a small
manual refresh button so the viewer can ask for fresh details and rewrite just
that one cached URL entry.

## Activation

`UrlEmbed.svelte` splits embeds by whether they can draw anything on their own.

- **Images and curated players** (redgifs, youtube, a direct image URL, and
  anything a cached metadata entry already describes) render straight away.
  Their URL is deterministic, so they are SSR-safe, and `loading="lazy"` keeps
  an off-screen one off the network without any help.
- **oEmbed and reddit embeds with nothing cached** have no picture to draw until
  a provider answers, so they render nothing and start the request only when
  they are in or near the scrollport. The same holds while a message's cached
  metadata is still decrypting, and in the composer while it resolves the
  preview the reader will get.

There is no loading skeleton. It used to draw one, and every embed flashed
twice — the skeleton, then the real thing replacing it a moment later. In the
composer those lookups run while the writer is still typing, so nothing is
waiting on them and the immediacy was not worth the second flash. An embed now
appears once, fully formed. The empty `.url-embed` wrapper is still in the
document while it waits, because the `IntersectionObserver` below watches it.

That split is about request volume, not consent: opening a thread must not fire
a metadata lookup for every link in a year of conversation. The delay heuristic
lives in `src/lib/embed-activation.ts` — faster scroll velocity adds a short
delay, and stopping with the embed still near view collapses that delay so it
loads promptly where the reader actually paused.

The same `IntersectionObserver` decides when to report an activation back to
the thread, which is what fills the encrypted metadata sidecar for a URL that
has no cached entry yet.

Failures are cached too as `'error'`, because a dead provider should degrade to
one quiet plain link, not a refetch storm.

## Request queue

Every background embed lookup in the browser — the reader's oEmbed fetch
(noembed direct, or `/api/oembed` for reddit), the composer's per-URL
`fetchEmbedDetails`, and the metadata backfill a thread fires as an uncached
embed scrolls into view — goes
through one page-wide FIFO queue in `src/lib/embeds.ts` that lets at most
`MAX_CONCURRENT_EMBED_REQUESTS` (3) run at once. Pasting text with a hundred
links in it makes a hundred embed nodes, and without the queue that was a
hundred simultaneous requests at noembed and reddit. They share one queue
because they end up at the same providers. A request holds its slot until its
body has been read, not just its headers. The queue itself is
`createLimiter` in `src/lib/concurrency.ts`.

A queued lookup gives up after `EMBED_REQUEST_TIMEOUT_MS` (15 seconds). The
queue introduced that need: without it, a request that never answered held up
only its own embed, but with it three such requests would stall every embed on
the page. A timed-out lookup fails, and is remembered, like any other failure.

The send path's batched `fetchEmbedMetadata(urls)` and the refresh button skip
the queue: the writer is waiting on those, and they should not sit behind
background previews. They are one request to our own server anyway, and
`/api/embed-metadata` caps its own fan-out to the providers at the same three
per request (`mapWithConcurrency`). Per request rather than per isolate, because
a Worker isolate is shared by unrelated requests and a module-level queue would
let one person's paste slow down everyone else's.

A queued lookup is not cancelled if its embed is removed or scrolled away
before it starts. It still runs, and its answer lands in the page cache, where
the next embed for that URL uses it.
