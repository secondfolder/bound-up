# User commitments and product goals

What this app promises the people who use it. These are product rules, not
soft preferences: a feature that breaks one is broken, however well it works
otherwise. Each section says what the commitment is, what it means in
practice, and where the code that keeps it lives.

## Never lose data a user cares about

Nobody should ever lose something they made in this app by accident — not to a
reload, a crashed tab, a closed dialog, a phone that evicted the page in the
background, a misclick or a flaky connection. Words someone has typed are the
clearest case, because they cannot be recovered from anywhere else and people
notice their loss immediately.

In practice that means:

- **Anything typed is kept until the user sends it or clears it.** Losing an
  unsent message is the failure this commitment was written for, so every
  message composer keeps a draft on the device: the reply box of each thread,
  and the new-message dialog of each partnership. A draft survives a reload,
  navigation, closing the dialog, locking the device and signing out. It goes
  only when it is sent, or when its text is deleted. Drafts are per composer,
  so writing in one thread never touches another thread's draft or the
  new-message draft. See [`docs/messaging.md`](messaging.md#drafts) and
  `src/lib/messaging/drafts.ts`.
- **Context that belongs to the unsent thing is kept with it.** The tags chosen
  in the new-message dialog are part of its draft. They are kept only while
  there is text, because tags on their own are not a message anyone is in the
  middle of writing, and bringing them back into an empty dialog would look
  like a bug.
- **A failure keeps what it failed to save.** A send that fails leaves the text
  in the composer and the draft on the device. Nothing is cleared until the
  server has confirmed it holds the thing being cleared.
- **Keeping data must not weaken privacy.** Data kept on the device follows the
  same rules as data sent to the server (see [Privacy](#privacy) below): a draft
  is encrypted to the writer's own key before it is stored, so this is not the
  one place message text sits on disk in the clear. When the two commitments
  conflict, find a design that keeps both. Do not trade one for the other.
- **Removing something is a deliberate act.** An irreversible deletion or
  replacement is something the user chose, with enough context to know what
  goes. When unreadable data turns up (a draft sealed to a key that has since
  changed, say), leave it where it is rather than tidying it away.

Known limits, stated honestly:

- Drafts keep text and tags. Attachments are not copied into browser storage.
  The files are still on the device they were picked from, but they have to be
  picked again after a reload.
- An account with no message keys has nothing to encrypt a draft to, so its
  composer keeps no draft. Storing that one case in plaintext would break the
  privacy commitment.
- A draft is encrypted before it is written, which takes a few milliseconds.
  A reload inside that window loses the last keystroke or so.
- Browser storage belongs to the browser. Clearing site data, or a private
  window closing, removes drafts along with everything else stored on the
  device.

When adding a feature, ask: if the tab died at every step of this flow, what
would the user have lost, and would they care? If they would, it needs keeping
until the user says otherwise.

## Privacy

Privacy is a product rule in this app, not a soft preference.

### Baseline rule

A user must not be able to read, infer, or probe another user's information
just by knowing or guessing an id, URL, email, or other identifier. Data is
shown only on routes and queries that have already established the viewer is
allowed to see it.

In practice that means:

- Unrelated accounts do not get access to each other's profile details.
- A route that reveals relationship data first proves membership in that
  relationship.
- Public pages show only the minimum information they need.

### Partners are not blanket access

Being linked as partners does not mean "show them everything". A partnership is
permission to reveal only the fields the product has explicitly decided are
shared in that context.

Current examples:

- Partner pages can show counterpart information that is deliberately shared
  through membership-checked partnership reads, such as the partner timezone
  display.
- The public invite page does not reveal an email address, account id, or full
  account profile. It shows only the inviter-chosen name needed to explain the
  invite.
- Other account details stay private unless the product adds an explicit reason
  and a guarded read path to reveal them.

### User choice still matters

Even inside shared surfaces, some information may remain intentionally private
or become selectively shareable later. Future work should preserve that option
instead of treating a partnership as permanent permission to expose every
account attribute.

### Especially sensitive data should be zero-access by default

For particularly sensitive user information — intimate photos are the obvious
example — the product goal is zero-access storage: encrypt it before it leaves
the user's device and keep the server out of the plaintext path.

In other words, this class of data should be treated as end-to-end encrypted in
the product sense: the app stores ciphertext and should have no routine access
to the contents.

When implementing that, be precise about the guarantee and document the exact
boundary the same way [`docs/encryption.md`](encryption.md) does. That document
spells out the difference between "the server stores ciphertext only" and the
stronger guarantees people often assume from the phrase "end-to-end
encrypted".

The messaging feature now has one explicit derived-data exception worth naming:
the browser may send supported URLs from a decrypted message to Bound Up's own
`/api/embed-metadata` endpoint so it can resolve a preview and hand it back for
encryption into the message's metadata sidecar. A reddit URL may also reach the
server through `/api/oembed`, because reddit's oEmbed API is CORS-blocked. That
does widen what the server may transiently receive, but the derived preview is
still stored only as ciphertext in the database.

Those URL disclosures happen when a URL is typed into the composer (the embed
shown there is the real one, resolved the same way), at send time, when a reader
presses `Show` on a link (the details are looked up before the card goes in),
and when an embed with no cached preview reaches the scrollport. There is deliberately no per-account opt-in
gate in front of them: the lookups are not logged, and an embed only exists
because the sender put it in the message or because this reader pressed `Show`
for a link beside it. The scrollport wait that remains is about request volume,
not consent.

### Design rule for new features

When adding a field or screen, ask two separate questions:

1. Should this viewer be able to reach this data at all?
2. If yes, which exact fields are intentionally shared here?

Do not answer the second question with "all of them" just because the first one
was yes.
