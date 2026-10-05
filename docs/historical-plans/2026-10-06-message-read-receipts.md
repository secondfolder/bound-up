# Message read receipts (plan)

Requested in chat on 2026-10-06: "I want you to add read receipts to messages
and show a little avatar under the most recent message in a thread the other
person has seen." No plan was proposed in chat before implementation; this is
the design as decided before the code was written, recorded so the directory
has it.

1. **No new storage.** `thread_reads.last_read_message_at` already records how
   far each member has read each thread. A message is seen by the partner when
   its `created_at` is at or before the partner's mark — the unread rule run
   from the other side, so "seen" and "unread" cannot disagree.
2. **`getThread` reads the partner's read row** alongside its other queries and
   returns `seenMessageId`: the newest message the partner has read, if it is
   the viewer's own. If it is the partner's own message, they have replied, and
   no receipt is shown.
3. **The avatar** is the partner's `wa-avatar` (image or initials), small,
   labelled "Seen by <name>", inside the message's `<li>` under the bubble.
4. **Live.** `markThreadOpened` reports whether the read mark moved; the thread
   page's load then publishes a new `read` realtime event. Thread pages
   already reload on any event about their thread; the board ignores `read`.
   Publishing only on a move is what stops two open thread pages from
   triggering each other's reloads for ever.
5. **Tests** at each level: the pure rule, `getThread` and `markThreadOpened`
   against a real database, the load publishing (and not re-publishing), the
   component, and a two-browser Playwright test of the avatar moving live.
6. **Docs**: a "Read receipts" section in `docs/messaging.md`, and a roadmap
   twig under Messages.
