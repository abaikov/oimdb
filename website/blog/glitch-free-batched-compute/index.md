---
slug: glitch-free-batched-compute
title: "Why computed values wait for the flush"
authors: [oimdb]
tags: [reactivity, react]
date: 2026-06-12
---

If `A` feeds both `B` and `C`, and `D` reads `B` and `C`, then changing `A` should recompute `D` exactly once with consistent inputs. The naive wiring recomputes `D` twice and lets it see one fresh and one stale parent in between — a glitch.

{/* truncate */}

## Context

`OIMComputed` nodes and effects form a dependency graph driven by `OIMComputeRuntime`. A write to a source marks its dependents dirty; the runtime is what decides when and in what order they recompute.

## Problem

The classic diamond. A synchronous, push-on-write graph propagates a change to `A`'s dependents in stored order: `A → B → D`, then `A → C → D`. The first path recomputes `D` while `C` still holds its old value. `D` runs twice, and its first run produces a value computed from a half-updated graph — one that never should have existed. Eager subscribers see that ghost. The deeper the graph, the more shared descendants multiply both the redundant work and the inconsistent snapshots flowing downstream.

## Options

Judge each on the diamond's two failure modes — glitches (a node runs on a stale parent) and redundant recompute — plus how subscribers get told to run.

- **Synchronous push** — recompute a node the instant any input changes. Hits *both* failures: `D` recomputes once per path (twice) and emits the half-updated value in between. Subscribers fire eagerly, so they see the glitch too. Cheapest to build, wrong on every shared descendant.
- **Mark-dirty + pull on read** — invalidate eagerly, recompute lazily when something reads. Removes the redundant recompute and the glitch *for code that pulls*. But effects and subscribers don't pull — they must be told when to run; pure pull leaves that undefined (who reads, and when?).
- **Batched, level-ordered recompute** — mark dirty on write, then at a flush boundary recompute the dirty nodes once, parents before children. No glitch (a child never runs on a stale parent), no redundant recompute (each node once), and it still *pushes*, so effects keep a defined firing point. Costs a flush boundary and a topological scheduler.

## What OIMDB does

The third. Writes mark dependents dirty and schedule them on `OIMComputeRuntime`, bucketed by `level` (graph depth). On the queue's `AFTER_FLUSH` boundary the runtime drains levels in ascending order — every parent settles before any child runs — and each node recomputes once per flush. In the diamond, `D` runs a single time, after both `B` and `C` are current.

All three on the same workload. The metric is **recompute count** — how many times nodes re-run for **one** source update, on stacked diamonds (each layer adds a diamond over the previous tip). Count, not time, because that's what separates the options: it's both the wasted work *and* the number of glitch windows a subscriber could observe.

| stacked diamonds | sync push | pull-on-read | batched |
|---|---|---|---|
| 1 | 4 | 3 | 4 |
| 3 | 28 | 9 | 10 |
| 5 | 124 | 15 | 16 |
| 10 | 4,092 | 30 | 31 |

**Read that table as an argument about the graph, not as a measurement, because nothing in this repository produced it.** It names no artifact, and no suite ever built a sync-push or a pull-on-read arm — `packages/core-legacy/bench/effect-computed.bench.ts`, the compute benchmark that still runs, has one arm and it is the batched engine that shipped. What the counts *are* is combinatorial: the sync-push column is the number of paths from the source to each node, which on stacked diamonds is ≈2ᵈᵉᵖᵗʰ, and the other two are linear at ~3 per diamond. That is settled by counting paths, and it is the kind of claim a counting test states exactly and a stopwatch would only obscure. Until such a test exists, the table is derivation rather than evidence — the shape of the conclusion is right and the cells are unverified.

Sync push re-fires every shared descendant once per path, and each extra recompute is a glitch. Pull-on-read and batched do *the same work*. So the choice between them is not count — it's delivery: batched pushes to subscribers, giving effects a defined firing point, while pull leaves "when does the effect run" to whoever happens to read.

No wall-clock figure is stated for a single recompute. The nearest recorded row anywhere here is `computed.recompute-vs-hand-memo` at **79.3 ns** per frame in [`2026-08-20-price/frame/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-08-20-price/frame) — but it measures neither this engine nor this question: a one-level derivation, timed with the write and the frame around the recompute rather than the recompute alone. It is context and not a correction. Multiply nothing by it.

`.get()` is the escape hatch: a direct read calls `recomputeAndEmitIfChanged()` on the spot, so an imperative read is always live. Only *delivery to subscribers* waits for the flush.

## Cost

Subscribers observe values at flush boundaries, not at the instant of the write — a mental model to internalize ("the graph settles on flush"). Code that writes and synchronously expects a subscriber to have fired will be surprised, and imperative `.get()` (live) and push delivery (deferred) are two timing contracts on the same value.

## Where it lives

- `packages/core-legacy/src/modules/compute/core/OIMComputeRuntime.ts` — level-ordered scheduler, `AFTER_FLUSH` drain.
- `packages/core-legacy/src/modules/computed/core/OIMComputed.ts` — dirty-tracking, compare-gated emit, live `.get()`.
- `packages/core-legacy/src/modules/effect/core/OIMEffect.ts` — schedule-once-per-invalidation.

This is the legacy engine, kept at `packages/core-legacy`. The engine shipped today is a different design: it has no compute runtime and no dirty marks, and a computed slot is pulled through its owner's `getValueForSlot` ([the first touch pays for everyone](/blog/first-touch-pays-for-everyone)).
