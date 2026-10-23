---
slug: queue-double-buffer
title: "Draining a queue without copying it"
authors: [oimdb]
tags: [internals, performance]
date: 2026-06-12
---

Flushing a task queue usually means snapshotting it first, so tasks enqueued during the drain don't corrupt the walk. That snapshot is an allocation on the hottest path. A double buffer avoids it.

{/* truncate */}

## Context

`OIMEventQueue.flush()` runs every pending task. A task may enqueue more tasks — a handler writes, which marks another carrier dirty, which enqueues its flush. Those new tasks must land in the *next* flush, not this one, and the current drain must not observe them.

## Problem

Iterating `this.tasks` directly is unsafe here: as above, a task can enqueue more tasks mid-flush, and a `Set` mutated while it is being iterated would run that next-flush work now. The usual fix is to snapshot — copy `this.tasks` into an array, clear the set, then walk the array; new enqueues land in the empty set and the walk is over a frozen list. It works, but the snapshot is a fresh array sized to the queue, allocated on every flush — and flush runs once per microtask under load.

## Options

- **`Array.from(this.tasks)` snapshot per flush** — simple and correct; one array allocation proportional to queue size, every flush.
- **Iterate the live `Set`, clear at the end** — no snapshot, but new enqueues during the drain land in the same set being iterated; a `Set`'s `for..of` visits entries added mid-iteration, so next-flush work runs this flush.
- **Two sets, swapped (double buffer)** — keep a spare empty `Set`; swap it into `this.tasks` and drain the old one; clear the drained set and keep it as the next spare. No per-flush allocation.

## What OIMDB does

Double buffer — two `Set`s allocated once for the queue's lifetime, swapped each flush:

```ts
const flushing = this.tasks;
this.tasks = this.tasksSpare;
this.flushing = flushing;

for (const task of flushing) task();

flushing.clear();
this.tasksSpare = flushing;
this.flushing = undefined;
```

Enqueues during the drain hit the fresh `this.tasks` and run next flush — the snapshot's semantics, with no per-flush allocation. The `flushing` reference is exposed so `cancel(fn)` can delete a task mid-drain; a `Set`'s `for..of` skips entries removed before they're reached, so cancelling a not-yet-run task stops it.

No empty-flush figure is stated: no benchmark in this repository builds an `Array.from`-snapshot arm to compare against (see [How we measure](https://github.com/abaikov/oimdb/blob/master/packages/bench/HOW-WE-MEASURE.md)).

The mechanism is unaffected and is an operation count. `Array.from` allocates an array proportional to the queue on every flush; the swap is O(1) and allocates nothing, ever. So the *absolute* saving grows with queue size while the *relative* saving is largest exactly when flushes are cheap and frequent — which, under microtask batching, they are. What no longer has a number attached is how large either saving is.

For scale, and it is not this comparison: an empty frame — nothing marked, nobody subscribed — is recorded at **33.8 ns** in [`2026-08-20-price/frame/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-08-20-price/frame) (`flush.empty-vs-noop`). `db.flush()` is that row's own wording for the door it called; the door today is `db.flush()`. It measures a frame doing more than this queue did, against a counter-bump floor rather than against a snapshot, so it prices the fixed cost of a frame and settles nothing about `Array.from`.

## Cost

The queue permanently holds two `Set`s instead of one — a fixed idle-memory cost traded for zero churn. And `this.flushing` must be set during the drain and cleared after, or `cancel()` would dereference a stale set: bookkeeping a plain snapshot wouldn't need.

## Where it lives

`packages/core-legacy/src/core/OIMEventQueue.ts` — the legacy engine, kept at `packages/core-legacy`. The engine shipped today has nothing to double-buffer: a write during a flush is refused outright, so the list of effects a frame owes is never mutated while it is being walked.
