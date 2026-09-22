# Keep message drafts on the device

The request as given (there was no separate plan document), copied exactly:

> It is very important that we never loose a users draft message. Any text typed into the composer should remain there stored on device until it's cleared or sent. This draft should per thread as well as the new message dialog. Make sure the tests confirm that a draft is still there after reloading the page and when editing a draft in one thread it doesn't effect the drafts of others threads or the composer in the new message dialog. Also in the new message thread dialog box the tags should be saved along with the draft. If there is no draft text they don't need to be saved and infact shouldn't. So if you have tags and draft text then you open and close that dialog you should see both the tags and the draft text but then if you delete the draft text and open and close the dialog then you should see neither the tags nor the draft text. I want you to rename privacy.md to user-commitments-and-product-goals.md. Privacy info should then be section within that. Add a new section about our commiment to avoid any situation where the user accidentally looses any data they care about.

Approach decided while implementing it:

- A browser-only `src/lib/messaging/drafts.ts` holds one draft per composer
  (`thread:<threadId>`, `new-thread:<partnershipId>`) in `localStorage`, keyed
  by the account's recipient.
- Each draft is an age file encrypted to the writer's own recipient, so no
  message text is stored on the device in the clear. It is read back with the
  unlocked identity.
- `MessageComposer` takes `initialText` / `onTextChange`. `ThreadView` and
  `NewMessageDialog` open the draft and render the composer only once it has
  been read.
- Tests: unit tests for the draft store, plus Playwright specs for reload
  survival, per-thread isolation, dialog isolation, and the rule that tags are
  kept only while there is text.
