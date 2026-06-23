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

Measured on an **empty flush**, where the array allocation is the *entire* cost: **0.057 µs** with `Array.from`, **0.037 µs** with the double buffer (−35%). That −35% is the headline only because nothing else runs — under real load the tasks themselves dominate flush time, so the snapshot's share (and the relative win) shrinks. What the double buffer removes is a fixed per-flush overhead: `Array.from` allocates proportional to the queue, the swap is O(1), so the *absolute* saving grows with queue size while the *relative* saving is largest exactly when flushes are cheap and frequent — which, under microtask batching, they are.

## Cost

The queue permanently holds two `Set`s instead of one — a fixed idle-memory cost traded for zero churn. And `this.flushing` must be set during the drain and cleared after, or `cancel()` would dereference a stale set: bookkeeping a plain snapshot wouldn't need.

## Where it lives

`packages/core/src/core/OIMEventQueue.ts`
