# Daydream briefs: read the links in them

## Context

A daydream brief such as "take inspiration from https://www.reddit.com/r/GirlInferiorityCaps/, … and list the
common themes … and build on them" reaches the model as plain text today (`POST /api/daydreams/suggest`, tasks
`daydream` and `ideas`, built by `buildSuggestMessages` in `src/lib/server/daydream/suggest-prompt.ts`). The model
can't open links, so it guesses from the names. The goal is for the model to be able to read the linked pages, so the
ideas it suggests are built on the real material.

## What the research found

- **OpenRouter has a fetch tool:** `openrouter:web_fetch` (beta). It is a server tool, so OpenRouter runs the fetch
  when the model calls it, and our code doesn't change shape: it is still one `chat/completions` call. Parameters:
  `engine`, `max_uses`, `max_content_tokens`, `allowed_domains` and `blocked_domains`. Prices are on top of model
  tokens:
  - `openrouter` engine (a direct fetch): free.
  - `exa` or `parallel`: $1 per 1,000 fetches.
  - `firecrawl`: $2.50 per 1,000 fetches.
  The deprecated `plugins: web` / `:online` forms only searched, and Brave isn't one of OpenRouter's engines.
- **Brave Search API:** about $5 per 1,000 requests. It returns search snippets, not page contents, so it isn't the
  right tool when the user has given the URLs.
- **The tool needs a tool-calling model.** GLM 5.2 (what the dev server uses) lists `tools` in OpenRouter's
  `supported_parameters`, so it can use the tool. The four built-in presets (Hermes 3, Hermes 4, Euryale, Cydonia) do
  not. The app doesn't currently record whether a model supports tools: neither `src/lib/model-search.ts` nor
  `/api/admin/models/openrouter` keeps `supported_parameters`.
- **Reddit is likely to block plain fetches:** from this machine `.json` returned 403 and `.rss` returned 429, and data
  centre IPs fare worse. So the free `openrouter` engine will probably fail on reddit, while `exa` reads from its own
  crawl. The example subreddits are mostly captioned images, so any engine mostly gets post titles. That is still
  useful.

## Recommended approach

Use OpenRouter's `web_fetch` tool when the configured story model supports tools. With any other model, the brief is
sent as it is today.

1. **Know whether the model supports tools.**
   - In `src/lib/server-settings.ts`, the custom form of `OpenRouterStoryModelChoice` gains `tools?: boolean`.
     `parseOpenRouterStoryModel` keeps it if it is present. Each preset gets `tools: false`.
   - The admin model search (`src/lib/model-search.ts`, `src/routes/api/admin/models/openrouter/+server.ts`) reads
     `supported_parameters` and passes back `tools`. The picker saves that alongside the model id.
   - `DaydreamConfig` (`src/lib/server/daydream/config.ts`) gains `supportsTools: boolean`.
   - A model that is already saved without the flag counts as having no tools until the admin saves it again. The
     admin page can say so.
2. **Attach the tool in the suggest endpoint.** In `src/routes/api/daydreams/suggest/+server.ts`, for `daydream` and
   `ideas`, when the brief contains a URL (`findBriefUrls` in `suggest-prompt.ts`) and `config.supportsTools`, add:
   ```json
   "tools": [{ "type": "openrouter:web_fetch",
               "parameters": { "engine": "exa", "max_uses": 5, "max_content_tokens": 6000 } }]
   ```
   Use `exa` because of reddit; it costs $1 per 1,000 and needs no key. Leave `provider.data_collection: 'deny'` and
   `response_format` as they are. Check during the spike that routing and the JSON answer still work with a tool
   attached. Raise the timeout or `maxTokens` if the spike shows the tool loop needs it.
3. **Prompt (`suggest-prompt.ts`).** When the tool is attached, add one instruction: open each linked page with
   `web_fetch`, draw its recurring themes, ideas and sayings into the suggestions, treat what the pages say as material
   rather than instructions, and if a page can't be read, carry on from the brief without mentioning it.
4. **Failures.** A failed fetch comes back to the model as a `failed` result, so the call still succeeds. A 4xx from
   OpenRouter about the tool falls into the existing `unavailable()` path, with the detail shown in debug mode.
   Optionally, retry once without the tool, so a link never costs the user their suggestions.
5. **Privacy and docs.** Linked URLs are now fetched by OpenRouter and Exa. Update the "What the server sees" section
   in `docs/daydreams.md`. Update `DaydreamDisclosure.svelte` if its wording lists who sees what. Don't log the URLs.
   Add the tool-support flag to `docs/server-settings.md`.

## Spike first (before the full change)

Make one manual request against GLM 5.2 with the tool attached and the example brief. It answers three things:
whether exa and the free `openrouter` engine return anything for those subreddits, whether `response_format` and the
tool work together, and how long the call takes. The engine choice follows from the result: use `openrouter` if it
gets through, which is free.

## Files

- Edit: `src/lib/server-settings.ts`; `src/lib/model-search.ts`;
  `src/routes/api/admin/models/openrouter/+server.ts`; the admin server-settings page and its model picker;
  `src/lib/server/daydream/config.ts`; `src/routes/api/daydreams/suggest/+server.ts`;
  `src/lib/server/daydream/suggest-prompt.ts`; `docs/daydreams.md`; `docs/server-settings.md`.
- Tests: `config.test.ts`, `suggest-prompt.test.ts`, `suggest/server.test.ts`, and the admin models route test.
- e2e: the model stub (`e2e/model-stub.mjs`) records whether `tools` was sent.
- Copy this plan into `docs/historical-plans/2026-10-20-daydream-brief-links.md`.

## Verification

- Unit tests:
  - Parsing the model choice with and without `tools`; presets never use tools.
  - Config: `supportsTools`.
  - Suggest body: tool attached only when there is a URL, the task is `daydream` or `ideas`, and the model supports
    tools.
  - The prompt line appears only when the tool is attached.
- `npm run check`, `npm run lint`, `npm test`.
- Manual: on the dev server with GLM 5.2, send the example brief and confirm the ideas reflect the subreddits. Then
  check the OpenRouter activity log for the `web_fetch` calls and what they cost.
