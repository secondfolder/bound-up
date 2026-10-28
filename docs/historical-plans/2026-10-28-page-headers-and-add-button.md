# Page headers, the credits control and the add button

Agreed in chat on 2026-10-28, from a review of the page header (mockups:
"Page header mockups", Revised row). Frozen record of what was intended.

## Header

- Drop the "‹ Today" back link on every page whose back link goes to Today
  (the bottom nav's places: Tasks, Rewards, Notebook, Messages). Such a page
  gets a root header: its title on the left and the context switcher on the
  right, on one line. Pages that are really nested keep `NestedPageHeader`.
- A second header line, where the page has one: its segmented control
  (Tasks | Rewards, Journal | Notes | Scenes) on the left, and on the tasks and
  rewards pages the credits control right-aligned on the same line.
- The tasks and rewards pages are both titled "Tasks & Rewards". The bottom
  nav keeps "Tasks".
- No page has a description by default. Both headers keep an optional
  `description`, for a page that later turns out to need one. Where a
  description said something the page needs, it moves into the page's body or
  its empty state.

## Credits

- In one context (Me, or a partnership): a chip with that context's balances,
  one or two depending on the partnership's control (yours where you act, your
  partner's where you manage them). Tapping it opens a sheet with them, where
  the rewards page also lets them be set.
- In Everyone: only the coins icon and an arrow, opening a sheet with every
  space's balances, a row per space. Balances are never added together.

## History

- "Completed tasks" and "Claimed rewards" move from the header's clock icon to
  a link at the end of the list.

## The add button

- Tasks, rewards and the notebook add through a floating button at the bottom
  right, as Messages already writes, in place of the dashed "Add a task/reward"
  row and the notebook's "For whom?" select and new-entry button.
- In one context it adds there straight away (the add sheet, or a new note or
  scene; a journal entry asks for its date first).
- In Everyone it fans out the avatars of the spaces something can be added to,
  as the context switcher does, and the one picked is where it goes.
- The fan is shared code: split the switcher's fan out into a general
  `ContextSelectorFan`, which the switcher and the add button both use.

## Also

- The context switcher on the signed-in kink list: Me and Everyone show your
  own list, a partner shows their partner view.
- The switcher's "Tap one, or…" help fades in around the middle of the opening
  animation, not at its end.
- Daydreams move into the Playroom; Today loses its separate Daydreams card.

## Done means

Tests at each level for what changed, the feature docs (contexts, tasks,
rewards, notebook, theme, playroom, daydreams, section-widgets) and AGENTS.md
updated, this plan copied here, the roadmap updated where an entry covers it,
and `lint`, `check`, vitest and the Playwright suite green.
