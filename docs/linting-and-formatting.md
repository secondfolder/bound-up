# Linting and formatting

One tool does both: [Biome](https://biomejs.dev), pinned to an exact version in
`package.json` because a Biome upgrade can change what "formatted" means for
every file in the repo. It replaced Prettier, ESLint, `eslint-plugin-svelte`,
`typescript-eslint` and their shared configs.

```sh
npm run lint     # biome ci (format, lint and import sorting) + the Svelte check
npm run format   # rewrites everything the above would complain about
```

## What is configured, and where

| File                                  | What it decides                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `.editorconfig`                        | Indentation, line endings, the final newline — for editors and for Biome alike |
| `biome.jsonc`                          | Which files are covered, formatting, and every lint rule                       |
| `biome-plugins/*.grit`                 | Rules Biome has no built-in for                                                |
| `scripts/format-svelte.mjs`            | The `<script>` and `<style>` blocks of `.svelte` files                         |

`.editorconfig` is the single source of truth for whitespace, so an editor with
no Biome extension still indents this codebase correctly. Biome reads it
(`formatter.useEditorconfig`). **The line width is the exception**: Biome 2.5
honours `indent_style` from `.editorconfig` but ignores `max_line_length`, so
100 columns is written in both files and they have to be changed together.

## The rules are all of them

`biome.jsonc` turns on every rule in every group — including nursery, so a new
rule arrives switched on rather than waiting to be noticed — and raises them all
to `error`, including the ones Biome ships as warnings or hints. Without that
last part a new violation of an info-level rule would never fail `npm run lint`.

Because a group set to a severity cannot also list rules, the exceptions live in
the first entry of `overrides`. **Every exception says why.** Anything not
listed there is enforced, so the fix for a diagnostic is the code, not the list.
The exceptions are, roughly:

- Rules for frameworks this app does not use (React, Qwik, Vue, …).
- Rules that cannot see what SvelteKit does: `noUnresolvedImports` does not
  know `$lib`, `$app` or the generated `./$types`; `noUndeclaredVariables` does
  not know names bound by `{#await … then value}`.
- Rules that contradict each other or the codebase's style: `noVoid` forbids
  exactly the `void promise` that `noFloatingPromises` asks for; `noTernary`
  would outlaw the only conditional a Svelte template can hold.
- Rules whose subject this repo does differently on purpose — the Drizzle
  schema barrel, the `--wa-*` custom properties that come from Web Awesome's
  stylesheet at runtime, Lexical's bitmask formats.

Per-site suppressions are `biome-ignore` comments with a real reason. A
diagnostic reported against an **attribute** rather than an element (the iframe
sandbox in `UrlEmbed.svelte`, the viewport meta in `app.html`) is not reachable
by a plain `biome-ignore`; those use `biome-ignore-start` / `biome-ignore-end`
around the element.

## Svelte is only half formatted

Biome's Svelte support is on (`html.experimentalFullSupportEnabled`) so the
linter can see templates: a11y rules, `{#each}` keys, and variables that are
only read from markup. Its **formatter** is switched off for `.svelte` in
`overrides`, because on this codebase Biome 2.5.14:

- deletes some template comments (the one explaining the hand-swapped spinner
  in `RichTextInline.svelte`),
- duplicates others on every run, so formatting is not idempotent — the comment
  in `Guide.svelte` gained a copy per run,
- re-flows inline markup whose whitespace is load-bearing.

So `scripts/format-svelte.mjs` hands Biome only the `<script>` and `<style>`
blocks — as TypeScript and CSS, which it formats reliably — and puts them back
indented, leaving the markup exactly as written. It skips lines inside template
literals, whose leading whitespace is string content (the halftone shader
source). Markup formatting is therefore a matter for review until Biome's
Svelte formatter can be trusted, at which point the script and the override
both go.

## Rules Biome has no built-in for

GritQL plugins in `biome-plugins/`. Today there is one:
`navigation-through-resolve.grit`, which takes over the script half of
`eslint-plugin-svelte`'s `svelte/no-navigation-without-resolve` — internal
navigation goes through `resolve()` from `$app/paths`. It covers `goto`,
`pushState` and `replaceState` in `.ts` files, in Svelte `<script>` blocks and
in template expressions. It cannot check an `href` attribute: Biome's plugins
do not match markup yet, so **an `href` built without `resolve()` is caught in
review, not by the linter.**

A plugin diagnostic is suppressed as `// biome-ignore lint/plugin: <reason>`.

## Markdown

Biome does not format Markdown, so `docs/*.md`, `README.md` and `AGENTS.md` are
hand-wrapped. Keep to the surrounding width rather than reflowing a whole file.
