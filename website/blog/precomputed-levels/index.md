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

- **Turning the levels on was nearly free at runtime.** Flipping the scheduler from "everything at level 0, let lazy pulls sort out the order" to "each node at its real depth" removed the redundant reschedules and out-of-order pulls; the array-by-level removed the map hashing. On the compute benchmarks that was roughly **+78%** on a diamond graph and **+24%** on a depth-50 chain — for a change that only *moved* work to construction time.

## Cost

Dependencies are fixed. No `get(cond) ? get(a) : get(b)` — a node can't grow or drop a dependency at runtime. If a value genuinely depends on different sources at different times, you declare the union and branch inside `compute`, or rebuild the node. You trade the flexibility of autotracking for a runtime with no per-update ordering work and a deterministic pass — and levels you compute once instead of re-deriving on every write.

## Where it lives

- `packages/core/src/modules/compute/core/OIMComputeRuntime.ts` — `computeLevel` / `registerLevel` / `getLevel`, and the array-by-level drain with pooled sets.
- `packages/core/src/modules/computed/core/OIMComputed.ts`, `.../effect/core/OIMEffect.ts` — declare deps; level derived from the runtime at construction.
- `packages/core/src/dx/on.ts`, `.../dx/OIMCollectionKit.ts` — `on.*` + `kit.computed` / `kit.effect` build the static graph without hand-wiring dependencies.
