# Plan: embeds without a preference

The account-level embed auto-load preference is being removed. It was the wrong
scope — an account setting for something that is really a property of a
conversation, so one partner could have embeds on while the other did not and
neither could tell why. The privacy argument behind the gate is also weaker
than it was made out to be: message bodies have to be stored, which is what the
encryption is for, but embed lookups are not logged, and someone who trusts the
service enough to use it can reasonably expect a link to preview itself.

1. Delete the preference entirely: the `user_keys.embed_auto_load` column and
   its migration, `/api/account/embed-auto-load`, the client helper that posts
   to it, the localStorage device overrides and prompt counter, the third-Show
   consent dialog in the thread, and the control on the Encrypted messages
   settings page. Keep the viewport activation heuristic, which is about
   request volume rather than consent.

2. In the composer, keep inserting an embed above the paragraph as soon as the
   caret leaves a finished auto-link, and give the chip an explicit remove
   button rather than leaving deletion as the only way out.

3. Make removal stick. Removing an embed for a URL that is still in the
   document marks that URL dismissed for the life of that editor, so moving the
   caret back onto the link and off again — or editing it and clicking away —
   does not resurrect it.

4. Offer a way back: hovering an embeddable link that has no embed shows a
   small embed icon centred over the link, and clicking it inserts the embed
   and clears the dismissal.

5. On the read side, render whatever embeds the message actually carries. No
   click gate, including for reddit.

6. For an embeddable URL in the prose that has no embed of its own, keep the
   existing `Show` button to the right of the link. Clicking it inserts an
   embed card between that paragraph and the one above it and hides the button.
   The reveal is view state only: a reload brings the button back.

7. If the inserted card lands outside the scrollport — a long paragraph puts it
   well above the link that produced it — smooth-scroll to it.

8. Defer only the embeds that need a metadata round trip before they can draw
   anything. Images and curated players render immediately and lean on
   `loading="lazy"`; oEmbed and reddit embeds show a skeleton and fetch when
   they are in or near the scrollport.

9. Cover the new behaviour: component tests for sticky dismissal and the
   hover re-insert in the composer, for the reader's `Show` button and its
   ephemeral card, and for the activation heuristic; browser coverage for
   embeds rendering without a gate and for a reveal not surviving a reload.

10. Update the embeds, messaging, encryption, privacy and rich-text docs to
    describe this, and remove what they say about the preference and the
    consent prompt.
