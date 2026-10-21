# Separate model-provider credentials from model settings

## Context

Admin → Server settings (`/admin/server`) hard-wires one provider per card:
the Language models card holds the OpenRouter key and the story model, the
Image models card the Runware key and the two picture models. Setting keys are
provider-named (`openrouterStoryModel`, `runwarePhotoModel`, …). To add more
providers soon, credentials become **per provider, set once, shared by every
model that uses it**, and each model setting gains a **provider dropdown**
(one entry today). Decided with the user:

- A new **Model providers** card lists every provider with its key status and
  an *Add key* / *Manage* button; plus, in a model card, when the chosen
  provider has no key, an inline notice whose button opens the same dialog.
- The dropdown is **per model setting** (story, photo, illustration), not per
  card.

## Storage

- **Credentials keep their keys**: `openrouterApiKey`, `runwareApiKey` are
  already per-provider. No change to `SECRET_SETTING_KEYS`.
- **Model settings move to provider-neutral keys** `storyModel`, `photoModel`,
  `illustratedModel`, whose JSON gains a provider:
  `{"provider":"openrouter","preset":"hermes"}`,
  `{"provider":"openrouter","openrouterModelId":"v/m","tools":true}`,
  `{"provider":"runware","runwareModelAir":"civitai:1@2","base":"pony"}`.
  Custom ids keep their provider-named fields (an id means nothing to another
  provider — existing doc rule).
- **Data migration**: `npx drizzle-kit generate --custom --name copy_model_settings_to_provider_neutral_keys`,
  then fill in SQL that *copies* (not renames) each old row into its new key,
  adding `provider` with `json_set` when `json_valid(value)`, else copying the
  value as is (`''` stays `''`), `ON CONFLICT DO NOTHING`. Old rows stay, so a
  rollback still finds them (the "unknown keys are ignored" rule). No DROP, so
  `migrations.test.ts` is happy. Timestamps come from the SQL defaults; carry
  `source` over.
- Parsers tolerate a missing `provider` (read as the kind's only provider) so a
  hand-written row or old fixture still parses; an unknown provider reads as
  the default, as an unknown preset does now.

## Pure half — `src/lib/server-settings.ts`

- Swap `openrouterStoryModel`/`runwarePhotoModel`/`runwareIllustratedModel`
  for `storyModel`/`photoModel`/`illustratedModel` in `SERVER_SETTING_KEYS`.
- New provider registry section:
  ```ts
  export const MODEL_PROVIDERS = {
    openrouter: { label: 'OpenRouter', kinds: ['language'], credentialKey: 'openrouterApiKey',
                  keyHint: 'From openrouter.ai → Keys. …', keyPlaceholder: 'sk-or-…' },
    runware:    { label: 'Runware', kinds: ['image'], credentialKey: 'runwareApiKey',
                  keyHint: 'From runware.ai → API Keys. …' }
  } as const satisfies Record<string, ModelProvider>;
  export type ModelProviderId; LanguageProviderId; ImageProviderId;
  export const LANGUAGE_PROVIDERS / IMAGE_PROVIDERS  // ids filtered by kind
  export function providerCredential(settings, provider): string  // trimmed key
  ```
  `kinds` is a list because a future provider may serve both.
- Choice types become `StoryModelChoice = { provider: 'openrouter' } & (existing OpenRouter shape)`
  and `PictureModelChoice = { provider: 'runware' } & (existing Runware shape)`;
  presets stay as they are but are reached through
  `STORY_MODEL_PRESETS[provider]` / `PICTURE_MODEL_PRESETS[provider][style]`.
  `parseStoryModel`, `parsePictureModel`, `openrouterModelIdFor`,
  `runwarePictureModelFor`, `storyModelCallsTools` updated accordingly;
  `RUNWARE_PICTURE_MODEL_SETTING` → `PICTURE_MODEL_SETTING`.

## Server

- `src/lib/server/daydream/config.ts`: `DaydreamSettings` picks `storyModel`
  plus the credential keys; key = `providerCredential(settings, choice.provider)`;
  config carries `provider`. Only the OpenRouter client exists, so no dispatch
  beyond that.
- `src/lib/server/daydream/image-config.ts`: likewise via `PICTURE_MODEL_SETTING`;
  null unless every style's provider has a key (today: the Runware key). Shape
  otherwise unchanged; comment that a second image provider makes the key per
  style.
- `src/lib/server/settings/status.ts`: `languageModels` / `imageModels` = the
  chosen models' providers have keys.
- `src/lib/server/settings/legacy-env.ts` (temporary): targets the new keys
  and writes `provider` into the JSON.
- `src/routes/api/admin/models/runware/+server.ts`: unchanged (reads
  `runwareApiKey` directly, which is still that provider's key) — or via
  `providerCredential` for consistency.

## Forms — `src/lib/schemas/serverSettingsForms.ts`

- New `modelProviderFormSchema = { provider: z.enum(providerIds), apiKey, apiKeyChange: secretChange }`.
- `languageModelSettingsFormSchema`: drop the key fields; add
  `storyProvider: z.enum(LANGUAGE_PROVIDERS)`; `storyModel` becomes a string
  checked in `superRefine` to be `custom` or a preset **of that provider**.
- `imageModelSettingsFormSchema`: drop the key fields; add `photoProvider`,
  `illustratedProvider`; same per-provider preset check.

## Page — `src/routes/(auth-required)/(app)/admin/server/`

`+page.server.ts`
- Load: one superform per provider (`id: provider-<id>`), returned as
  `providerForms`; model forms seeded with the provider fields; `secrets`
  unchanged (already per credential key).
- New action `saveModelProvider`: `requireAdmin`, validate, map
  `provider → credentialKey`, `secretAfter(...)`, save, clear typed value,
  `message(form, 'Saved.')`. Superforms routes the result to the right form by id.
- `saveLanguageModels` / `saveImageModels`: no key handling; save
  `storyModel` / `photoModel` / `illustratedModel` with `provider`.
  `callsTools` only asked when provider is OpenRouter.

`+page.svelte`
- New first model-related card **Model providers**: a row per provider —
  label, which kinds it serves, "Saved, ending …abcd" or "Not set", and a
  button *Add key* / *Manage* opening that provider's dialog. Badge-free.
- One `wa-dialog` per provider containing its form with `SecretSettingField`
  (`field="apiKey"`, `changeField="apiKeyChange"`, hint/placeholder from the
  registry); closes on a success message, as the VAPID dialog does
  (`closeOnResult` pattern, generalised).
- Language/Image cards: remove the `SecretSettingField`s; lead copy no longer
  names one provider. Above each `ModelChoice`, the new provider field.
- `stillInEnv` env notes: provider key variables move to the providers card;
  model ones stay with their cards under the new keys.

New `src/lib/components/admin/ModelProviderField.svelte`
- `wa-select` of the providers for a kind (change listened with
  `addEventListener`, as `ModelChoice`'s base select does — delegation doesn't
  cross the shadow root). Changing provider resets the choice to that
  provider's first preset and clears the custom id/base.
- If `stored[credentialKey].set` is false for the selected provider: an inline
  `wa-callout` "OpenRouter has no API key yet; models from it can't be used."
  with an *Add OpenRouter key* button calling `onAddKey(provider)`.

`ModelChoice.svelte`: `provider` prop typed as `ModelProviderId`, passed the
selected provider; labels come from the registry instead of the ternaries.
Presets passed in are those of the selected provider (derived in the page).

## Tests

- `src/lib/server-settings.test.ts` (or existing tests for parsers): provider
  in/absent/unknown, preset per provider, `providerCredential`.
- `src/lib/server/settings/index.test.ts` + legacy import: new keys and
  `provider` in imported JSON.
- New migration test (beside `migrations.test.ts` or in `index.test.ts` via
  `createTestDb` with rows inserted before the migration… simpler: a test that
  applies migrations up to 0041, inserts old rows incl. `''` and malformed,
  applies 0042, and checks the copies) — check whether `createTestDb` can stop
  at a migration; if not, run the SQL file directly against a db holding the
  old rows.
- `daydream/config.test.ts`, `image-config` tests, route tests that set
  `openrouterStoryModel`/`runwarePhotoModel` (suggest, reply, image, prompt,
  daydreams pages): renamed keys.
- `page.server.test.ts`: `saveModelProvider` (set, keep, remove, admin-only,
  key never in load data), model saves store `provider`, preset from the
  wrong provider rejected.
- `ServerSettingsFields.svelte.test.ts` + harness: the provider field shows
  the notice only when the selected provider has no key, and its button calls
  `onAddKey`.
- `e2e/global-setup.ts` writes the new keys; `e2e/admin-settings.spec.ts`:
  update key names/JSON, find the saved key in the Model providers card, and a
  new test: remove nothing shared — open the OpenRouter dialog from the card,
  check it shows "Saved", cancel; the inline notice is exercised in the
  component test (the suite's shared settings always have keys).

## Docs

- `docs/server-settings.md`: page now six cards; new "Providers and their
  credentials" section (registry, one key per provider, inline notice +
  dialog); "Choosing a model" stored-JSON examples with `provider`; key
  names; the copy migration and rollback note; testing list.
- `docs/daydreams.md` / anywhere naming `openrouterStoryModel` etc. (grep).
- `AGENTS.md`: only if a statement becomes wrong (grep for the key names).
- Copy this plan to `docs/historical-plans/2026-10-21-model-provider-credentials.md`.
- Roadmap: check `src/lib/roadmap/roadmap.json` for a providers entry.

## Verification

```sh
npm run check && npm run lint && npm test && npm run test:e2e
npm run db:migrate:dev   # then open /admin/server: settings carried over, provider dropdowns show OpenRouter/Runware
```
Manually: remove the Runware key from the providers card → Image models
shows the notice and Off badge; *Add Runware key* in the notice opens the
dialog, saving closes it and the notice disappears; a daydream still writes
and draws with keys set.
