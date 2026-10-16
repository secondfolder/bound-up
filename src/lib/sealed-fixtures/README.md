# Sealed fixtures

One sealed record for every version of every kind in `ALL_SEALED_KINDS`
(`src/lib/sealed-kinds/index.ts`), and the payload it must open to.
`src/lib/sealed-fixtures.test.ts` opens each one on every run and fails for a
version with no fixture.

They exist because a stored record can never be rewritten by the server: if a
kind's name, a version's schema, an upcaster or the envelope changed in a way
that stopped old records opening, nothing else would fail locally — users'
data would simply stop showing. So:

- **Never edit or regenerate an existing fixture** to make a failure go away.
  The failure is the point.
- **A new version of a kind gets a new fixture** with that version, sealed by
  an implementation independent of `crypto/sealed.ts`, with the `expected`
  payload as the *latest* version reads it.
- **Adding a version moves the older fixtures' `expected`, and nothing
  else.** Opening a record upcasts it to the latest version, so once a
  version 2 exists, the version 1 fixture opens to what the upcaster makes of
  it. Update that fixture's `expected` to the upcast value, after reading it
  as a review of the upcaster. Never touch its `ciphertext`, `recordId` or
  `version`: those are the stored record, and they are the part that must
  keep opening. (Daydreams' setup and turn kinds were the first to do this.)
- **All fixtures share one vault**: the key is bytes 0–31, and the vault id is
  the one at the top of `fixtures.json`.

The independent implementation is a few lines of `node:crypto`: AES-256-GCM
under `HKDF-SHA256(key, salt = "", info = "bound-up-vault-enc-v1")`, a random
12-byte IV, associated data
`bound-up-sealed-v1|<kind>|<recordId>|<vaultId>|<version>`, and
`"sb1." + base64url(IV ‖ ciphertext ‖ tag)`.
