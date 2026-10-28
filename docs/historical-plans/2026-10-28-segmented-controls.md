# Segmented controls: RadioButtonGroup and our own tabs

## Context

The pill-shaped segmented look (several options inside one pill, the selected
one filled) suits this app better than `wa-tab-group`'s underlined tabs, but
today it exists three separate times:

- `SegmentedTabs.svelte`: tabs over panels, **currently unused** (the partner
  "For you / For them" pages it served went away). `docs/theme.md` says it is
  kept on purpose because there are plans for it. This is that plan.
- `ItemsTabs.svelte`: the Tasks | Rewards switch at the top of `/tasks` and
  `/rewards`, a hand-drawn copy of the same pill made of links with
  `aria-current`.
- `wa-radio appearance="button"` in the prompt-review screens.

Meanwhile the notebook still uses `wa-tab-group`. The goal is one segmented
control that works as a radio group, as tabs, and as a pair of links. The
selected fill **slides and resizes** between options. Every tab in the app, the
Tasks | Rewards links and the two prompt-review radio groups then move onto it.

**Why we build it rather than wrap Web Awesome:** `wa-radio` hard-sets
`role="radio"`, `aria-checked` and its own `tabIndex` on its host
(`chunk.7PO7HNMU.js:51-71`), so a group of them can never be exposed as a tab
list or a nav. `wa-button` forwards no ARIA state (AGENTS.md), and
`wa-tab-group`'s look is the thing being replaced. So the control is ours, built
on native elements. Its API is shaped like Web Awesome's (`wa-radio-group` +
`wa-radio`, `wa-tab-group` + `wa-tab` + `wa-tab-panel`), written in Svelte idiom:
snippets for slots, `bind:` for values.

## Components

### `src/lib/components/segmented/RadioButtonGroup.svelte` + `RadioButton.svelte`

These work like `wa-radio-group` and `wa-radio`. The group holds the value and
provides it through context, using a typed `getContext`/`setContext` pair in
`segmented/context.ts`. Each `RadioButton` child reads that context.

Group props:
- `label: string`: the group's name. It is visible above the pill by default,
  as `wa-radio-group`'s label is. `hideLabel` keeps it for screen readers only;
  tabs and links use that.
- `value = $bindable()` and `onchange?: (value) => void`. When unset, the value
  is the first option, as in both Web Awesome groups.
- `kind: 'radio' | 'tab' | 'link'` (default `radio`): decides which element
  each option renders (see below).
- `name?: string`: radio kind only. It is the native radios' name, so the value
  submits with a form.
- `size: 's' | 'm'` (default `m`; `s` for toolbars, which the prompt-review
  groups use today).
- `fill: boolean`: equal-width columns stretched to the container (the current
  SegmentedTabs look), or content-sized and inline when false.
- `children: Snippet`.

`RadioButton` props: `value`, `disabled`, `count?: number | null` (the badge
from SegmentedTabs, styled by selected state), `children`. Two more are used by
only one kind each: `id` / `controls` for tabs (passed by `Tab`), and `href` for
links.

Each kind renders the element that suits it:
- **`radio`**: `<div role="radiogroup" aria-labelledby>` holding `<label>`s,
  each around a visually hidden native `<input type="radio" name value>`.
  Native radios give arrow-key movement, roving focus and form submission
  before hydration with no extra code. That pre-hydration submission is the
  reason `PartnerFields` and `ThreadIconPicker` use native radios too. The
  label draws the focus ring through `:has(:focus-visible)`.
- **`tab`**: `<div role="tablist" aria-label>` holding
  `<button type="button" role="tab" id aria-controls aria-selected tabindex>`.
  The keydown handler moves over from SegmentedTabs: arrows wrap, Home and End
  jump, focus follows, and disabled tabs are skipped. Only the selected tab is
  in the tab order.
- **`link`**: `<nav aria-label>` holding `<a href aria-current="page">`. Every
  link is in the tab order, with no arrow keys, as an ordinary nav works.

**The sliding fill:** one absolutely positioned `span.indicator`
(`aria-hidden`) sits inside the pill. It is placed from the selected option's
`offsetLeft`/`Top`/`Width`/`Height`, and moves with transitions on `translate`
and on `inline-size`/`block-size` (about 250ms, `ease-out`). That way it slides
and resizes between options of different widths. An `$effect` keyed on the
selected value measures it. A `ResizeObserver` on the pill and the options
measures again whenever they change size: counts and labels change width, and
fonts load late.

- The fill animates only when the selection changes. The first placement and
  resizes jump straight there. Under `prefers-reduced-motion` nothing animates.
- Until the first measurement (during SSR and before hydration), the selected
  option paints its own background, so the pill never flashes with nothing
  filled. A `data-measured` flag on the pill then hands the fill over to the
  indicator.

**Sliding across a page change (link kind):** `/tasks` and `/rewards` are
separate layouts, so the pill is torn down and rebuilt when you navigate, and
there is nothing left to slide. A shared layout cannot fix this cleanly here:
each page's `NestedPageHeader`, with its own title, actions and history link,
sits *above* the pill. Instead, `RadioButtonGroup` takes an optional
`continuity?: string` key.

- When a group with that key is destroyed, it records which option was
  selected in a browser-only module map.
- When a new group with the same key mounts within a short window (about 1s),
  it first places the indicator on that earlier option without animating, then
  animates to the current one. So the fill slides from Tasks to Rewards as the
  new page appears.
- The map is only ever touched inside effects, so it is never written on the
  server and is not a server singleton.

### `src/lib/components/tabs/TabGroup.svelte`, `Tab.svelte`, `TabPanel.svelte`

These mirror `wa-tab-group`, `wa-tab` and `wa-tab-panel`:

```svelte
<TabGroup label="Notebook" bind:active={tab} ontabshow={remember}>
	{#snippet nav()}
		<Tab panel="journal">Journal</Tab>
		<Tab panel="note" count={3}>Notes</Tab>
	{/snippet}
	<TabPanel name="journal">…</TabPanel>
	<TabPanel name="note">…</TabPanel>
</TabGroup>
```

- `TabGroup` takes:
  - `label` and `active = $bindable()`.
  - `ontabshow?(name)` and `ontabhide?(name)`, standing in for Web Awesome's
    `wa-tab-show` and `wa-tab-hide`.
  - A `nav` snippet, standing in for `slot="nav"`, and `children` for the
    panels.

  It renders `<RadioButtonGroup kind="tab" hideLabel fill bind:value={active}>`
  around `nav`, then the panels. It shares a `$props.id()` uid and the active
  name with `Tab` and `TabPanel` through context.
- `Tab` takes `panel`, `disabled`, `count` and `children`, and renders a
  `RadioButton` with `id={uid-tab-panel}` and `controls={uid-panel-panel}`.
- `TabPanel` takes `name` and `children`, and renders
  `<div role="tabpanel" id aria-labelledby hidden={!active}>`. Every panel
  stays rendered, with the inactive ones hidden, as SegmentedTabs does, so a
  panel keeps its state when you switch away and back.

`SegmentedTabs.svelte`, its test and `testing/SegmentedTabsHarness.svelte` are
**deleted**: `TabGroup` is the "plans for it" that `docs/theme.md` keeps it for.
Its test cases move to `TabGroup`'s test.

## Swaps

- **`notebook/NotebookList.svelte`**: `wa-tab-group` becomes `TabGroup`, and
  `rememberTab` becomes `ontabshow`.
  - It starts on `journal` and applies the remembered tab in `onMount`. Today
    it reads `localStorage` while initialising state, which would hydrate with
    the wrong `aria-selected` and `hidden` now that the tabs render on the
    server.
  - Any `wa-tab` styling there is dropped.
  - `e2e/notebook.spec.ts` and `e2e/scenes.spec.ts` click
    `getByRole('tab', …)`, which still matches.
- **`ItemsTabs.svelte`**: becomes a thin wrapper,
  `<RadioButtonGroup kind="link" label="Tasks and rewards" hideLabel
  continuity="items" value={current}>` with two `RadioButton href`s. Its own
  pill CSS is removed. Its comment changes to say why these are links and not
  tabs. `tasks/page.svelte.test.ts:95` (`nav[aria-label="Tasks and rewards"]
  [aria-current="page"]`) should hold as-is.
- **`prompt-review/PromptDiff.svelte`** (Layout) and **`PromptReview.svelte`**
  (View): `wa-radio-group` becomes `RadioButtonGroup size="s"` with
  `bind:value`, and their `onChoose` attachments on the radio groups are
  removed. `onChoose`'s comment in `prompt-review/choose.ts` changes to say
  `wa-select` only. Check `PromptDiff.svelte.test.ts` for any `wa-radio`
  selector.
- **Not swapped** (per your earlier answer): `DaydreamPicturePrompt`'s radio
  group, and the list-style radios (IQ test settings, PartnerFields,
  ThreadIconPicker, DaydreamVoicePicker).
- **`src/lib/webawesome.ts`**: the `tab`, `tab-group` and `tab-panel` imports
  are removed once nothing uses them. `radio` and `radio-group` stay.

## Tests (browser project)

- **`segmented/RadioButtonGroup.svelte.test.ts`**, run through a harness in
  `src/lib/testing/` because the children are snippets:
  - Radio kind: it is a named radiogroup of native radios, with the first
    checked by default.
  - `bind:value` and `onchange` follow both a click and the arrow keys.
  - The radios submit `name=value` in a `FormData`.
  - The label can be visible or hidden, and a disabled option is skipped.
  - Tab kind renders `role="tab"` buttons with a roving tabindex, and wraps on
    the arrow keys, Home and End.
  - Link kind renders a named nav whose current link carries
    `aria-current="page"`.
  - After a change, the indicator lines up with the selected option's box.
    Compare `getBoundingClientRect` with reduced motion faked, or once the
    transition ends. It also lines up after a count changes width.
  - With a `continuity` key, a remount starts at the previous option and ends
    at the new one.
- **`tabs/TabGroup.svelte.test.ts`**:
  - The old SegmentedTabs cases: a named tab list, the count in each tab's
    accessible name, panels labelled by their tab, every panel kept and the
    inactive ones hidden, and the keyboard.
  - `ontabshow` and `ontabhide` fire with the tab's name.
  - `bind:active` works in both directions.
- **Existing tests**: the tasks route component test stays green. Run the
  notebook, scenes and today Playwright specs, and the tasks and rewards specs.

## Docs

- **New `docs/segmented-controls.md`**, with a row in AGENTS.md's feature doc
  table. It covers:
  - the two components and the three kinds;
  - why not `wa-radio-group` or `wa-tab-group`;
  - the indicator and its pre-hydration fallback;
  - continuity across a page change;
  - reduced motion.
- **AGENTS.md conventions**: add "Tabs are `TabGroup`, never `wa-tab-group`;
  a segmented choice is `RadioButtonGroup`" next to the Slider rule. Like that
  rule, it is enforced in review, since Biome cannot match markup.
- **`docs/theme.md`** (around lines 335-349): replace the `SegmentedTabs`
  paragraph and the `ItemsTabs` wording with the new components. Check
  `docs/tasks.md:316` and `docs/rewards.md:91`, and the `ItemsTabs` comment in
  `AppNav.svelte:41`.
- Copy this plan to `docs/historical-plans/2026-10-28-segmented-controls.md`.
- **Roadmap**: check `roadmap.json` for a matching entry (there is likely
  none).

## Verification

- Run `npm run check` and `npm run lint`.
- Run `npx vitest run` on the new and touched tests.
- Run `npx playwright test` on the notebook, scenes, today, tasks and rewards
  specs.
- Run the full `npm test`.
- Open the app (`run` skill) and look at the notebook, `/tasks` ↔ `/rewards`
  and `/debug/prompts`:
  - the fill slides and resizes between options, and across the Tasks ↔
    Rewards navigation;
  - keyboard navigation works;
  - a reload shows the right option filled before hydration.
