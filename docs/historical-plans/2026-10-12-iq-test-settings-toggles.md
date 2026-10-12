# IQ test: panel headers, and settings as a level plus toggles

## Request

1. Tab panels have a header that always stays at the top; if the panel's
   content does not fit, what is below the header scrolls. A click on a
   non-interactive part of the header collapses the panel.
2. The intensity slider no longer shows `.chosen` (and the photosensitivity
   callout) under it. Instead the options under it depend on its level:
   - 0: none.
   - 1: checkbox "Humilating results analysis if deserved".
   - 2: level 1, plus a "Theme/Vibe" dropdown of the vibes, a "Visual style
     matches theme" checkbox and a "Question content matches theme" checkbox.
   - 3: level 2, plus "Porn displayed at the same time".
   - 4: level 3, plus "Subliminal messaging" with an inline photosensitivity
     warning.
   - "More options" only when it has something in it; its two IQ inputs only
     from level 1.

## Decisions (asked and answered)

- Level 1 with humiliation ticked: results keep the clinical look, and the
  analysis is a new vibe-free humiliating write-up (subs mocked, doms
  flattered). The vibe only comes in from level 2.
- "Visual style matches theme" = colours, fonts, page title, tagline, intro.
  "Question content matches theme" = the questions' words, the teasing line,
  and the enough-for-a-score banner. The results analysis follows the
  humiliation box, in the vibe from level 2.
- The hypno gets its own checkbox, "Hypno playing": level 2 up for bambi,
  level 3 up for the rest.
- Level 4 with subliminals unticked keeps its porn background video; only the
  flashes go.

## Design

**Settings** (`settings.ts`) keep `presentation` as the level, and gain six
booleans, each defaulting to true (so older remembered settings parse):
`humiliating`, `themedLook`, `themedQuestions`, `porn`, `hypno`,
`subliminals`. A toggle only counts at or above the level that offers it. Pure
helpers say what a run does, and every caller asks them rather than comparing
presentations:

- `levelOf(presentation)` 0–4.
- `humiliates`: level ≥ 1 and `humiliating`.
- `looksThemed`: level ≥ 2, `themedLook`, a vibe.
- `themesQuestions`: level ≥ 2, `themedQuestions`, a vibe.
- `showsPorn`: level ≥ 3, `porn`, a vibe.
- `flashes`: level 4, `subliminals`, a vibe.
- `playsBackdrop`: level 4 and `showsPorn`.
- `playsHypno` (hypno.ts): `hypno`, a vibe, level ≥ 2 for bambi, ≥ 3 else.
- `effectiveVibe`: the vibe from level 2, else null. The schema's refine
  becomes "below level 2, or a vibe".

**Callers.** `themeFor` and `brandFor` (look, both stages: the debrief's
"clinical until the results" goes, as level 1 now has no vibe); `introFor`
(look); `enoughBannerFor`, `skippedNoteFor`, `tauntsFor`, run dealing
(questions); the flash layer's taunts follow `flashes` alone; the page's media
feed, columns, porn tab (`showsPorn`), backdrop (`playsBackdrop`), flash layer
(`flashes`), the taunt line (questions, and not while flashing); the hypno's
category tier becomes "porn" when `showsPorn`, else "mood".

**Analysis.** `explicit = humiliates(settings)`, in `effectiveVibe` (null at
level 1). A vibe-free explicit analysis gets neutral sub headlines and a
neutral skip line; the neutral comparisons already exist.

**Results.** A stored or shared result keeps what its screen depends on:
`humiliating` and `themedLook` (as effective values at finish). New columns on
`iq_test_results` (regenerate the uncommitted 0022), the result schema and
view, device history, and the share token (a flags byte, version 2; version 1
links are dropped — no real users).

**SettingsFields.** Slider (no `.chosen`, no callout), then the level's
options: `wa-checkbox`es, a `wa-select` of vibes (register `select` and
`option`), the subliminal checkbox's hint carrying the photosensitivity
warning; Fullscreen; "More options" from level 1. Listeners attached by hand
(shadow boundary). Synced from `initial` like the rest.

**MediaTab.** The expanded panel is a fixed header (head and controls) above
one scrolling body (children and footer); a click on the header's
non-interactive parts collapses it.

## Tests

- Node: the feature helpers per level and toggle; analysis vibe-free explicit;
  copy and theme by toggle; share token round trip with flags; schema defaults.
- Browser: SettingsFields options per level, toggles reported by `snapshot`
  and `onchange`, More options hidden at level 0; MediaTab header fixed and
  click-to-collapse.
- e2e: update for the new controls (vibe by dropdown).

## Docs

`docs/playroom.md` (settings, flow, results, sharing, dock). Copy this plan to
`docs/historical-plans/`.
