# Media transcoding with a quality control

## Context

Message media is uploaded as the original file bytes. A phone photo is 3–8 MB,
a 20-second clip is often 30 MB+ and trips the 15 MB video cap. That costs R2
storage, the Worker's bandwidth, and the recipient's download time (age
ciphertext isn't seekable, so every file downloads in full before it shows).
Nothing in the repo transcodes today (no canvas, WebCodecs, or media
dependencies).

Because messages are end-to-end encrypted, transcoding **must run in the
sender's browser, before `encryptAttachment`**. The server only ever sees
ciphertext.

Decisions (confirmed with user):
- Transcode **images and video**. Audio stays out of scope.
- Images → **AVIF**. Where a browser can't display AVIF, the preview shows a
  small warning suggesting a browser update.
- **Native decode only.** If the sender's browser can't decode a file (for
  example HEIC on Chrome), it is sent untouched.
- Tiers: without the feature, always **Low** and no control is shown. With the
  new `highQualityMedia` feature, the composer offers **Low / High / Original**,
  defaulting to **High**. Original means the untouched bytes.

## Quality tiers (`src/lib/media-quality.ts`, pure, alias-free)

| Tier     | Image                           | Video                                           |
| -------- | ------------------------------- | ----------------------------------------------- |
| Low      | long edge ≤ 1600 px, AVIF q≈50  | short edge ≤ 720 px, VP9 ~0.8 Mbps (H.264 ~1 Mbps), Opus 96 kbps |
| High     | long edge ≤ 3200 px, AVIF q≈70  | short edge ≤ 1080 px, VP9 ~2.5 Mbps (H.264 ~4 Mbps), Opus 128 kbps |
| Original | untouched                       | untouched                                       |

- The module exports `MEDIA_QUALITIES`, the `MediaQuality` type,
  `defaultQuality(hasFeature)` (`'high'` for feature holders, `'low'`
  otherwise), per-tier settings, and a pure
  `fitWithin(w, h, tier)` for the resize maths. Everything here is unit
  testable.
- **Never upscale.** If the output is larger than the input *and* the input is
  already a displayable web format (JPEG, PNG, WebP, AVIF, MP4 H.264), keep the
  input.
- **Pass-through:** GIF and animated images (decoding keeps only the first
  frame), SVG, and anything that fails to decode.
- **Video is VP9 + Opus in WebM, with a fallback to H.264 + AAC in MP4.**
  - VP9 is about 30–40% smaller than H.264 at the same quality.
  - It plays in every current browser, including Safari on macOS and on iOS
    17.4 and later.
  - Not AV1: Safari only decodes AV1 on recent hardware.
  - The sender picks the first codec its WebCodecs can encode (mediabunny's
    `canEncode`/`getFirstEncodableVideoCodec(['vp9','avc'])`), with the
    container to match.
  - On the reader's side, a video the browser can't play gets the same "update
    your browser" warning as AVIF (see §4).
  - Trade-off: in-browser VP9 encoding is slower than H.264 where there's no
    hardware encoder, which is why the send button shows progress.
- Re-encoding strips EXIF, GPS included, which is a privacy win worth stating
  in the docs. Original keeps the metadata, so the Original menu item gets a
  short hint ("Keeps the file exactly as it is, including location data").

## Implementation

### 1. Browser transcoder: `src/lib/media/` (new, browser-only like `src/lib/crypto/`)
- `transcode.ts` provides `transcodeForUpload(file, quality, onProgress?): Promise<File>`.
  - It dispatches on `file.type`.
  - It returns a new `File` with the correct `type` and a renamed extension
    (`IMG_1234.avif`, `clip.mp4`), because `buildBody` takes `mimeType` and
    `fileName` from the file.
  - When quality is `original` it returns the file unchanged.
- `image.worker.ts` runs in a Web Worker (Vite `?worker`) so a multi-second
  encode doesn't freeze the composer. It:
  1. decodes with `createImageBitmap(file, { imageOrientation: 'from-image' })`;
  2. draws onto an `OffscreenCanvas` at `fitWithin` size;
  3. calls `getImageData`;
  4. encodes with **`@jsquash/avif`**. Use the single-thread build: the
     multi-thread one needs COOP/COEP headers.
  - A decode failure posts back "pass through".
- `video.ts` lazily imports **`mediabunny`** and uses its `Conversion`
  (`Input` → `Output` with `WebMOutputFormat` for VP9/Opus, or
  `Mp4OutputFormat` for the H.264/AAC fallback, and a `BufferTarget`). It sets
  `video: { width/height, bitrate, codec }` and `audio: { bitrate, codec }`,
  and reports `onProgress`.
  - If WebCodecs can't encode (for example older Firefox Android), fall back to
    the original. The 15 MB cap then applies as it does today.
- Load both libraries with `await import()` so only a send with media pays for
  them. List them in `optimizeDeps` in `vite.config.ts` (AGENTS.md trap about
  mid-run re-optimisation). jsquash's wasm resolves via `import.meta.url` and
  may need `exclude` instead; verify under `vite dev` and `npm run preview`.
- `support.ts` provides a memoised `canDisplayAvif(): Promise<boolean>`,
  which decodes a tiny embedded AVIF data URI through `new Image()`, and
  `canPlayVideo(mimeType)`, which uses `canPlayType('video/webm; codecs="vp9,opus"')`
  and friends. The codec string is stored in the manifest's `mimeType`.

### 2. Send path: `src/lib/messaging/client.ts`
- Add `quality?: MediaQuality` to `ComposedMessage`. Omitted means `low`. The
  composer always passes one explicitly.
- `sendMessage(target, message, recipients, { onProgress })`:
  1. run `checkComposed` for empty, too-long and too-many;
  2. `files = await Promise.all(files.map(transcodeForUpload))`, run
     sequentially per video to bound memory;
  3. re-run the **size** checks (`video-too-big`, `too-big`) on the
     *transcoded* files;
  4. `buildBody`.
- Split `checkComposed` so the composer's live check only applies the byte
  limits when quality is `original`. Otherwise a 40 MB clip would be refused
  before it's compressed. Keep the existing comment about why the server's copy
  is the one that counts.
- If the account lacks the feature, the client always uses `low`, even if a
  stale page says otherwise. The server budget below backs this up.
- Thread `onProgress` through `ThreadView.svelte` and `NewMessageDialog.svelte`,
  which own `send`, to the composer.

### 3. Composer UI: `src/lib/components/MessageComposer.svelte`
- New prop `highQualityMedia = false`, passed as
  `hasFeature(data.features, 'highQualityMedia')` in
  `partner/[id]/messages/+page.svelte` and `[threadId]/+page.svelte`, exactly
  as `permanentMedia` is.
- When there are files and `highQualityMedia` is set, show a second row next to
  `.ttl` that copies the TTL pattern: an icon, a visually-hidden label, a
  `wa-dropdown` with a `wa-button` trigger, and `wa-dropdown-item`s for Low /
  High / Original.
  - Use `onwa-select` and read `value` as a property.
  - The default is **High** for feature holders:
    `defaultQuality = $derived(defaultQuality(highQualityMedia))`. It's derived
    rather than copied, so a grant that arrives with a refresh moves an
    untouched menu along with it, as `defaultTtl` does.
  - State is `chosenQuality: MediaQuality | null` (null means the default),
    reset to null after a send. Resetting stops Original from sticking
    unnoticed, for the same reason the TTL resets.
- While sending with media, the send button's spinner gets a status line such
  as "Compressing 2 of 3…" or "Compressing video 45%", fed by `onProgress`.
  Use `aria-live="polite"`.
- The file list keeps showing original sizes. The final size is only known
  after compressing, and the list clears on send.

### 4. Reading side: `src/lib/components/AttachmentPreview.svelte`
- When `info.mimeType === 'image/avif'` and `canDisplayAvif()` is false, render
  a small `wa-callout` warning instead of a broken `<img>`: "This photo can't be
  shown in this browser. Updating your browser should fix it."
- For video, do the same when `canPlayVideo(info.mimeType)` is false (VP9/WebM
  on iOS before 17.4, for example): "This video can't be played in this
  browser. Updating your browser should fix it." The `<video>` `error` event
  triggers the same state.
- Also handle `<img onerror>` (a HEIC sent as-is, for example) with a generic
  "This browser can't show this file". Today it shows as a broken image.
- `ThreadSticker.svelte` thumbnails get the same fallback: a plain tile, no
  broken image.

### 5. Feature and server budget
- `src/lib/features.ts`: add `highQualityMedia: { name: 'Higher quality uploads', description: … }`.
  The admin grant UI picks it up automatically.
- **Server enforcement (invariant 14).** The server can't see quality, because
  it only sees ciphertext, so the enforceable part is bytes. In
  `src/lib/server/messaging.ts`, next to `resolveMediaExpiry`, add a check. For
  a sender without `highQualityMedia`, the attachment total is capped at a new
  `MAX_LOW_QUALITY_TOTAL_BYTES` (10 MB, in `src/lib/messaging.ts`); holders keep
  25 MB. It returns a new `SendFailure` `'needs-high-quality-media'`, mapped to
  413 in `send.ts`'s `sendFailureStatus`, with an actionable message.
  - The client applies the same budget in its post-transcode check, so a normal
    user never hits the server refusal.
  - Low-tier bitrates are sized so about a minute of video fits.

### 6. Dependencies
- `npm i @jsquash/avif mediabunny`. Both are client-only and dynamically
  imported, so they never enter the worker bundle; check with `npm run preview`.

### 7. Cloudflare Workers free plan constraints
- **CPU (10 ms per request).** No transcoding, decoding, or thumbnailing on the
  server; the design keeps every CPU-heavy step in the browser, and this
  constraint is the reason. The server still only counts bytes and writes
  opaque blobs.
- **Memory (128 MB).** Unchanged. `formData()` still buffers the request, and
  transcoding only makes that request smaller. Don't raise
  `MAX_ATTACHMENT_TOTAL_BYTES`.
- **Worker bundle (3 MB compressed on free).**
  - `@jsquash/avif` (wasm) and `mediabunny` must never reach the server graph.
  - Import them only via `await import()` from `src/lib/media/`, which is
    browser-only and never imported by a `+*.server.ts` or `$lib/server/**`.
  - Confirm with `npm run build` that the worker output doesn't grow.
- **Static assets (25 MiB per file).** The AVIF wasm (about 1–3 MB) is served
  as a client asset, well under the limit.
- **D1 reads.** The new budget check shares one feature lookup with
  `resolveMediaExpiry`: read the sender's features once through
  `listUserFeatures` and pass them to both checks, rather than calling
  `userHasFeature` twice. That keeps it to one extra query per send, and zero
  extra for text-only sends, since the check only runs when there are files.
- **R2 (10 GB free).** Transcoding is the main lever for staying under it. No
  change to the storage key layout or lifecycle rules.

## Tests
- **Pure** (`src/lib/media-quality.test.ts`): `fitWithin` (no upscaling,
  portrait and landscape, per tier), plus the pass-through decisions by mime
  type and the keep-the-smaller rule as a pure function.
- **Browser** (`src/lib/media/transcode.svelte.test.ts` or a browser-project
  test, real Chromium):
  - A 4000×3000 canvas PNG → Low gives `image/avif`, long edge 1600, `.avif`
    name, smaller than the input.
  - Original returns the same File.
  - An undecodable blob passes through.
  - A GIF passes through.
  - A short video generated in-test with mediabunny's `CanvasSource` → Low
    gives `video/webm` (VP9) in Chromium, short edge ≤ 720.
  - With VP9 encoding stubbed as unavailable, the same input falls back to
    `video/mp4` (H.264).
- **Component** (`MessageComposer.svelte.test.ts`, reusing `attach()` and
  `choose()`):
  - No quality control without `highQualityMedia`.
  - With it: the three options, **High** by default, the choice passed to
    `send`, reset to High after a send.
  - Without it, `send` receives `low`.
  - A large file isn't refused before sending unless the quality is Original.
- **Component** (`AttachmentPreview.svelte.test.ts`): the AVIF-unsupported
  warning (mock `canDisplayAvif`), the unplayable-video warning (mock
  `canPlayVideo`), and the `onerror` fallback.
- **Server** (`messaging.test.ts`, `send.test.ts`): over 10 MB without the
  feature is refused with `needs-high-quality-media` → 413; holding the feature
  allows up to 25 MB.
- **E2E** (`e2e/messaging.spec.ts`):
  - The existing PNG send now arrives as `image/avif` and renders.
  - A granted account sees the quality control set to High, sends Original, and the
    partner receives the PNG untouched.
  - An account without the feature never sees the control.
  - Grant via the existing raw `user_features` insert.

## Docs
- `docs/messaging.md`:
  - A new "Transcoding" section under "Attachments and media" covering tiers,
    AVIF, VP9/WebM with the H.264/MP4 fallback, pass-through rules, EXIF
    stripping, the byte budget, and the upgrade warnings.
  - Update "Not built yet" and "What the server still knows" (smaller byte
    sizes reveal less).
- `docs/features-and-admin.md`: a "Higher quality uploads" section next to
  "Permanent media", and bump the feature count.
- `AGENTS.md`: a repo-map row for `src/lib/media/` (browser-only, never
  imported from server code), and extend invariant 13's rule to it.
- Copy this plan to `docs/historical-plans/2026-09-28-media-transcoding.md`.

## Verification
1. `npm run check`, `npm run lint`, then `npm test` (vitest node + browser, and
   Playwright).
2. `npm run dev` and send:
   - a large phone JPEG, a HEIC, a GIF, and a ~30 s phone video without the
     feature, and confirm output types and sizes (from `local-media` byte sizes
     and the decrypted manifest);
   - the same as a granted account on High and on Original.
3. Open a thread with an AVIF in a browser without AVIF support (or force
   `canDisplayAvif` false) to see the warning.
4. `npm run preview` and load a thread to confirm the wasm and mediabunny
   chunks load, and the worker bundle doesn't contain them.
