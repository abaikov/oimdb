---
sidebar_position: 5
title: Methodology
description: How a benchmark cell is defined, verified and timed beside an anchor and a control, what a place means, and when a stored cell goes stale.
---

# Methodology

## The unit is a cell

A **cell** is one participant on one scenario at one operating point. It is measured,
stored and invalidated on its own. The suite can therefore be collected a few minutes at a
time instead of in one day-long run, and a change to one adapter re-measures only that
adapter's cells.

| point | rows | window | processes per cell |
|---|---|---|---|
| `default` | 10 000 | 32 | 3 |
| `wide` | 10 000 | 100 (half a group) | 2 |
| `small` | 3 200 | 32 | 2 |

## The data

Every participant gets byte-identical input, built from the point alone. Ids, labels,
notes and every value a script writes are the same length: a one-letter kind, four
scrambled base-36 characters, and the last three decimal digits of the row number, which
the owner key and the second selection axis are read from. Their contents are spread by a
fixed bijection (`src/harness/scrambledText.ts`), so keys do not arrive in sequential
order and no column is one repeated string. Nothing is drawn from
`Math.random`: the same point gives the same data on every machine and in every process,
which is what lets the reference model's digest judge every participant. Ranks are
scattered by a hash of the id, so no store gets the sorted view from insertion order.

## A batch: verify, then time, beside an anchor and a control

Cells are measured in **batches**: one scenario, one point, any subset of its
participants. A batch always contains three companions:

- **the anchor**, `baseline-indexed`: hand-written code with a `Map`, a bucket per group,
  and a re-derive only of the windows a write can change (`baseline-array`, a full rescan
  per settle, stands in only where `baseline-indexed` declines the scenario).
  Every cell's headline number is its time divided by the anchor's time **in the same
  batch**, which is what lets two cells measured on different days be compared at all;
- **the controls**, the harness's own code: `control-heavy` does the same derivation as
  `control-lean` twice, and, on every wiring that writes, `control-write` does every
  store write twice. If a batch cannot tell `lean` from `heavy` by more than their drift,
  nothing it measured is resolved and every cell is flagged `unresolved`. If it cannot tell
  `lean` from `write`, gaps at the scale of a doubled write are unattested and every cell is
  flagged `fine-unresolved`.

In order:

1. **Verify.** Every participant runs the script once in a fresh process, and its
   consumers' output is compared with a plain-`Map` reference model replaying the same
   script. The comparison covers the sequence of distinct states each view rendered, or
   the final state for a script whose render count is the store's own answer. Then the
   store's whole population is compared with the model's. A participant that disagrees
   gets no number.
2. **Sample plan.** Per scenario and point, once: every participant is probed, the number
   of runs folded into one sample is priced off the median participant and the sample
   count off the slowest. The plan is stored and **every participant of the scenario is
   timed under the same plan**, so no column mixes two estimators. Re-calibrating it makes
   all of that scenario's cells stale.
3. **Time.** Round by round, with the start rotated: process 1 of every member, then
   process 2 of every member, … Each process warms up, then takes the minimum of its
   samples with a forced collection before each; the cell keeps the minimum over its
   processes and the **drift** between them. The timed process re-checks its own last
   pass against the reference model, so the process the number came from is also a
   process that did the work.

Every worker runs with `NODE_ENV=production` (MobX and Immer ship debug builds
otherwise) and `--expose-gc`, and loads **only its own participant** — no other library
is in its heap.

## What a place means

A row gets `#n` only when it is separated from **every** row above it by more than the
larger drift of the two. When the two rows came from different batches, the gap must
exceed the larger of *row drift + its batch's anchor drift*. Otherwise it gets `≈`. A row's
drift is its own measured error: how far its number moved between independent processes
taken as far apart as the rows being compared.

## The load gate

Before a batch starts, the one-minute load average minus an allowance of one per worker
the batch will spawn must be at or under `BENCH_MAX_LOAD` (default `0.5`). A busy machine
refuses the batch rather than producing a number about itself. The peak foreign load
during the batch is stored with every cell. A cell measured over the default gate, or
under a raised gate, carries the flag.

## When a cell goes stale

Each cell stores a fingerprint taken from the bundler's module graph of the exact code
its worker loads:

| part | what it covers | stale reason |
|---|---|---|
| harness | every file of `packages/bench/src` the worker imports — scripts, dataset, consumer, oracle, anchor, controls | `harness` |
| adapter | the participant's own files | `adapter` |
| subject | in-repository engine sources the participant imports (`packages/core/src` for `oimdb`) | `subject` |
| libraries | the exact version of every package the participant bundles | `library` |

plus the sampling plan, the operating point and the machine. A stale cell keeps its
number and is shown hatched until it is re-measured.

## What the audit adds

The timing cannot tell a library used well from one used badly, nor a workload from a
chosen result. Two registers answer that, one card per participant and per scenario,
each tied to the code it was written against — see [Participants](./participants) and
[Scenarios](./scenarios).
