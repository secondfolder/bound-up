# Design review: Bound Up

> Frozen record. This is the design review as delivered on 2026-10-21, which
> the user approved in full ("I like all your suggestions and want you to make
> all these changes"), with one exception: the display font is to be replaced
> by a freely licensed face rather than licensed, since the project is open
> source. The per-area reviews behind it (home, partner, settings, public,
> playroom/daydreams), each with file and line references, were carried out
> against `bbca4eb` and are summarised here as they were sent.

Reviewed at `bbca4eb` in an isolated worktree. I staged two linked accounts with tasks, rewards, messages, a daydream and a kink list, captured 304 screenshots of every route at 360 / 820 / 1280 / 1920, ran an automated pass (overflow, small text, small targets), computed contrast for the theme tokens, and had five parallel reviewers go through every screenshot by area; I verified the big claims myself.

The headline: **most of the visual inconsistency comes from about six root causes, not dozens of independent mistakes.** Fixing those first clears roughly half the list.

## Fix these first (root causes)

**1. Page columns shrink-to-fit instead of filling their width (High).** `<main>` in the (app) layout is a flex column, and page roots use `max-width: X; margin: 0 auto`. Auto margins disable flex stretch, so `max-width` is only a cap and each page is as wide as its content. Consequences:
- **The partner page overflows horizontally at 360px**: "Morgan" and the cards are cut off on the right, because a `nowrap` task title sets the min-content width.
- Sibling pages with the same declared width render differently (tasks ≈830px vs rewards ≈525–660px on desktop, both "52rem"), and pages change width as data changes. `/daydreams/new` narrows after "Build it yourself".
- Fix: `inline-size: 100%` on page roots (the kink-list layout already does this, with a comment explaining why). Also collapse the 7 different column widths (26/30/40/48/52/72rem, 800px) into 2–3 named tokens.

**2. Web Awesome gives every `li` an 18px left margin (High, pervasive).** Lists that set `list-style: none` reset `ul` padding but not `li` margin, so home widget rows, reward cards, received message bubbles, board tiles, playroom and daydream cards, partner/admin/debug/passkey lists all sit 18px right of their own headings. One rule fixes it everywhere.

**3. NestedPageHeader pads 16px, every page's content pads 24px (Medium, every nested page).** The back link and title sit 8px left of the cards, and the divider overhangs them. Use one gutter token for both.

**4. A grey static band / scrollable page root (High).** `body::before` (the halftone) is `position: absolute; height: 800px`. In the app shell the body is 0px tall, so on any screen shorter than 800px the document becomes scrollable by the difference (measured `scrollY=80` at 720px). Anything that focuses or scrolls near the bottom moves it: the title gets cut off and bare grey grain shows above the nav. Short public pages (login, signup, recover) show the same band on phones. Fix: `position: fixed` in the shell (and clamp the height on public pages); also reset window scroll in `visual-viewport.ts`, whose guard only listens to `visualViewport` events, which desktop Chrome doesn't fire.

**5. The display font is the personal-use demo (High).** Muddy Tractor's "?" glyph is a "PERSONAL USE DEMO" watermark. It's live on "Can't sign in?" and "Is this you?", and will hit any user/model-authored title (daydream titles, partner names). Both a licensing and a visual problem. License the full font, or render "?" in the body face until then.

**6. Primary actions look disabled; the save-button convention is applied five different ways (High).** "Complete" and "Claim" are filled-neutral brown slabs with dim text, so the one thing people come to these pages to do reads as unavailable, and an enabled Claim barely differs from a disabled one. Separately: "Change password" is solid amber while empty, "Ask my partner" solid from the start, "Sign Up" always outlined, "Add reward"/"Create invite link" filled-neutral and never promoted, and the Account/admin saves use `filled`+brand (a 14% tint, not solid). Standardise on `appearance={canSave ? 'accent' : 'outlined'}`, as login and check-email already do.

**Also cross-cutting: there is no `+error.svelte` anywhere.** Every 403/404 is SvelteKit's bare page (a "403" in the top-left, no nav, no back link). I hit it on `/partner/…/tasks/add` as the non-controlling partner. That violates the "failure screens need recourse" principle. Add one for `(app)` (keeps the shell) and a root one.

## Contrast & readability

- **Quiet text and amber links are ~4.0:1 on the top-left of the wash** (`#943700`); AA needs 4.5. Body text is 6.3:1, and lower down the wash everything passes comfortably. The top-left is exactly where every page's description line, the roadmap's "Back to Bound Up", the kink list's "Saved" and the invite explanation sit. Fix by using `text-normal` for header descriptions, or darkening the first ~150px of the wash.
- Too small: landing "BETA" stamp (7.2px on phone), message timestamps (11px, quiet), the reaction "☺" button (≈9px glyph at 70% opacity ≈2.5:1, 14×38px target), roadmap status pills (11px), AppNav labels (11.2px; 0.75rem would be better).
- Kink list answers lean on hue: Like and Love are adjacent greens, and Hard limit and Not for me are close for deuteranopes. The chosen dot gets a check, but *which* answer it is is still colour-only; a per-level glyph or the chosen label would fix it.
- Emails break mid-word in admin users and the settings card.

## Responsive behaviour

- **Phone (360):** partner page overflow (root cause 1); "Notifications" h1 wider than the viewport, because the display face has no size clamp (a `clamp()` on `:where(h1)` in theme.css fixes it site-wide); kink list's pinned toolbar takes about a third of the screen; card-in-panel-in-page nesting leaves about 225px for task text; "Add a partner" has double padding (inputs about 224px wide); daydream Ease off/Stop hide behind an unlabelled ⋮.
- **Desktop/wide:** the message thread and board have no max width: at 1920 the two bubbles are about 1870px apart and the board is one 128px tile in the top-left corner. Daydream suggested replies get stranded about 300px below the passage they answer. Otherwise the narrow centred columns are fine for scan lists; landing feature screenshots stay 240px at 1920.
- **Tablet:** mostly shows the header/content misalignment from root cause 3 most clearly.

## Inconsistencies worth unifying

- **Four page-header patterns:** centred h1 + amber subtitle (Home); centred h1 + quiet subtitle, no back link (Playroom, Daydreams, Kink list); left back link + h1 + divider (nested pages); kink-list subpages with an underlined "Whole list"/"Your list" text link instead. Kink list and Daydreams have no way back up to Playroom.
- **Auth pages built five ways**, with h1 sizes from 1.5rem to 4.5rem; login vs signup boxes are different widths (286 vs 298px).
- **Tasks vs Rewards look like two designs:** different radii and padding, "Open full task list" is a button while "Open full rewards" is a link, history/add buttons in opposite order, Claim is `size="s"` and Complete isn't.
- **Chips and buttons:** three toggle-chip sizes; pills, square and split buttons mixed in the daydream footer; "Add tags" (thread) vs "Add tag" (dialog) in different styles.
- **Copy:** Title Case vs sentence case ("Completion History", "Your Tasks", "Sign Up"); log in / login / sign in all used; jargon ("self tasks", "snapshotted"); the account email note talks about encryption and key migration, breaking the "encryption is invisible" commitment.
- **Small bugs:** "1 credits", "1 related kinks", "with Mara ·played", "You need 8 credits" (when you have 3; "5 more to go" is clearer), home reward balance shown as a bare "3", the Settings tab not highlighted on Admin/Debug, the guides page blank with no back link or empty state, the quick-fill gap (a `flex: 0 1 15em` meant as a width becomes a 190px height in a column), clipped quick-fill tiles, and its floating Start button covering tiles.

## Use of space

Good: settings list and home dashboard are appropriately airy; the kink list's two-column layout is dense in a good way. Misspent: nested panels on phone; the 60px empty footer band behind the messages FAB; the IQ test dialog always full height (500–750px of nothing on desktop); admin/server about 8 phone screens with no jump navigation; daydream prose in chat bubbles at body size, where the typography itself is good (65ch, 1.6 leading) but it would read better slightly larger with more padding from 48rem up.

## Joyful animation opportunities

All gated on `prefers-reduced-motion`.
1. **Completing a task:** "+2 credits" floats up and fades, the button morphs to a check, the card collapses, and the balance counts up. Needs `use:enhance` on the Complete/Claim forms, which are full-page POSTs today.
2. **Reward becomes claimable:** one amber glow on Claim; on claim, the balance counts down.
3. **Kink answer chosen:** dot pops (scale 1→1.15→1) and the check draws in; it is the page's most repeated action.
4. **Messages:** a sent bubble grows from the Send button, reactions pop, and the compose dialog morphs out of the FAB (View Transitions).
5. **Daydreams:** paragraphs fade in as they stream; the dice tumble; the chosen suggestion card morphs into the setup form (which also hides the width change).
6. **Small delights:** BETA stamp "thunk" on load; chevrons nudge on hover for home widget headers and settings rows (which currently have no hover state, and whose tap target is only the 22px text line); a save-confirmation check (Account currently gives no feedback at all after saving).

## What's working

The theme (wash, halftone, amber, and h1-only display face) is cohesive and distinctive; roadmap status uses shape as well as colour; sent/received bubbles are clear and on-brand; the composer pins correctly; daydream prose typography is book-like; the settings index follows native conventions; leading with the passkey on login is a good call.

## Suggested order

1) Root causes 1, 2, 4, 6 and the error pages: small CSS and markup changes with the widest effect. 2) Font licence. 3) Root cause 3, header-description contrast, phone issues (Notifications h1, quick fill, kink-list toolbar). 4) Component unification: one page column, one header pattern, a shared ItemCard for tasks and rewards, one chip style. 5) Animations, starting with completing and claiming.
