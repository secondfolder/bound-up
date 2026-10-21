# Server settings

Everything a server needs beyond its database and its address — its auth
secret, its push keys, how it sends email, and which model providers and
models Daydreams use — is a **server setting**: a row in the
`server_settings` table, edited by an admin at Settings → Admin → Server
settings (`/admin/server`). None of it is an environment variable any more.

The only variables left in `.env.example` are `DATABASE_URL` and the dev
tunnel's `CF_TUNNEL_NAME` / `CF_TUNNEL_AUTO_START`. Deployment plumbing that
is not a choice an admin makes stays in the environment too: `ORIGIN`,
`MEDIA_DIR`, `ADDRESS_HEADER`, `XFF_DEPTH`, `AUTH_RATE_LIMIT`, and the e2e
suite's provider seams `OPENROUTER_BASE_URL` and `RUNWARE_BASE_URL`.

Why: one set of secrets per environment, kept in step by a script
(`scripts/secrets.mjs`, now gone), across `.env`, `.dev.vars`, wrangler
secrets, the Preview base config and a self-hoster's `.env`, was a lot of
places to get a key wrong, and changing a model meant a redeploy. In the
database, a new server needs nothing set before it starts, and each database
— production, previews, a self-hosted volume — carries its own.

| File                                               | What it holds                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/lib/server-settings.ts`                       | The keys, the model providers, presets and base models, parsing a choice. Pure                |
| `src/lib/server/settings/index.ts`                 | Loading (and filling in), saving, regenerating, the Workers cache                             |
| `src/lib/server/settings/legacy-env.ts`            | **Temporary**: the one-time import from the old environment variables                         |
| `src/lib/server/settings/status.ts`                | What is set up, for the admin hub and the settings page's badges                              |
| `src/lib/schemas/serverSettingsForms.ts`           | One Zod schema per card on the page                                                           |
| `src/routes/(auth-required)/(app)/admin/server/`   | The page and its actions                                                                      |
| `src/routes/api/admin/models/{openrouter,runware}` | The model searches behind Custom                                                              |
| `src/lib/components/admin/`                        | `SecretSettingField`, `ProviderKeyDialog`, `ModelProviderField`, `ModelChoice`, `ModelSearch` |

## Storage

One row per setting: `key`, `value` (text), `source` and timestamps. `source`
is `generated` (the server made it), `imported` (copied from the environment,
see below) or `admin` (saved from the page); the page says which beside the
server secret and the push keys, which is how anyone migrating can see that the
old secret was carried over rather than replaced.

**A missing row and an empty one mean different things.** Missing is "never
set", which the import and the generators fill in. Cleared is a row holding
`''`, so that removing an API key from the page sticks: the import never
brings back something an admin took out. Model choices are JSON (below);
everything else is the plain value.

Keys this build does not know are left in the table and ignored, so rolling
back to an older build finds its rows still there.

## Reading them

`hooks.server.ts` reads every setting once per request with
`loadServerSettings(db, platform)` and puts them in `locals.settings`, a
record of strings with `''` for anything unset. Everything that used to read
the environment reads that instead: `readMailConfig`, `readVapidConfig`,
`readDaydreamConfig`, `readImageConfig`, and the server secret Better Auth and
the rate limiters are built with.

**On Workers they are cached per isolate for a minute** (`WORKERS_CACHE_MS`).
Every request needs the server secret, and D1 bills each row read, so reading the
table on every request would be most of a Free plan's reads. The cache holds
values, not the binding, so it is not the `db` singleton invariant 2 rules out,
and a write drops it in the isolate that made it. The cost: another isolate
can go on using the old values for up to a minute — including a regenerated
server secret, which it keeps accepting until it reads again.

The local backends (`vite dev`, the Docker image, the tests) read the table on
every request, where it costs microseconds and nothing, so they are never
stale. That is also what lets the e2e suite write settings straight into its
database and have them apply at once.

The settings page itself reads the rows again in its load rather than taking
`locals.settings`: after an action, the load runs in the same request, and
`locals.settings` is from before the action wrote.

## What is generated

The first time the server finds them missing, `loadServerSettings` generates:

- **`serverSecret`** — 32 random bytes as hex. It signs every session, keys the
  rate limiters' hashed buckets, derives the server's half of each recovery
  escrow (`escrowShare` in `$lib/server/vaults`), and signs the Playroom's
  signed-out IQ test share links (`iq-test-share.ts`). Other docs call it the auth secret. Named `serverSecret`
  rather than after Better Auth, whose `BETTER_AUTH_SECRET` it replaced,
  because it is the whole server's — and not `authSecret`, which is already
  the password-derived credential the browser posts at sign-in.
- **`vapidPublicKey` / `vapidPrivateKey`** — a P-256 pair, base64url, together
  or not at all: a public key from one pair and a private key from another
  would sign tokens no push service accepts.

**What it costs to keep the server secret beside the data.** It used to live
only in the environment, so a stolen database held neither the server's half
of a recovery escrow nor the key to the HMACs of addresses and emails in the
rate-limit and recovery tables. Now a copy of the whole database has both. The
escrow still opens nothing without the partner's half, sealed to the
partner's own key, and the HMACs still protect against any one table leaking
— but the margin is narrower, and docs/encryption.md, account-recovery.md and
rate-limiting.md say so where they rely on it. That is the price of a server
that needs no secret set before it starts.

They are stored with `insert … on conflict do nothing`, in one batch, and read
back, so two isolates or two requests filling in at once agree on whichever
got there first. Because the server secret can no longer be unset, the old
`BETTER_AUTH_SECRET is not set` failure in the hook is gone: Better Auth
never gets the chance to fall back to its hard-coded default.

### Regenerating

Each has a **Regenerate** button, behind a confirmation that says what it
costs:

- **The server secret** (`regenerateServerSecret`): everyone is signed out — the
  admin too, so the action ends on `/login` — the rate-limit counts start
  again, and every recovery escrow stops working until its owner next opens
  the app, which makes a new one, and signed-out IQ test share links stop
  opening. For a secret that may have leaked.
- **The push keys** (`regenerateVapidKeys`): every row in `push_subscriptions`
  is deleted in the same batch. Each was made with the old public key, so a
  push service would refuse every token for it; with them gone, each device's
  notification settings show off, to be turned on again.

## The page

Six cards, each with its own superform and action, each with a save button
that stays outlined until it has something valid to save, then turns solid
amber (`appearance="accent"`). A save that lands shows a check and the
action's message beside the button (`SavedNote`). A sticky row of links at
the top jumps to each card, with the same working / not-set-up marks the
admin hub shows, because the page runs to several screens on a phone.

Every card's badge uses one pair of words: **Working** or **Not set up** —
a warning where the server needs the part (email, notifications), neutral
where it is optional (the models). A model card says **Model not found**
instead when the saved custom model is one its provider says it does not
have (`ModelDetails`' `onmissing`, through `ModelChoice`); an edit not yet
saved does not count, since nothing is sent to it.

1. **Email** — the sender (`mailFrom`), how it is sent (`mailTransport`:
   Resend, an SMTP server, or files on this server), and that transport's
   setting. SMTP and files are shown but disabled on Workers, which can open
   neither connections nor files, and refused by the action there too. **Send
   a test email** sends to the admin's own address and waits for the answer:
   every other email is handed to `sendInBackground` so a response time cannot
   say whether an address has an account (docs/email.md), which cannot apply to
   the address of the admin pressing the button.
2. **Model providers** — a row per provider: what it runs, whether its key
   is saved and how it ends, and a button that opens its key in a dialog
   (`ProviderKeyDialog`, the `saveModelProvider` action). See below.
3. **Language models** — the Daydreams story model, with its provider.
   Named for the job rather than for Daydreams, its first user, so a later
   feature that writes text adds its own model setting here.
4. **Image models** — a Daydreams model for each picture style, each with
   its provider, named the same way.
5. **Notifications** — the contact address push services are given
   (`vapidSubject`), the public key, and Regenerate. The address is optional:
   empty, it is `mailto:` the sender's address (`defaultVapidSubject`), and
   push is off only with neither.
6. **Server secret** — never shown, where it came from, and Regenerate.

**A credential never reaches the browser** (`SECRET_SETTING_KEYS`: the auth
secret, the private push key, the Resend key, the SMTP URL with its password,
the provider keys). The page is told whether each is set and its last four
characters (`secretTail`), and `SecretSettingField` shows "Saved, ending
…abcd" with Replace and Remove. The field starts empty and an empty field
means keep: typing in it replaces the stored value. Remove is said in a
hidden `…Change` field, because an empty field already means keep
(`secretAfter` in the page's server file). After a save, the form comes back
with the typed value cleared, so it is not posted again.

Whether a chosen transport has its credential is checked in the action,
against what will be stored, because only the server knows whether one
already is.

Every load and action calls `requireAdmin`, as do both search endpoints. The
admin hub (`/admin`) shows a line per area — Email, Language models, Image models,
Notifications — and a warning when email is not set up, since nobody can
confirm a new account until it is.

## Model providers

**Credentials belong to providers, not to models.** A provider —
OpenRouter, Runware — is a service models run on, and it needs one key: the
account the requests are billed to. `MODEL_PROVIDERS` in `server-settings.ts`
is the registry: each provider's label, the setting its key is stored under
(`openrouterApiKey`, `runwareApiKey`), and the hint and placeholder its key
field shows. `LANGUAGE_PROVIDERS` and `IMAGE_PROVIDERS` say which kinds of
model each runs — lists rather than a kind per provider, so one that runs both
is simply in both. Every model setting that chooses a provider uses its key,
read with `providerCredential`, so a key is set once however many models use
it.

**Each model setting chooses its provider**, in a `wa-select` drawn inside
its fieldset (`ModelProviderField`). There is one provider of each kind so
far, so each list has one entry; the choice is per setting rather than per
card, so photos and illustrations could come from different providers.
Changing provider starts the choice again from that provider's first preset,
because a preset or a custom id means nothing to any other provider.

**A model whose provider has no key says so where it is chosen**: a callout
under the provider, with an *Add … key* button. It opens the same dialog as
the provider's row under Model providers — one form per provider (`id:
provider-<id>`), however the admin came to it — and the dialog closes once
the key is saved. Which provider's key is being saved comes from the form;
the setting it is stored under comes from the registry, never from the
browser, so a forged `provider` is refused rather than written anywhere.

Whether Daydreams are on (`readDaydreamConfig`) and whether they have
pictures (`readImageConfig`), and the admin hub's status marks and the
cards' Working / Not set up badges (`serverSettingsStatus`), all ask the same
question: does the chosen model's provider have a key. Only the "Model not
found" badge asks the provider anything, and only in the browser.

## Choosing a model

A model setting is a provider, then a **preset** of that provider's or
**Custom**.

**A preset is named for a family, not a version**, and stored by its name,
with its provider — `{"provider":"openrouter","preset":"hermes"}`. What it sends to is in code
(`STORY_MODEL_PRESETS`, `PICTURE_MODEL_PRESETS`, per provider), so moving
a preset to a newer release is a change to `server-settings.ts` that moves
every server that chose it. Every story preset is an open-weights model whose
terms, and whose providers' terms on OpenRouter, allow adult fiction. The
picture presets each pin a Runware AIR to a version and record its base
model.

**Custom stores a provider's id exactly**, and every key, field and label that
holds one names its provider, because an id means nothing to the other:
`{"provider":"openrouter","openrouterModelId":"vendor/model"}` for the story,
`{"provider":"runware","runwareModelAir":"civitai:123@456","base":"pony"}` for
a picture, under the settings `storyModel`, `photoModel` and
`illustratedModel`. The
picker (`ModelChoice`) finds one by searching:

- **OpenRouter** — `GET /api/admin/models/openrouter?q=`, every word of the
  query in a model's id or name, from OpenRouter's public model list (no key
  needed), cached per isolate or process for ten minutes. Each result shows
  its price per million tokens.
- **Runware** — `GET /api/admin/models/runware?q=`, Runware's `modelSearch`
  over checkpoints, with the **saved** key: before one is saved, or if
  Runware refuses it, the endpoint answers 409 with a message the picker
  shows inline. Only what Runware hosts can be drawn with — it does not have
  every Civitai version — which is why it searches there rather than Civitai.

**Whatever a custom id came from — a search result, typed, pasted, or saved
before — `ModelDetails` shows what the provider says it is**, so a typo is
seen before it is saved. A typed id is looked up exactly after a pause in
typing: `?id=` on the OpenRouter endpoint, `?air=` on the Runware one, each
answering that model or nothing ("OpenRouter doesn't list…", "Runware doesn't
host…"). For OpenRouter that is the model's name, context and price, and its
description; an `@` suffix (`z-ai/glm-5.2@preset/nsfw-compatible`) only says
how the request is routed, so the lookup goes by what comes before it
(`splitOpenRouterModelId`) and the suffix is shown beside it. For Runware it is
what helps choose the base model: the architecture Runware lists, the
description (as plain text — authors write HTML there), its tags and trigger
words, and the steps and CFG its author recommends, since ~8 steps at CFG 1
marks a distilled model like Z-Image Turbo whatever its name says. A typed AIR
Runware recognises fills in the base model only if none is chosen yet.

**Saving a custom story model asks OpenRouter whether it calls tools**,
from the same cached list, and stores `"tools":true` beside the id when it
does (`storyModelCallsTools`). That is what lets a daydream brief's links be
read ([daydreams.md](daydreams.md#links-in-a-brief)). It is asked once, when
the model is saved, not on every suggestion; if OpenRouter cannot be reached
the model is saved without it, and saving it again asks again. The panel
says which the saved model is. The presets never call tools.

Ids are matched loosely enough for what the providers really use: an
OpenRouter id may have a `:variant` and an `@` suffix with slashes in it, and
a Runware AIR's version may have letters (`persona:242173@2788849L`).

**A picture model's base model decides how it is prompted.** The choices are
`PICTURE_BASE_MODELS`: SDXL, Illustrious, Pony, NoobAI, Z-Image Turbo and
FLUX.2 Klein, each mapped to one of `image-prompt.ts`'s recipes
(`PictureArchitecture`: tags, negative prompt and real guidance for the SDXL
family; sentences and light guidance for Z-Image Turbo; sentences, subject
first, in 4 steps for FLUX.2 Klein). Only Klein's distilled models map to it:
Runware's `flux2klein_base_*` are undistilled and want ~28 steps, so they map
to nothing and the admin chooses. They are kept finer than the recipes so the
stored choice says what the model is, and a recipe can be split for one
family later without asking anyone again. A Runware search result fills the
base model in when its architecture maps to one
(`pictureBaseModelForRunware`); the admin can change it, and Custom cannot be
saved without one.

The base model is part of the setting rather than asked of Runware when a
picture is made, as it used to be: a model Runware misreports, or one of a
family no recipe suits, is then the admin's choice to make knowingly, not a
failed picture.

A stored choice that no longer parses — a preset since removed, or a
provider this build does not know, say — reads as the default
(`parseStoryModel`, `parsePictureModel`), so a bad row cannot take Daydreams
down with it. One with no `provider` at all reads as the kind's first
provider, which is what every choice was before there was a choice of them.

**The settings used to be named for their provider** —
`openrouterStoryModel`, `runwarePhotoModel`, `runwareIllustratedModel`.
Migration 0042 copied each into its new key with its provider added, leaving
a cleared one cleared and the old rows where they were, so a rollback to an
older build still finds them; this build ignores them, like any key it does
not know.

## Email on a new server

A server without email starts, unlike before, because its email is set up
from inside it. Two things keep that from being a dead end:

- **Under `vite dev`**, an unset sender and transport fall back to the outbox
  `./.mail-outbox`, from `Bound Up <dev@localhost>` (`parseMailConfig`'s
  `devDefaults`), and the page says so.
- **The very first account is confirmed without a link** when email is not
  set up: the sign-up action checks that it is the only account and that
  `mailProblem` is not null, marks it verified, and sends it to
  `/login?setup=1`, which says it is the admin and should set up email. It
  widens nothing — whoever signs up first is the admin anyway (migration 0018)
  — and once email works, or a second account exists, everyone confirms as
  usual.

## The one-time import from the environment

**Temporary**, and listed in [temporary-code.md](temporary-code.md#server-settings-from-the-environment).
When a setting has no row and its old variable is set — `platform.env` on
Workers, the process environment elsewhere — `legacy-env.ts` copies it in
once, as `imported`; after that the database owns it and the variable is
never read for it again. That is what carries an existing deployment across
without signing everyone out. The admin page notes each old variable still
set ("ignored; remove it"), which says when it is safe to delete them.

Model variables are translated: `DAYDREAM_MODEL` becomes its preset if it
matches one's id, else a custom choice; a `RUNWARE_AI_IMAGE_MODEL*` is
imported only when it matches a preset or an AIR whose base model is known,
and otherwise skipped with a warning in the log, since a guessed base model
would prompt it the wrong way. Which transport was meant used to be which one
of `RESEND_API_KEY`, `SMTP_URL` and `MAIL_OUTBOX_DIR` was set, so the
transport is imported only when exactly one was.

Nothing but an upgrade may rely on it. The e2e suite writes every setting
itself (`e2e/global-setup.ts`), all of them rather than only those it needs,
because `vite dev` reads a developer's `.env` and the import would otherwise
copy a real key into the run.

## Testing

- `src/lib/server-settings.test.ts` — parsing a choice, its provider
  included, and the provider registry.
- `src/lib/server/settings/index.test.ts` — generating once, concurrent
  loads agreeing, the import and its rules, regenerating.
- `src/lib/server/db/migrations.test.ts` — migration 0042's copy.
- `src/routes/(auth-required)/(app)/admin/server/page.server.test.ts` — every
  action, admin-only, credentials never in the load data.
- `src/routes/api/admin/models/*/server.test.ts` — the searches.
- `src/routes/(public)/signup/first-account.server.test.ts` — the bootstrap,
  with `dev` mocked off (under vitest the dev outbox makes email always work).
- `src/lib/components/admin/ServerSettingsFields.svelte.test.ts` — the
  credential field, the provider field and its missing-key callout, and the
  picker.
- `e2e/admin-settings.spec.ts` — the page in a browser. The settings are
  shared by every worker in a run, so it regenerates nothing and puts back
  what it saves.

`fakeEvent` gives `locals.settings` a server with nothing set up
(`testSettings()` from `$lib/testing/settings`) unless a test passes its own.
