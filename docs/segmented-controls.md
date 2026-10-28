# Segmented controls and tabs

One look for "choose one of these few": a pill holding the options, the chosen
one filled. The fill is a single element that **slides and resizes** onto
whatever is chosen. Every tab in the app and every button-style radio group
are drawn this way, from two components:

- **`RadioButtonGroup`** + **`RadioButton`**
  (`src/lib/components/segmented/`): the control itself, shaped like
  `wa-radio-group` + `wa-radio`.
- **`TabGroup`** + **`Tab`** + **`TabPanel`** (`src/lib/components/tabs/`):
  tabs over panels, shaped like `wa-tab-group` + `wa-tab` + `wa-tab-panel`,
  drawn with a `RadioButtonGroup`.

Both are written in Svelte's idiom rather than as a copy of Web Awesome's
element API: snippets where Web Awesome has slots, `bind:` where it has a
`value` property and change events.

## Why not Web Awesome's

- `wa-radio` sets `role="radio"`, `aria-checked` and its own `tabIndex` on its
  host as it upgrades, so a group of them can only ever be a radio group,
  never a tab list or a nav.
- `wa-button` forwards no ARIA state to the button inside it (AGENTS.md), so
  it cannot be a tab either.
- `wa-tab-group`'s underlined tabs are the look being replaced. Underlined
  tabs read as separate documents; the pill reads as one thing seen from
  different sides, which is what every split in this app is.

## Three kinds of option

`RadioButtonGroup`'s `kind` decides what every `RadioButton` in it renders,
because the right element differs:

| `kind`            | Group                                    | Option                                                                     | Keyboard                                       |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| `radio` (default) | `div role="radiogroup"`, named by its label | a `<label>` round a visually hidden native `<input type="radio">`       | the browser's own: arrows move and choose      |
| `tab`             | `div role="tablist"`                     | `<button role="tab" aria-selected aria-controls>`                          | arrows wrap, Home and End jump, focus follows  |
| `link`            | `<nav>`                                  | `<a href aria-current="page">`                                             | none: every link is in the tab order, as in any nav |

- **Radios are native** for the reason `PartnerFields` and `ThreadIconPicker`
  use native radios: arrow keys, roving focus and form submission all work
  before hydration, and with `name` the value posts with a form. Without a
  `name` the group makes one up, so a second group on the page cannot
  uncheck the first.
- **Tabs** keep only the chosen tab in the tab order, and skip disabled ones.
- **Links** are for options that are pages of their own. `ItemsTabs` (Tasks |
  Rewards) is one: each has its own URL, sheets and history, so they are not
  tabs over panels.

Other props: `label` is shown above the pill as a Web Awesome control's label
is, or kept for screen readers with `hideLabel` (tabs and links always hide
it). `size="s"` is for toolbars. `fill` stretches the options into equal
columns across the container; otherwise the pill fits its options. A
`RadioButton`'s `count` draws a badge beside its label, filled in brand colour
on the chosen option.

An unset group chooses its first option, as both Web Awesome groups do. Each
option registers itself while it initialises, in render order, which happens
before it reads which option is chosen, on the server as well as in the
browser. That is why the first option renders as chosen in the server's HTML.

## The sliding fill

The fill is one absolutely positioned `span.indicator` inside the pill. It is
placed from the chosen option's `offsetLeft`, `offsetTop`, `offsetWidth` and
`offsetHeight`, written as custom properties on the element. It transitions
`translate`, `inline-size` and `block-size`, so it resizes on its way between
options of different widths.

- **Only a person's choice slides.** A click, a key or a radio's `change`
  sets a flag that the next placement reads. A value set from outside (a
  bound value changed by the page, the notebook restoring its remembered tab
  on mount) moves the fill straight there. Otherwise a page would open with
  its fill sliding from the first option to the one it meant all along.
- **A resize never slides.** A `ResizeObserver` on the pill and its options
  places the fill again whenever one changes size: a count gains a digit, or
  the title font arrives. A `MutationObserver` keeps the observed set current
  as options come and go.
- **Before hydration the chosen option fills itself.** The server cannot
  measure anything, so until the first placement the chosen option paints
  the same background the fill has. `data-measured` on the pill then hands
  the job over to the fill, in the same frame, so the pill never shows
  nothing chosen.
- **Placement writes to the DOM directly**, not through state. Sliding in
  from another page (below) has to commit a starting place and then move,
  within one task, which a reactive update cannot do.
- **`prefers-reduced-motion: reduce`** turns the transition off; the fill
  jumps.

### Across a navigation

`/tasks` and `/rewards` each render `ItemsTabs` in their own layout. A shared
layout would keep one pill alive across the navigation, but the pill sits in
each page's `PageHeader`, on the line under its title beside that page's own
credits, so it cannot be lifted out without the header.

Instead, a group given a **`continuity` key** remembers which option it
showed (`segmented/continuity.ts`):

1. On mount, it takes the key. If the previous holder showed a different
   option, it places the fill there first, without sliding, and then slides
   to its own.
2. On a person's choice, it updates the remembered option.
3. On destroy, it lets go of the key and notes the time.

The previous holder counts if it is still mounted (SvelteKit may build the new
page before it destroys the old one) or let go less than a second ago. That
window is what stops a pill reached later, by way of some other page, from
sliding from a choice made minutes before. A holder destroyed after a newer
one took the key does not overwrite it.

The memory is a module-level map, but browser-only: it is read and written
only from effects, which never run on the server, so requests never share it.

## Tabs

```svelte
<TabGroup label="Notebook" bind:active={tab} ontabshow={remember}>
	{#snippet nav()}
		<Tab panel="journal">Journal</Tab>
		<Tab panel="note" count={notes.length}>Notes</Tab>
	{/snippet}
	<TabPanel name="journal">…</TabPanel>
	<TabPanel name="note">…</TabPanel>
</TabGroup>
```

- `nav` is Web Awesome's `slot="nav"`. A `Tab`'s `panel` names the
  `TabPanel` it shows.
- `ontabshow` and `ontabhide` stand in for `wa-tab-show` and `wa-tab-hide`,
  and fire only on a person's choice, the one left first.
- `active` is bindable. While it is unset the first tab is shown.
- Every panel stays rendered, and the ones not shown are `hidden`. A panel
  keeps its state when the tab changes: an open detail, a completion in
  flight, half an entry.
- Ids come from the group's `$props.id()`, so tabs and panels are paired with
  `aria-controls` and `aria-labelledby` on the server's HTML as well as in the
  browser.

A tab group that starts on a remembered tab sets it in `onMount` rather than
while its state initialises. The tabs render on the server, which has no
storage, so a different first tab in the browser would hydrate with the wrong
one selected. `NotebookList` does this.

## Where they are used

| Where                                    | What                                       |
| ---------------------------------------- | ------------------------------------------ |
| `notebook/NotebookList.svelte`           | Journal, Notes and Scenes: `TabGroup`      |
| `ItemsTabs.svelte`                       | Tasks \| Rewards: `kind="link"`, with `continuity` |
| `prompt-review/PromptDiff.svelte`        | Layout: a `size="s"` radio group           |
| `prompt-review/PromptReview.svelte`      | View: a `size="s"` radio group             |

Not (yet) moved over:

- `DaydreamPicturePrompt`'s `wa-radio appearance="button"` group.
- The segmented radios in `daydream/choice-controls.css`
  (`DaydreamSidePicker`, the kink list's "Answer as").
- The list-style radio groups (the IQ test's settings, `PartnerFields`,
  `ThreadIconPicker`, `DaydreamVoicePicker`), which are lists rather than a
  pill.

## Tests

- **`segmented/RadioButtonGroup.svelte.test.ts`**, through
  `testing/RadioButtonGroupHarness.svelte`, covers each kind's roles,
  keyboard and form value. For the fill it checks:
  - the fill starting on the chosen option without sliding;
  - sliding onto a clicked option, and resizing as it goes;
  - jumping to a value set from outside;
  - staying put as a count widens the options;
  - the continuity key sliding a new group from the last one's option.
- **`tabs/TabGroup.svelte.test.ts`**, through `testing/TabGroupHarness.svelte`,
  covers:
  - the tab pattern and keyboard;
  - every panel staying rendered, with what was typed in one surviving a
    switch;
  - `ontabhide` before `ontabshow`;
  - a bound `active` set from outside.
