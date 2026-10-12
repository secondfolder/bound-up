# IQ test: Bambi hypno player

## Context

The IQ test's **bambi** vibe should also play a Bambi hypno. The player:
- picks one at random by default;
- lets the taker choose one by searching, by trigger tags, or from other categories;
- sits beside the existing porn clips, with its own volume.

### Research findings (bambicloud.com, measured 2026-10-11)

**API.** `https://api.bambicloud.com/` is a REST API with no auth needed for reads. This is undocumented, reverse-engineered from their SPA bundle. Its CORS headers echo any `Origin`.

**`GET /files`** returns `{ files, totalItems, pageSize, pageOffset }`.

| Parameter / behaviour | Finding |
| --- | --- |
| `pageSize` | Capped at 50 (400 above that) |
| `pageOffset` | An item offset |
| `searchQuery`, `minDuration`, `maxDuration` | Work |
| `sortType` | `date`, `duration`, `name`, `playcount`, `minutesplayed` |
| `sortDirection` | `ascending`, `descending` |
| `trigger` | Works when given a trigger UUID |
| `showLocked=false` | Drops Patreon-locked files: 1277 → **748** playable |
| `fileTypes` | **Currently 500s** on their side |
| Random sort | **None** |

**Per file:** `uuid`, `name`, `author.username`, `duration` (ms), `fileType`, `triggers[]` (name/description/uuid), `description`, `warnings[]`, `plays`, `releaseDate`, `audioType`, `scriptURL`.

**`fileType` values:** `induction`, `deepener`, `programming`, `awakener`, `loop`, `subliminal`, `music`, `full session`, `ai music`.

**Audio.** Files are MP3 for most, plus some WAV, M4A and FLAC. Durations run 0.7 min to 8 h, median about 11 min. `audioURL` on `https://cdn.bambicloud.com/<uuid>.<ext>` has:
- range requests (206) for streaming;
- no Referer or hotlink check;
- `Access-Control-Allow-Origin: *`, so `<audio crossorigin="anonymous">` can be routed into Web Audio for a real volume control on iOS.

**`GET /triggers`** lists all triggers.

**bambisleep.info** is a MediaWiki: documentation and consent guidance, with no audio and no structured file data. Not used.

**No published API terms were found.** It is unofficial use, so it degrades gracefully, as the clip feed does.

### User decisions

- **On by default** for the bambi vibe, with a switch in setup to turn it off.
- **Two sliders:** "Clips" (existing) and "Hypno", independent.
- **Random pool default depends on the intensity:**
  - **Mood lighting** (`suggestive`) defaults to music: `music` + `ai music`.
  - **Illustrated and overload** default to `loop` + `subliminal`.
  - The taker can tick other categories in the drawer. The choice is remembered on the device per tier, mood lighting or the porn modes, so tightening one doesn't change the other.
- **Picker** is a drawer opened from the media bar.

## Approach

### 1. Server: a cached index of playable files

**`src/lib/playroom/iq-test/hypno.ts`** (pure, alias-free):
- **Types:** `HypnoFile` holds `uuid`, `name`, `author`, `durationMs`, `fileType`, `triggers: string[]`, `description` (trimmed to ~400 chars), `warnings: string[]`, `audioUrl`, `plays`.
- **`HYPNO_CATEGORIES`:** the nine fileTypes, with labels.
- **`defaultCategories(presentation)`** returns `['music', 'ai music']` for `suggestive`, and `['loop', 'subliminal']` for `illustrated` and `overload`.
- **`categoryTier(presentation)`** returns `'mood' | 'porn'`, for the remembered selection.
- **`parseFilesPage(body)`** validates each entry:
  - it must have an `audioURL` on `https://cdn.bambicloud.com/` ending `.mp3|.m4a|.wav|.flac`;
  - it must have a UUID;
  - entries that fail are dropped.
- **`filterHypnos(index, { query, categories, trigger, maxMinutes })`** matches `query`, case-insensitive, against name, author, triggers and description.
- **`pickRandom(files, rng, excludeUuid?)`** picks one at random.
- **`triggerCounts(index)`** gives the top triggers, for the chips.

**`src/lib/server/playroom-hypno.ts`**, modelled on `playroom-media.ts`: per-isolate cache, in-flight dedupe, backoff, never throws.
- **Building the index:** page through `GET /files?showLocked=false&pageSize=50&sortType=playcount&sortDirection=descending`. That is about 15 requests, 3 at a time.
- **TTL:** 6 h. On failure, serve the last good index for 5 min.
- **Why a full index:** it gives a working category filter despite their `fileTypes` 500, true random within a category, and instant search. It costs about 15 requests per isolate per 6 h, and is polite.

**`src/routes/api/playroom/iq-test/hypnos/+server.ts`** is public, like the media endpoint.
- **Request:** `GET ?q=&categories=loop,subliminal&trigger=&random=1&exclude=<uuid>&limit=50`.
- **Response:** `{ files: HypnoFile[], total, triggers: {name,count}[], categories: {id,count}[] }`. With `random=1`, `files` holds one random match.
- **Validation:** inputs are validated, unknown categories ignored, and `limit` ≤ 50.
- **Caching:** `Cache-Control: public, max-age=300` for searches, `no-store` for random.

### 2. Sound: two channels

Generalise `src/lib/playroom/iq-test/sound.svelte.ts` into **channels**, `'clips'` and `'hypno'`, sharing one `AudioContext`.
- **Per channel:** its own `GainNode`, level (remembered under its own localStorage key) and `muted` state.
- **Keep the current rules:** levels are remembered and `muted` is not.
- **Every load starts muted, with one exception.** Starting the test is a click (a gesture), so `begin()` unmutes the **hypno** channel when a hypno is on. That is what "on by default" needs.
- **After a reload** there is no gesture, so the hypno shows muted until the toggle or slider is touched.
- **API changes:** `registerAudible(element, channel)`, `setSoundVolume(channel, v)`, `toggleMuted(channel)`, `soundVolume(channel)`, `soundMuted(channel)`, `unmuteFromGesture(channel)`.
- **Update callers:** `ClipPlayer.svelte`, `SoundControl.svelte`, and `sound.svelte.test.ts` (rewritten per channel).

`SoundControl.svelte` takes `channel` and `label` props, so it renders as "Clips" or "Hypno" with its own toggle and slider.

### 3. Settings and setup

- **`settings.ts`:** add `hypno: z.boolean().default(true)`. The default keeps old remembered settings valid.
- **When a hypno plays:** only when `effectiveVibe === 'bambi'` and the presentation themes questions: Mood lighting (`suggestive`), illustrated or overload. Not during clinical or debrief testing.
- **No porn in Mood lighting.** The media bar there carries only the hypno controls, with no "New porn" and no Clips slider.
- **`SetupDialog.svelte`:** for the bambi vibe, a `wa-switch` "Play a Bambi hypno", on by default, read from the element like the other inputs. Add `wa-switch` if it isn't registered (it is already in `webawesome.ts`). The dialog carries a one-line note that hypno files are trance and conditioning audio from bambicloud.com.

### 4. Player and drawer: `src/lib/components/iq-test/`

**`HypnoPlayer.svelte`** is a persistent, page-level `<audio crossorigin="anonymous" preload="auto">`, registered on the `'hypno'` channel.
- **Picking:** on mount it asks for `random=1` with the remembered categories.
- **On `ended`:** fetch the next random file, excluding the current one.
- **On `error`:** log via `media-log.ts` (`mediaWarn`, with the URL and `MediaError`), then the next file. It stops after 3 consecutive failures.
- **Exposed state:** what is playing and its time remaining, for the bar.
- **Lifetime:** it keeps playing through the results screen; it is only torn down when the page goes away or the taker turns it off.

**Media bar** (in `+page.svelte`):
- **Shown:** on the questions and results stages, when a hypno is active.
- **Contents:** a now-playing line ("Name — author · 12:34 left"), linked to `https://bambicloud.com/file/<uuid>` for credit, plus Next (a random pick) and **Choose…**, and the Hypno `SoundControl` beside the Clips one.

**`HypnoDrawer.svelte`** (`wa-drawer`):
- **Search:** a `wa-input`, debounced, value read from the element.
- **Categories:** native checkbox chips, starting from `defaultCategories(presentation)`. The selection is remembered in localStorage per tier (`device.ts`, keyed by `categoryTier`) and is what Next and Random draw from.
- **Triggers:** chips, single select, top ~15.
- **Length:** a filter (any, ≤10 min, ≤30 min).
- **Random:** a "Random from these" button.
- **Results:** name, author, length, type, triggers and any warnings, each with a Play button. Fetched through `tryFetch`, with an inline "couldn't load hypnos" and a retry on failure.

### 5. Diagnostics

Use the existing `media-log.ts` prefix:
- the index size at load;
- each pick (name, type, URL);
- audio failures, with `MediaError` details;
- "CDN blocked" when every attempt fails, as for images.

## Critical files

**New:**
- `src/lib/playroom/iq-test/hypno.ts`
- `src/lib/server/playroom-hypno.ts`
- `src/routes/api/playroom/iq-test/hypnos/+server.ts`
- `src/lib/components/iq-test/HypnoPlayer.svelte`
- `src/lib/components/iq-test/HypnoDrawer.svelte`

**Changed:**
- `sound.svelte.ts`, `SoundControl.svelte`, `ClipPlayer.svelte`
- `settings.ts`, `SetupDialog.svelte`, `device.ts`
- `(standalone)/playroom/iq-test/+page.svelte`
- `docs/playroom.md`, plus a note on `bimbo-iq-test` in `roadmap.json`

## Tests

- **Pure** (`hypno.test.ts`):
  - `parseFilesPage`: drops locked, non-CDN and malformed entries;
  - `filterHypnos`: query, categories, trigger, length;
  - `pickRandom`: deterministic with an rng, and honours `exclude`;
  - `triggerCounts`;
  - `defaultCategories` and `categoryTier`: music for `suggestive`, loop + subliminal for `illustrated` and `overload`.
- **Server:**
  - `playroom-hypno.test.ts`, with a fake fetch: paginates until done, uses `showLocked=false`, caches, dedupes, backs off and keeps the last good index;
  - an endpoint test: validation, `random`, the limit, cache headers.
- **Component:**
  - `sound.svelte.test.ts`: channels are independent;
  - `HypnoPlayer`: plays a stub (generated WAV blob served by a stubbed fetch), picks the next on `ended`, skips on `error` and gives up after 3;
  - `HypnoDrawer`: category defaults, search and chips build the right query, and Play selects;
  - `SetupDialog`: the switch only appears for bambi, and is on by default.
- **e2e:** stub `/api/playroom/iq-test/hypnos` with a locally generated WAV.
  - A bambi run shows the hypno bar and is playing after start, unmuted, from the gesture.
  - A Mood lighting bambi run plays a hypno from the music categories, shows no porn controls, and asks the endpoint for `categories=music,ai music`.
  - An illustrated run asks for `loop,subliminal`.
  - Next changes the track.
  - The drawer search plays the chosen one.
  - The hypno switch off means no player.
  - A non-bambi vibe has no player.

## Verification

1. Run `npm run check`, `npm run lint` and `npm test`.
2. Live against the dev server (192.168.1.56:58769):
   - the hypnos endpoint returns about 748 indexed files;
   - in a bambi run, a random loop or subliminal plays when the test starts (illustrated and overload), and a music track in Mood lighting;
   - Next, the drawer search and the trigger chips all work;
   - each slider affects only its own sound;
   - a reload resumes muted and the toggle restores it.
3. Check in Firefox as well, since a browser-specific blocker issue happened before.
4. Copy this plan to `docs/historical-plans/2026-10-11-iq-test-bambi-hypno.md`.
