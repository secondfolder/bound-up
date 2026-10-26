# To-do lists in rich text, tickable where the reader may edit

This plan was never written down before the work: it was settled while reading the code, in the
session that implemented it. What follows is that plan as it stood when implementation began, the
request first.

## The request

> Along side dot point and numbered lists in the rich text editor you should also allow todo
> lists. like how a line starting with `- ` is turned into a dot point item, `[] `, `[ ] ` and
> `[x] ` should be turned into todo list items. To do list items can be checked on or off. And
> unlike every other instance when rich text is displayed as read-only text the checkbox items
> should still be editable if the user has permission to edit the ritch text field and clicking on
> and off will toggle the saved text.

## Format

- Use Lexical's own check list: `ListNode` with `listType: 'check'`, `ListItemNode.checked`. No new
  node.
- `richtext.ts`: `listType` gains `'check'`; `listitem` gains an optional `checked` (anything but
  a boolean reads as absent). A pure `withChecklistItem(doc, { block, item }, checked)` returns
  the document with one root-level item changed and everything else the same objects.

## Editor

- Add Lexical's `CHECK_LIST` markdown shortcut to the `list` feature's transformers (it matches
  `[] `, `[ ] `, `[x] `), and `registerCheckList` beside `registerList`. Same feature as bullets,
  so messages still get none.
- Theme: `list.checklist` / `listitemChecked` / `listitemUnchecked`. Draw the box as the `<li>`'s
  `::before` with Web Awesome's checkbox tokens — `registerCheckList` measures clicks against the
  `::before`'s width from the item's start. Ticked items struck through and quiet.
- `registerCheckList` already refuses to tick when the editor is not editable, which covers a
  read-only notebook entry.

## Reader

- New `RichTextList.svelte` for one list (bullet, number, check), used by `RichText` and by
  `SceneBlock` (whose lists are history-only, so never tickable). Check items are `wa-checkbox`es
  with the item as their label slot (the element forwards no `aria-label`), listened to with
  `addEventListener('change')`, disabled — but readable — when there is no toggle handler.
- `RichText` gains `onChecklistToggle(stored) => Promise<boolean>`. Optimistic: `shownText` is a
  writable `$derived(text)`, set to the toggled document at once and back to `text` on a failed
  save.

## Saving from the task and reward sheets

- The edit actions take the settings as well, and `updateSelfTask` / `updatePartnershipTask`
  recompute `nextEligibleAt` — so re-posting the edit form for a tick would make a completed task
  due again. Instead, a content-only write:
  - `updateSelfTaskContent`, `updatePartnershipTaskContent`, `updateSelfRewardContent`,
    `updatePartnershipRewardContent`: the same permission checks and content checks as the edits,
    compare-and-swap on `revision`, setting only the sealed columns.
  - `taskContentSubmitSchema` / `rewardContentSubmitSchema` and `readSealedTaskContent` /
    `readSealedRewardContent`.
  - Named actions on the list pages (the edit routes have a `default` action, which cannot sit
    beside named ones): `selfTaskContent`, `taskContent`, `selfRewardContent`, `rewardContent`.
- `TaskEntry` / `RewardEntry` gain `contentSave: { action, scope }`, set exactly where `editHref`
  is.
- Browser `description-ticks.ts`: `descriptionSaver` re-seals the opened content with the new
  description (`sealForSubmit`), posts with `x-sveltekit-action`, `deserialize`s the result,
  `invalidateAll()` on success. Saves queue one at a time; a tick overtaken by a later one is
  skipped; the last saved revision is remembered until the reload catches up. Refusals inline in
  the sheet, anything else through `reportRequestFailure`.
- The sheets hold the last opened content through the reload, so the description does not flash
  away while the new ciphertext opens.

## Tests

- Pure: the schema with check lists, the golden round trip through a real Lexical editor,
  `withChecklistItem`.
- Component: typing each shortcut; ticking from the box in the editor, not from the words, not
  while read-only; the reader's boxes, disabled without a handler, optimistic tick and revert.
- Server: each content action saves the content alone (a completed task stays completed, a
  reward keeps its cost), refuses stale revisions, wrong vaults, non-editors and strangers.
- E2E: type a to-do list into a task, tick it from the sheet, reload, see it ticked, and save the
  edit form at the new revision.

## Docs

- `docs/rich-text.md`: a "To-do lists" section, the node set, the file table.
- `docs/tasks.md`, `docs/rewards.md`: the content-only write.

## Added during the work

Asked for after the plan above was under way, and done in the same change:

- A To-do list button on the selection toolbar, beside the other two lists.
- The focus ring of a focused box was clipped on its left in the notebook:
  inset the to-do list (not the box, which `registerCheckList` measures from)
  by the ring's reach, in the editor and the reader.
- Menu items as to-dos: `checked` on `MenuLineNode` and `scene-menu-line`,
  a box drawn beside the words like the rating and number, `[ ] ` typed at an
  item's start, the toolbar button in a menu, Enter and Backspace as in a
  list, and to-dos kept through "Make a menu" and "Convert menu to plain
  text".
