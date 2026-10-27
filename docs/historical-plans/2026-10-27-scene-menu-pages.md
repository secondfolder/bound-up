# Scene menus as their own page

## Context

A scene's menus should be shareable as pages of their own. Today a menu's bin
button only shows while the caret is in the menu, and a menu has no stable
identity: `MenuNode.exportJSON` stores no id, so the only handle is Lexical's
runtime `NodeKey`, which changes on every load. This plan does four things:

- gives menus a persisted id;
- shows the menu's tools (bin, and a new link button) on hover as well as when
  the menu is active;
- adds a link popover that copies the link and offers to open it;
- adds a full-screen menu page. It is read-only by default, with to-dos still
  tickable for writers, and an Edit toggle for anyone with edit permission.

## 1. A persisted menu id

- `src/lib/lexical/nodes/scene/menu.ts`:
  - Add an `__id: string | null` field to `MenuNode`, with a getter and setter.
  - Add it to `SerializedMenuNode`, `exportJSON`/`importJSON`, `clone` and the
    constructor.
  - `$createMenuNode` gives it `crypto.randomUUID()`.
  - `createDOM`/`updateDOM` set `data-menu-id` on the element.
- `src/lib/richtext.ts`: add `id: z.string().nullable().catch(null)` to the
  `scene-menu` schema and type. Nothing on the read path depends on it.
- `src/lib/lexical/plugins/scene-blocks.ts`: register a `MenuNode` transform,
  only while the editor is editable. If a menu has no id (menus from before
  this change), or its id is already used by an earlier menu (a paste or
  duplicate), it sets a fresh one. The change syncs through Yjs like any other
  edit.
- A read-only viewer of an old menu that no writer has opened since has no id
  to link to, so the link button is not drawn for a menu without one.

## 2. Hover-revealed tools, plus a link button

- In `menu.ts` `createDOM`, wrap the existing `.menu-delete` button in a new
  unmanaged `div.menu-tools`, and add `button.menu-link` before the bin:
  - icon `link`, `aria-label`/`title` "Copy a link to this menu";
  - `contentEditable=false`, made unmanaged like the bin is.
- `src/lib/scenes/scene-blocks.css`: move the reveal from
  `.scene-menu.caret-in:not(.surprise) > .menu-delete` to
  `.scene-menu:is(.caret-in, :hover, :focus-within):not(.surprise) > .menu-tools { display: flex }`.
  - Keep the round button styling for both buttons.
  - Hide `.menu-delete` when the editor root is not editable
    (`[contenteditable='false']`), since the delete is refused there anyway.
  - The link button stays for read-only viewers.
- `scene-blocks.ts`:
  - The `press` mousedown guard also covers `.menu-link`.
  - `pick` handles a click on `.menu-link` by dispatching a new
    `MENU_LINK_EVENT` (`CustomEvent`) on the root. Its detail is
    `{ menuId, anchor: button }`, following `MENU_ART_EVENT` and
    `MenuArtPicker`.

## 3. The link popover

- New `src/lib/components/scenes/MenuLinkPopover.svelte`, mounted in
  `CollaborativeEditor.svelte` beside `MenuArtPicker`. It follows
  `MenuArtPicker`'s shape: a root listener and a single `wa-popover` whose
  `anchor` is set from the event.
  - On the event, it starts the clipboard write **synchronously in the click
    handler**, so the user gesture holds, and opens the popover.
  - Status text: "Link copied to your clipboard." or "Couldn't copy the link.
    Select it below." The status is a `role="status"` paragraph.
  - Below that, `InputField readonly selectOnFocus value={link}` with the
    label "Menu link".
  - A `wa-button` "Open" with `href={link} target="_blank"` (it renders an
    anchor). Use `rel="noopener"`.
- `src/lib/share.ts`: export a `copyText(text): Promise<boolean>` built on the
  existing private `writeClipboard` (its timeout and refusal handling), rather
  than a new bare `navigator.clipboard` call.
- The link: `CollaborativeEditor` takes a new `menuLink?: (menuId) => string`
  prop. `NotebookEntryPage` passes it a function built from a new `menuHref`
  route prop. Each route's `+page.svelte` gives `resolve('/home/notebook/[entryId]/menus/[menuId]', …)`
  or the partner equivalent, prefixed with `page.url.origin`.

## 4. InputField: optional superform, plus `selectOnFocus`

`src/lib/components/InputField.svelte`:

- `superform` and `field` become optional. Without them the component:
  - renders the `wa-input` from a `value` prop;
  - builds no `formFieldProxy`;
  - skips the `follow` attachment, constraints and `FieldError`;
  - takes its label from `title`.
- The proxy is created only when a superform is given.
- New `selectOnFocus?: boolean`. When it is true, an attachment selects the
  inner native `input` on `focus` and on `click`. Click is needed because a
  second click on an already-focused field would otherwise collapse the
  selection. This lifts `selectAll` from `kink-list/ShareLink.svelte`, which
  then switches to `InputField` too.
- Document both in the prop JSDoc.

## 5. The menu page

**Routes:**

- `src/routes/(auth-required)/(app)/home/notebook/[entryId]/menus/[menuId]/`
- `src/routes/(auth-required)/(app)/partner/[id]/notebook/[entryId]/menus/[menuId]/`

**Server and access:**

- Each route has a `+page.server.ts` that reuses `loadNotebookEntry` from
  `src/lib/server/notebook-pages.ts` with the same scope arguments as the entry
  page.
  - Add an option to skip the scene extras (prompt column data) it does not
    need.
  - It returns 404 when the entry is not a scene.
- Access is the entry's (`entryAccessFor`). No new permission rules. The
  server cannot see menu ids, since content is sealed, so "no such menu" is
  decided in the browser.

**Inside the app shell, but full screen:**

- The page stays inside `(app)` because `EncryptionGate` and the keyring cache
  live there.
- The `(app)/+layout.svelte` gets a `fullScreen` derived from `page.route.id`
  ending in `/notebook/[entryId]/menus/[menuId]`. It then renders no
  `AppNav`, `HelpRequestCallout`, `HomeScreenHint` or `NotificationsHint`,
  and keeps `EncryptionGate`.

**The page component**, new `src/lib/components/notebook/SceneMenuPage.svelte`:

- It reuses `NotebookSession` setup. Extract the session-building `$effect`
  from `NotebookEntryPage` into a small shared helper, so the two cannot drift.
- It renders `CollaborativeEditor` with a new `onlyMenu={menuId}` prop and
  `readOnly={!(session.canWrite && editing)}`.
- Top-right: an "Edit" `wa-button`, only when `session.canWrite`. It toggles
  to "Done".
- Placeholder while the keyring or session is not ready, per AGENTS.md.
- A "This menu isn't in this scene any more" message with a link to the scene
  when the plugin reports no match.

**`onlyMenu` support**, in `scene-blocks.ts`, as an exported
`registerOnlyMenu(editor, id, onFound)` that `CollaborativeEditor` calls when
the prop is set:

- An update listener puts the class `menu-page` on the root and `only-menu` on
  the matching root child. CSS hides `.menu-page > :not(.only-menu)` and
  `.menu-page .menu-tools`, so there is no delete or link on the page itself.
- It reports found or not found.
- A selection guard moves a caret that leaves the menu back to the menu's
  start or end.
- The menu is drawn at page size, with no app chrome.
- No side panel, prompt column, toolbar or title. `RichTextEditor`'s floating
  toolbar is kept off via a prop.

**To-dos stay tickable while read-only:**

- Add `setTickable(editor, boolean)`, a WeakMap flag in the same way as
  `setSceneViewer` in `src/lib/lexical/nodes/scene/viewer.ts`.
- `listenForCheck` in `menu-line.ts` allows a tick when
  `editor.isEditable() || isTickable(editor)`.
- The page sets it to `session.canWrite`.
- At implementation time, verify that an `editor.update` made while not
  editable still reaches the Yjs binding and the outbox. The e2e test below
  covers it.

## 6. Docs, tests and the roadmap

**Docs:**

- `docs/scenes.md`: menu ids, the tools row, the link popover and the menu
  page (access, read-only ticking, edit toggle, missing menu).
- `docs/notebook.md`: a line about the new routes.
- Copy this plan to `docs/historical-plans/2026-10-27-scene-menu-pages.md`.
- Check `src/lib/roadmap/roadmap.json` for a scenes or menus entry, and add a
  twig if one fits.

**Tests:**

- `src/lib/lexical/plugins/scene-blocks.svelte.test.ts`:
  - a new menu gets an id;
  - an id-less menu gets one when the editor is editable, and not when it is
    read-only;
  - a duplicated id is replaced;
  - `data-menu-id` is drawn;
  - `MENU_LINK_EVENT` fires on a link click;
  - `registerOnlyMenu` hides the other blocks and reports not found;
  - a tick works when read-only but tickable.
- New `src/lib/components/InputField.svelte.test.ts`: standalone with `value`
  and no superform; `selectOnFocus` selects all on click and focus.
- New `src/lib/components/scenes/MenuLinkPopover.svelte.test.ts`, mocking
  `navigator.clipboard.writeText` as `DebugInfo.svelte.test.ts` does: the
  copied status, the failed status, the field value and the Open href.
- `src/lib/richtext.test.ts` (or the existing schema test): `id` survives the
  read path, and an old menu parses as `id: null`.
- `e2e/scenes.spec.ts`:
  - The tools show on hover with the caret outside the menu.
  - The link button copies (grant `clipboard-read`/`clipboard-write`
    permissions) and the popover shows the link.
  - Open goes to a new tab, where the menu fills the page with no AppNav.
  - The page is read-only, and a to-do tick persists after a reload.
  - Edit makes the menu typeable, and the change shows in the scene.
  - A partner with read access sees no Edit button and cannot tick.
  - An unknown menu id shows the missing message.

## Verification

- `npm run check`, `npm run lint`.
- `npx vitest run` on the touched tests.
- `npx playwright test e2e/scenes.spec.ts`, then the full `npm test`.
- Open the dev server: hover a menu, copy the link, open it, tick, edit.
