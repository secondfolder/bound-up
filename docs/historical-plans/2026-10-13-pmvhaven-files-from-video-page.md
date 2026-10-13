# Always read PMVHaven's MP4 from the video page (no HLS)

## Context

About 1 in 7 PMVHaven videos fail to play. In 29 videos sampled on 2026-10-13, 4 had a derived
MP4 URL that answered 403. `parseSearchPage` in `src/lib/playroom/iq-test/pmv.ts` gets the MP4 by
removing `/master.m3u8` from a playlist that sits "beside" the file. But that folder is named after
the *original upload*. For re-uploaded or renamed videos the real file (the page's `videoUrl`) has a
different name, and nothing exists at the derived path. One example is "Gooner Anthem":
`…/1789842527487_…Brainmelter_upscaled_1440p60.mp4` gives 403, while the page's `videoUrl` is
`…/YourVideosCouldLookBetter_-_Gooner_Anthem_…_zucea9lb.mp4`.

HLS (hls.js / video.js) is not an option. The bucket sends no CORS headers on playlists or segments,
and a preflight gets a 403. MSE players fetch both, so those reads are blocked in Chrome and Firefox.
Only Safari's built-in HLS would work, and Safari already plays the MP4.

The fix is to stop guessing and always take `videoUrl` from the video's own page. That path
already exists for older videos (`withMedia` → `parseVideoPage`). It is now cheap: `withMedia` keeps
each answer per isolate, and the relay keeps each video page for 30 days in all isolates
(`VIDEO_MAX_AGE_S` in `src/lib/server/playroom-pmv.ts`).

## Changes

1. **`src/lib/playroom/iq-test/pmv.ts`**
   - `parseSearchPage`: always set `mediaUrl: ''`. Keep both `MASTER_BESIDE_FILE` and
     `MASTER_IN_FOLDER` as the check that a result is a real hosted video. Only the derivation goes.
   - Rewrite the header comment's "The file is derived where it can be" paragraph to say why it no
     longer is: the folder keeps the upload's original name, which can differ from the file's
     (measured at 4 of 29). Every file is read from its page, once, and cached.
2. **No changes needed downstream.** These already handle an empty `mediaUrl`:
   - the random pick in `src/routes/api/playroom/iq-test/pmvs/+server.ts` (`withMedia`)
   - a drawer pick in `HypnoSession.play` → `#resolve` → `/pmvs/[id]`
     (`src/lib/playroom/iq-test/hypno-session.svelte.ts`)
3. **Tests**
   - `src/lib/playroom/iq-test/pmv.test.ts`: change "deriving the MP4 from a playlist beside it" to
     expect `mediaUrl: ''` for a beside-playlist result too, with a comment naming the mismatch.
   - `src/routes/api/playroom/iq-test/pmvs/server.test.ts` /
     `src/lib/server/playroom-pmv.test.ts`: add a case where a search result with a "beside"
     playlist is resolved from its page's `videoUrl`, and the derived name is never used.
4. **Docs**: in `docs/playroom.md` → PMVHaven, replace the "The file." bullet with the same
   explanation, and add a line on why HLS can't be used (no CORS).

## Verification

- `npm run check`, `npm run lint`, and `npx vitest run --project server src/lib/playroom src/lib/server src/routes/api/playroom`.
- Commit and push. Once the preview deploys, fetch random picks repeatedly from
  `/api/playroom/iq-test/pmvs?vibe=gooner&random=1` and `?vibe=denial&random=1`, and check that
  every `mediaUrl` answers `206` to `curl -r 0-100`. Also check that searching for "Gooner Anthem"
  through `/pmvs/<id>` returns the `zucea9lb.mp4` file.
- Open `/playroom/iq-test` on the preview with a PMV vibe and confirm that a video plays.

## Out of scope

The provider-generic refactor (shared cached index, `/hypnos/[source]`, a client-side provider
table) is a separate change that still needs the user's go-ahead.
