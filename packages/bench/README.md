# @oimdb/bench

Comparative benchmarks: OIMDB against in-memory stores, reactive state managers and
atomic libraries. Every number comes from one library driving one screen-shaped task in its own
processes. The result is verified against a plain-`Map` reference model before it is timed, and
read against a hand-written anchor timed in the same batch.

The rendered results, participants, scenarios, audit and method are on the docs site
under **Benchmarks** (`website/docs/benchmarks/`); this file is the map of the package.

## Quick start

```bash
cd packages/bench
npm run bench -- status                  # what is fresh, stale, missing; how long the due part takes
npm run bench -- next --budget 20m       # measure what fits in 20 minutes, then publish to the site
npm run bench -- next --point small --processes 1 --budget 15m   # quick shallow pass; --retry deepens later
npm run bench -- report                  # the tables from what is stored
npm run audit -- status                  # which audit cards are current, stale, unstamped, missing
npm run bench -- progress                # reads a local ROADMAP.md if present: one weighted percentage
npm test                                 # the harness's own tests (node:test, one process)
```

The full matrix takes many hours on an idle machine, so it is never run whole. `next` takes
a time budget, measures only cells that are missing or stale, and keeps everything it
finished if interrupted. Every option is in `npm run bench -- help` and in
[Running the suite](../../website/docs/benchmarks/running.md).

## The model in four sentences

A **cell** is one participant × one scenario × one operating point (`default`, `wide`,
`small` — `src/cells/points.ts`). Cells are measured in **batches** of one scenario at
one point, always with the anchor (`baseline-indexed`, or `baseline-array` where it declines;
`cells/participants.ts` `anchorFor`) and the control pair
`control-lean`/`control-heavy` beside them. Each cell stores a **fingerprint** of the
exact code its worker loaded (harness, adapter, engine sources, library versions) and
becomes stale, with a named reason, when any part changes. Every participant and scenario
has an **audit card** under `audit/` saying how idiomatic the adapter is and how
representative the scenario is, tied by digest to the code it was written against.

## Where things are

| path | what |
|---|---|
| `src/bench.ts` | the command line: `status`, `next`, `run`, `verify`, `report`, `publish`, `plan`, `memory`, `progress`, `list` |
| `src/cells/` | the cell runner: fingerprints, store, batch, planner, staleness, tables, publishing |
| `src/worker.ts` | the child process: `verify`, `probe`, `time`, `memory` modes. Nothing is measured in a parent |
| `src/harness/` | everything shared by every row: `scenarios.ts` (the scripts), `dataset.ts`, `oracle.ts` (reference model), `consumer.ts`, `control.ts` (the controls), `load.ts` (the gate), `measure.ts` (sampling), `registry.ts`, `participantModules.ts` (what a worker loads) |
| `src/adapters/` | one file per participant, with its `docs`, `departure`, `admission` and every wiring it builds or declines |
| `src/audit.ts`, `src/audit/` | the audit register's command line and parser |
| `audit/` | the cards: `participants/<name>.md`, `scenarios/<key>.md`; format in [`audit/README.md`](audit/README.md) |
| `results/` | the stored cells, plans and batch log — [`results/README.md`](results/README.md) |
| `measurements/` | artifacts of the other harnesses (`price`, `alternatives`, `bundle`, `retained`) — the only directory a published figure may name |
| `tests/` | the harness's tests |

## The other harnesses

| command | question | unit |
|---|---|---|
| `npm run duel -- <arm> <scenario>` | did the change I just made move us, on one task, against one arm | ratio |
| `npm run price` | what a call this library offers costs against the primitive a person would write | ratio, ours ÷ floor |
| `npm run alternatives` | is the shipped design faster than the one we turned down | ratio, read backwards |
| `npm run price:publish` | what the docs site shows for both catalogues: the latest reading per id from `measurements/*/*/records.json`, written to `website/src/data/bench/prices.json`, each pair marked `isStale` when its run's core fingerprint is not the current core's | — |
| `npm run retained` | what an option holds for the life of the process | bytes |
| `npm run bundle` | what one public API costs an application that never calls it | bytes |
| `npm run lines` | how much code each participant needed per task (per wiring shape: builder + helpers it reaches, minus other shapes' methods); also in `bench report` and on the docs site | code lines |

`BENCHMARKING.md` at the repository root is the authority on which harness owns which
question.

Long-form notes kept beside the code: [PARTICIPANTS.md](PARTICIPANTS.md),
[SCENARIOS.md](SCENARIOS.md), and [WHY-EACH-ROW.md](WHY-EACH-ROW.md) — every result
explanation with its evidence, refuted ones included.
