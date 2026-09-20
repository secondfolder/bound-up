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
button back.

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
  a provider answers, so they render a stable skeleton and start the request
  only when they are in or near the scrollport.

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
