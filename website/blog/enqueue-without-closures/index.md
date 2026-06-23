---
slug: enqueue-without-closures
title: "A cancellable enqueue without per-call allocation"
authors: [oimdb]
tags: [internals, performance]
date: 2026-06-12
---

A task queue that lets callers cancel a queued task usually hands back a disposer closure — one allocation on every enqueue. When enqueue is on the hot path, storing the function and cancelling by reference avoids the tax entirely.

{/* truncate */}

## Context

`OIMEventQueue` batches one-shot tasks: emitters and the store enqueue a flush task, and `flush()` runs the batch. Every reactive write enqueues, so `enqueue` is a hot-path op — and tasks must be cancellable, because an emitter torn down before flush has to drop its pending task.

## Problem

A cancellable enqueue has to give the caller some way to cancel. The usual shapes allocate. Returning a disposer closure is one function object per call; wrapping the task so the queue can flip a "cancelled" flag on it is another — plus the GC of discarding them when the task runs. Most callers never cancel, so on a hot path that allocation is mostly waste.

## Options

- **Return a disposer closure (`enqueue(fn): () => void`)** — ergonomic, callers hold one handle. Allocates a closure per call whether or not anyone cancels.
- **Wrap the task to carry cancel state** — store `{ fn, cancelled }` instead of `fn`; cancel flips `cancelled` and the drain skips it, so cancel never has to locate and `delete` an entry. But the wrapper is an allocation per enqueue (the very tax this is trying to avoid), and the stored object is no longer the caller's `fn`, so identity-based dedup is lost.
- **Store the function reference, cancel by reference** — `enqueue(fn)` adds `fn` to a `Set`; `cancel(fn)` deletes it. No wrapper, no returned closure; dedup falls out of `Set` identity. The caller must keep the reference to cancel.

## What OIMDB does

Store the reference, cancel by reference:

```ts
public enqueue(fn: () => void): void {
    this.tasks.add(fn);
    this.ensureScheduled();
}

public cancel(fn: () => void): void {
    this.tasks.delete(fn);
    this.flushing?.delete(fn);
}
```

Zero allocation per enqueue, and idempotent — the same `fn` enqueued twice runs once, because the `Set` keys on identity. Each emitter holds one stable `onFlush` method and enqueues that, so its scheduling dedup is just the `Set`.

The disposer-closure shape against the by-reference one (3M iterations, no-op task — so this isolates queue overhead, not task work):

| approach | enqueue + cancel | enqueue + flush |
|---|---|---|
| disposer closure | 0.116 µs | 0.135 µs |
| by reference | 0.067 µs | 0.067 µs |

The gap (~0.05–0.07 µs) is the closure the call no longer allocates. By-reference reads the same for cancel and flush because the task is a no-op: at this resolution the closure alloc is the only thing that moves, so removing it flattens both columns to the bare `Set` op.

## Cost

Cancellation needs the caller to hold the original reference and pass the same one back — there is no opaque handle to lean on. Callers that enqueue a stable bound method already have it; it is only a sharper edge for code that wanted a disposer to stash.

## Where it lives

`packages/core/src/core/OIMEventQueue.ts`
