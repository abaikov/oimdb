---
slug: precomputed-levels
title: "The update order is a property of the graph, not the update"
authors: [oimdb]
tags: [reactivity, performance]
date: 2026-07-24
---

A reactive graph must run parents before children. The real question is *when you compute that order*. Systems with dynamic dependencies rediscover it on every write. If dependencies are fixed up front, the order is a property of the graph — computed once, then free forever.

{/* truncate */}

## Context

An `OIMComputed` or `OIMEffect` declares its dependencies explicitly — `deps: [...]` — fixed at construction and never changing. That single constraint is what the rest of this rests on.

The alternative is autotracking (Jotai, Solid, MobX): a node's dependencies are discovered by *running* its compute and recording which sources it read. Deps aren't known until the node runs, and they can differ run to run (`cond ? get(a) : get(b)`).

## Problem

To avoid glitches and redundant recomputes ([why computed values wait for the flush](/blog/glitch-free-batched-compute)), the runtime must recompute dirty nodes parents-first — in topological order. Someone has to produce that order.

With dynamic deps you *can't* know it ahead of time, and it can change, so you rebuild it on every propagation: collect the dirty dependents, count in-degrees within that subgraph, drain the zero-in-degree ones first (Kahn's algorithm). That is a topological sort **per write**, scaling with the affected subgraph.

With static deps the edges never move — so the order never moves either.

## Options

The axis is *where the ordering work lives*.

- **Dynamic deps, sort per write.** Maximum flexibility — conditional dependencies, edges that appear and vanish. Pays a topological sort on every propagation, and can precompute nothing.
- **Static deps, recompute the order each flush.** Throwing away the fact that edges are fixed — the same per-flush sort cost for no reason.
- **Static deps, precompute levels once.** A node's `level` = one above the max of its dependencies' levels, derived at construction. The runtime never sorts: it buckets scheduled nodes by level and drains `0 → N`. Ordering cost at flush time is zero; the price is that deps can't change at runtime.

## What OIMDB does

The third. When a computed is built, the engine derives its level from its dependencies — which were built earlier, so their levels already exist — and stores it. Levels live in the runtime: the engine owns them, nodes don't carry them.

At a flush, an invalidated node schedules itself *at its level* into an **array indexed by level** (levels are dense small integers — direct index, no hashing, unlike a map), and the runtime drains ascending. The per-level buckets are pooled `Set`s, cleared between flushes rather than reallocated. The hot path is an array index and a drain — no sort, no per-node lookup, no allocation.

Two things fall out of static levels that a per-write approach doesn't get for free:

- **The deep-uneven glitch disappears.** A node that depends on both a shallow ancestor `A` and a deep one `D` (with `D` several levels below `A`) is scheduled the instant `A` fires — but it lands in *its own* high bucket and waits until `D`'s level has drained. It reads `D` fresh, exactly once. Without levels it would run early in `A`'s wave and read a stale `D` — a glitch that lazy pull-on-read doesn't catch, because `D` isn't even marked dirty yet.

- **Turning the levels on was nearly free at runtime.** Flipping the scheduler from "everything at level 0, let lazy pulls sort out the order" to "each node at its real depth" removed the redundant reschedules and out-of-order pulls; the array-by-level removed the map hashing. This post originally put that at *+78%* on a diamond graph and *+24%* on a depth-50 chain. **Those two figures name no artifact, so treat them as unmeasured until one exists** — but unlike most such numbers, this one is recoverable rather than lost, and here is exactly how.

  The commit that added `computeLevel` / `registerLevel` and the array-by-level drain is `94341b2`; before it, `dirtyByLevel` was a `Map<number, Set>` and every node scheduled at the default level 0. The compute benchmark — which runs *"Computed diamond graph"* and *"Computed chain depth=50"*, the two shapes quoted — is byte-identical on both sides of that commit, blob `18b4866` either way. It sits at `packages/core-legacy/bench/effect-computed.bench.ts` today and at `packages/core/bench/effect-computed.bench.ts` at that commit, which is the path to name when checking the two revisions out. So the before/after is `94341b2^` against `94341b2`: one bench file, run twice, with only the scheduler differing. Two caveats for whoever runs it: that bench times the whole `setProperty` + `flush` + effect-delivery loop as updates/sec, not the ordering work on its own, so any percentage it yields is end-to-end on that loop; and it is a single `performance.now()` span with no controls, no repeats and no load gate, which is not the standard [How we measure](https://github.com/abaikov/oimdb/blob/master/packages/bench/HOW-WE-MEASURE.md) now holds a published figure to. Until a pair exists under `packages/bench/measurements/`, the sentence this post can defend is the qualitative one: the ordering work moved to construction time, and nothing replaced it at flush time.

## Cost

Dependencies are fixed. No `get(cond) ? get(a) : get(b)` — a node can't grow or drop a dependency at runtime. If a value genuinely depends on different sources at different times, you declare the union and branch inside `compute`, or rebuild the node. You trade the flexibility of autotracking for a runtime with no per-update ordering work and a deterministic pass — and levels you compute once instead of re-deriving on every write.

## Where it lives

- `packages/core-legacy/src/modules/compute/core/OIMComputeRuntime.ts` — `computeLevel` / `registerLevel` / `getLevel`, and the array-by-level drain with pooled sets.
- `packages/core-legacy/src/modules/computed/core/OIMComputed.ts`, `.../effect/core/OIMEffect.ts` — declare deps; level derived from the runtime at construction.
- `packages/core-legacy/src/dx/on.ts`, `.../dx/OIMCollectionKit.ts` — `on.*` + `kit.computed` / `kit.effect` build the static graph without hand-wiring dependencies.

This is the legacy engine, kept at `packages/core-legacy`. Static dependencies survived the rewrite and the levels did not: the engine shipped today has no compute runtime and no `level`, because a pulled derivation gets its ordering from the walk itself ([the first touch pays for everyone](/blog/first-touch-pays-for-everyone)).
