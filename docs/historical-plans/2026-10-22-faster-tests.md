# Faster tests, on CI and locally

The review as it was given in chat, then the decisions taken on it. Frozen:
see the feature docs and the commit history for what was actually built.

## The review

**CI: where the ~40 minutes goes** (last two runs)

| Stage | Time | What's slow |
|---|---|---|
| Lint, check, vitest | ~3.5 min | Nothing much. Vitest is 2 min here (46 s on a Mac) |
| Docker image build | ~3.5 min | The build itself is about 1 min. Exporting the GHA cache with `mode=max` takes 2.4 min |
| E2E against the image | ~13 min | 228 tests on 2 workers |
| Release (semantic-release) | 10–16 min | arm64 is built under QEMU emulation, including `npm ci` and the whole `vite build` |
| Deploy | ~1 min | — |

Recommendations, biggest saving first:

1. Build the JS once, natively, for both architectures (saves ~8–12 min).
   `FROM --platform=$BUILDPLATFORM` on the `deps` and `build` stages; `build/`
   is plain JS, so only `prod-deps` and the runtime stage would still run
   under emulation.
2. Shard the e2e suite (saves ~9 min). A matrix of 3–4 jobs with
   `npx playwright test --shard=i/n`. Raising `workers` instead won't help: the
   suite already keeps a 4-vCPU runner busy, and locally 8 workers were no
   faster and 4 tests failed.
3. Stop `image` from waiting on `verify` (saves ~3.5 min).
4. Make the cache export cheaper (saves ~2 min): `mode=min`, an npm cache
   mount, or skipping `cache-to` on PRs.
5. Small ones (~20–30 s each): cache `~/.cache/ms-playwright` instead of
   `playwright install --with-deps`, and drop the duplicate `npm ci` steps.

Items 1–4 should bring a run to roughly 12–15 minutes.

**Local**

| | Result |
|---|---|
| vitest | 3,843 tests in 46 s. One test is 10 s on its own: `prompt-catalogue.test.ts` › "the axes only ever swaps…" |
| e2e, 4 workers | 235 tests in 7.2 min |
| e2e, 8 workers | 7.0 min, and 4 tests failed from contention |

The heaviest e2e files are `messaging` (381 s of test time, 13.6 s per test),
`daydreams` (256 s) and `kink-list` (180 s).

1. Run local e2e against the built Node server instead of `vite dev`: more
   workers making no difference shows the single-threaded dev server is the
   limit.
2. A cheaper `signUp` helper: it takes about 2.5 s (login 0.5 s) and is called
   192 times, 25–30% of all e2e time.
3. Run only the specs your change touches while iterating:
   `npx playwright test --only-changed=main`.

## The decisions

- Build the JS once, natively, for both architectures: yes, and keep
  publishing both.
- Shard the e2e suite: yes, unless it had been tried and dropped for a reason.
  (It had not: nothing in the history or the docs.)
- `image` stops waiting on `verify`: yes.
- The cheaper cache export and the small ones: yes.
- The 10 s prompt-catalogue test: is it genuinely helpful? (Answered: yes.)
- Why is `messaging` so slow? (Answered.)
- Local e2e against the built Node server: yes — it should also end the reloads
  a file change caused mid-run.
- A cheaper `signUp` helper: yes.
- Running only the touched specs: yes, and make it the documented suggestion.
- No heavy load on the development machine without asking first; work in a
  worktree.
