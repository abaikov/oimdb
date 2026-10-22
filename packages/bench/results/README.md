# `results/` — the cells, not artifacts

Written by `npm run bench -- next|run` (`src/cells/cellStore.ts`), read by `status`,
`report` and `publish`. Relocated with `BENCH_RESULTS=<dir>` — a run pointed elsewhere
also publishes next to it (`<dir>/published/`) instead of into the website.

| path | one file per | what it holds |
|---|---|---|
| `cells/<point>--<scenario>.json` | operating point × scenario | the latest record of every participant's cell: fingerprint, environment, sampling plan, the batch it came from (load, control resolution, anchor), and the outcome — measured, disagrees with the reference model, or failed |
| `plans/<point>--<scenario>.json` | operating point × scenario | the sampling plan every participant of that scenario is timed under, and the probes it was derived from |
| `memory/<point>.json` | operating point | the heap each participant held with the whole population loaded, with the fingerprint it was weighed at |
| `batches.jsonl` | batch, appended | every batch ever run: who was in it, how long it took, the load, the control |

**This directory is committed.** Every `next`/`run` writes here and publishes
`website/src/data/bench/results.json`, so a commit after a run carries both the cells and
the page that shows them. Nothing commits on its own — the run writes files and a commit
after it records them. A checkout on another machine reads every cell as stale with reason
`environment` and keeps showing its number until it is re-measured there.
`night.log` is the one file not committed.

A cell is never deleted when the code moves on: it is reported **stale** with the
reason (`harness`, `adapter`, `subject`, `library`, `plan`, `point`, `environment`) and
keeps its number until it is re-measured. See
[`website/docs/benchmarks/methodology.md`](../../../website/docs/benchmarks/methodology.md).