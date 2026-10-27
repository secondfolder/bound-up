# Realtime

How a change made on one device reaches the others while they are looking:
one room per scope, shared by every realtime feature, with each stream
subscribed to the topics its page needs. Messaging and the notebook use it
today. Feature-specific rules (what a frame may say, what a page does with
one) are in [messaging.md](messaging.md#realtime) and
[notebook.md](notebook.md#live-editing).

## The shape of it

- **A room is a scope**: `partnership:<id>` (both partners) or `user:<id>`
  (one account's devices). The key is what `idFromName` hashes, so every
  device derives the same Durable Object without an id being stored
  anywhere.
- **A stream names topics** when it opens: `messages`, `notebook` (a list),
  `notebook-entry:<id>` (one entry's edits and cursors). The events endpoint,
  `GET /api/realtime/events?room=…&topic=…&stream=…`, authorises the room and
  every topic before the stream opens (`mayWatch` in
  `server/realtime/topics.ts`), and a stream's topics never change after
  that. Anything refused is a 404, the same as a room that does not exist,
  so a refusal never confirms an id is real; that covers a notebook entry
  hidden from the viewer.
- **A publish names one topic**, and only streams subscribed to it receive
  the frame. It returns the watchers of that topic only, which is what keeps
  push suppression meaning "this device is showing the message board" rather
  than "this device has any page of this partnership open".
- **A frame is an opaque string to the room**: an SSE event named by its
  topic, whose data the publishing feature decides. What a feature may put in
  one is that feature's rule, kept in its own publish helper.
- **Evicting** closes one user's streams on one topic, for when they may no
  longer read it (a notebook entry just hidden from them). The whole stream
  closes, because its topics are fixed; the page reconnects with what it may
  still have.

**One room for every feature, not one per feature**, because a Durable Object
is billed per open stream and request, not per class or instance, so splitting
them saves nothing; one class means one binding, one `exports` entry, one
previews entry and one local backend; and the lease below is the subtle part,
and there should be exactly one copy of it. A page that needs two topics in
one room opens one stream, not two. The class is still `RealtimeRoom`: renaming
a Durable Object class takes a one-way tombstone in `exports`, and the name is
accurate as it is.

**A list in Everyone opens no stream.** The notebook list and the messages
board each show every partnership at once in the Everyone context
([contexts.md](contexts.md)), and watching that would take a stream per
partnership. They reload when their tab is looked at again instead
([notebook.md](notebook.md#the-list-in-every-context),
[messaging.md](messaging.md#realtime)). Fanning list events out to each
member's `user:<id>` room, so one stream covers Everyone, is not built yet.

**SSE, not WebSocket**, for a decisive reason: `vite dev` cannot serve a
WebSocket upgrade from a `+server.ts` at all, so a socket would need a second
client code path used only in development, and the Playwright suite would then
never exercise the real one. An SSE stream is a plain streaming `Response` and
behaves identically in dev and on Workers. Anything a page sends goes up as an
ordinary POST to the feature's own endpoint, which publishes after it has
checked and stored what it must.

The backend switch mirrors `db/backend.ts` and `media/backend.ts`: a Durable
Object on Workers, a module-level `Map` under `vite dev` and in the self-hosted
Docker build, which is genuinely correct there because each is one process,
and is why a self-hosted instance supports one replica only.

The browser half is `watchRoom` in `src/lib/realtime/live.ts`;
`watchPartnership` (messaging) and the notebook session wrap it.

**A queue limit in bytes as well as frames.** A client that stops reading is
dropped once its queue is full, which is safe because reconnecting resyncs.
Message frames are a few dozen bytes and notebook frames can be tens of
kilobytes, so the queue is measured in bytes (`SSE_QUEUE_BYTES`, 1 MB), with
each frame charged at least a sixteenth of it (`queuedSize`), so sixteen small
frames still fill it as they always did.

## Hanging up when hidden is a billing necessity

A Durable Object is billed at 128 MB × wall-clock for as long as it holds an
in-flight request, and only _hibernation-eligible_ idleness is free —
hibernation needs the WebSocket Hibernation API, which SSE cannot use. One
permanently-open stream is roughly 10,800 GB-s a day: about **83% of the free
plan's 13,000 GB-s daily allowance, for a single partnership idling in a
background tab.**

So the client closes the stream on `visibilitychange`, and says goodbye as it
does (see the next section), because closing alone does not end the object's
request. The step that makes hanging up _safe_ is the reconnect: on becoming
visible it resyncs once, unconditionally, before any event arrives. Anything
that happened while hung up was never delivered and never will be. **Do not
remove one without the other.**

## A stream is a lease

**On Workers, a browser closing its `EventSource` does not reach the Durable
Object.** Neither the request's abort signal nor a failing write tells the room
the client went. On the preview, a phone that had left the board was still
listed as watching it minutes later. A listed device is not sent push
notifications, so it got none.

So the room does not rely on noticing. Each connection is a lease:

- **The page names its stream.** Every `EventSource` carries a random `stream`
  id, chosen fresh per connection; the events endpoint refuses one without.
- **It renews while open,** every 25 seconds, by beacon to
  `POST /api/realtime/presence` with `{ stream, present: true }`.
- **It says goodbye as it closes,** on teardown or when hidden, with
  `present: false`. A beacon, because the goodbye is sent as the page goes away,
  which a `fetch` may not survive. The room closes that stream at once.
- **A stream not heard from for `PRESENCE_TTL_MS` (60 s) is closed** and no
  longer reported as watching: on its next keepalive, or at the next publish,
  whichever is first. That covers a goodbye that never got out, such as a phone
  locked before it could send one, and it is also what stops a dead stream
  keeping the object billed.

The id is per connection rather than per device so that a goodbye names one
stream exactly. Leaving the board for a thread closes one stream and opens
another; whichever of the goodbye and the new stream reaches the room first,
the new one survives. It is also why a second tab on the same device keeps its
own feed. Presence is matched on the session's user as well as the stream id,
so naming somebody else's stream does nothing, and the endpoint checks
membership, so it cannot make a room exist for an arbitrary id.

The cost is one Worker request and one Durable Object request every 25
seconds per page that is actually on screen, plus one D1 read for the
membership check. Nothing is sent while hidden. The local notifier keeps the
same lease, although Node does notice a hang-up, so that both backends behave
the same and the Playwright suite exercises the rule production relies on.

The same reasoning covers a client that stops reading without hanging up
(asleep, or behind a proxy that buffers `text/event-stream`): once its queue
fills, the object disconnects it rather than growing an unbounded queue, because
reconnecting refetches anyway.

`EventSource` retries by itself but eagerly and without a ceiling, so `onerror`
closes and reschedules by hand with exponential backoff and ±20% jitter. The
attempt counter resets **on the first message received**, not on connect: a
proxy that accepts the connection and then delivers nothing would otherwise
never look like a failure. After several consecutive failures the client falls
back to slow polling while visible, which is the honest answer to an
intermediary that buffers the stream for ever.

On a reconnect after a dropped stream, `watchRoom` resyncs when the new stream
opens (its `onopen`, which fires when the room's preamble arrives) rather than
when it decides to retry: anything published between a resync and the room
taking the new stream would otherwise fall into the gap.

## Exporting the class from a generated worker

A Durable Object class has to be exported from the worker's own module, and the
SvelteKit adapter _generates_ that module — so there is nowhere in the source
tree to write the export.

A hand-written entry that re-exports both cannot fill the gap either, because
`main` would have to point at it and `@sveltejs/adapter-cloudflare` treats
`main` as its _output_ path, `rimraf`ing it before writing: the build would
delete the file. (This repo tried that for a while, with `main` left on the
adapter default and the real entry passed positionally —
`wrangler deploy worker.ts`. It works, but every caller has to know, and
Cloudflare's deploy-on-push runs `npx wrangler deploy` for you, so it silently
deployed a worker with no Durable Object export and failed.)

So the export is appended to the generated worker instead, by the
`sveltekit-cloudflare-do` plugin in `vite.config.ts`, which runs after the
adapter has written the file. It emits a named re-export rather than
`export * from`, because wrangler only resolves `DurableObjectNamespace<T>`
through named ones. Wrangler then takes no entry argument anywhere:
`wrangler dev`, `wrangler deploy`, and Cloudflare's own default deploy command
are all correct.

`wrangler.jsonc` also gains a top-level `exports` map, which has **nothing** to
do with `d1_databases[0].migrations_dir` beside it: that one is SQL applied by
the `db:migrate:*` scripts, this one is Durable Object class lifecycle. It
carries no schema — the class stores nothing — and wrangler applies it on
deploy.

```jsonc
"exports": {
	"RealtimeRoom": { "type": "durable-object", "storage": "sqlite" }
}
```

This is the declarative replacement for the legacy tagged `migrations` array
(`{ "tag": "v1", "new_sqlite_classes": ["RealtimeRoom"] }`). The two are mutually
exclusive and the move is one-way: once a Worker is deployed with `exports`, a
later deploy cannot return to `migrations`. Renames, deletions and transfers are
expressed here as tombstones — `"state": "renamed"` with `renamed_to`, and so on
— rather than as a new tag.

`"storage": "sqlite"`, not `"legacy-kv"`, because SQLite-backed Durable Objects
are the only kind available on the Workers Free plan. The choice is permanent:
storage backends are immutable once provisioned, so changing it later means
deleting the namespace and its data. This class stores nothing either way.

One deployment consequence: Durable Object lifecycle changes apply only through
`wrangler deploy`, so the namespace has to be created by a production-branch
deploy. A Worker Preview of another branch then gets an isolated namespace of
its own, as long as the `previews` block in `wrangler.jsonc` declares the
`REALTIME` binding; without it, `env.REALTIME` is absent and the live feed
throws.
