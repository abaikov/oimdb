---
slug: sparse-vs-dense-dispatch
title: "Iterate the dirty keys, or the whole map?"
authors: [oimdb]
tags: [internals, performance]
date: 2026-06-12
---

When a handful of keys changed out of thousands subscribed, iterate the changed keys. The emitter switches to the whole map on exactly one condition — every subscribed key dirty — and that condition is an operation count, not a tuned threshold. The section below gives the nearest recorded pair.

{/* truncate */}

## Context

`OIMUpdateEventEmitter` is the `Map`-based keyed emitter used where the carrier isn't an object the writer already holds — reactive objects, computed nodes, the ordered-list command stream. At flush it delivers to every changed key that has subscribers.

## Problem

There are two collections in play: `updatedKeys` (what changed this
tick) and `keyHandlers` (everything subscribed). To deliver, walk one and
probe the other. Which one gets walked matters: walking the smaller and probing the
larger is fewer operations than the reverse.

One detail constrains the whole problem: `markUpdatedKeys` only records a key
that *already has handlers* (it skips keys with no subscribers). So `updatedKeys`
is always a **subset** of `keyHandlers` — `M ≤ K`, where `M` = changed keys and
`K` = subscribed keys. The two sets can be equal (via `markAllUpdated`), never
inverted.

## Options

- **Sparse — iterate `updatedKeys`, probe `keyHandlers`.** Few keys changed → `updatedKeys.size` map lookups. When nearly everything changed it still pays a map `get` per key, pricier than the map's own in-place iteration.
- **Dense — iterate `keyHandlers`, probe `updatedKeys`.** Most keys changed → one linear map walk, cheap `Set.has` per entry. When two of ten thousand changed, all ten thousand get walked to find two.
- **Heuristic — pick sparse or dense per flush by size** (e.g. `flushingKeys.size * 2 < keyHandlers.size`). Cheap to compute, but the crossover constant is a guess until measured, and it means carrying both walks plus a branch.

## What OIMDB does

Count the lookups. Sparse does `M` map-`get`s; dense does `K` iterations + `K`
`Set.has`es. Since `M ≤ K`, sparse does fewer for any `M < K`. The exception is
`M = K` — every subscribed key dirty — where iterating the map in place avoids
`K` repeated `get()` re-hashes. That much is an operation count and stands on its
own.

The nearest recorded pair puts the crossover at 50%. The same choice
turns up in a different shape — walk the list of what changed, or walk everything
subscribed and check a stamp — and that pair is recorded:

> [`2026-08-20-alternatives/dispatch/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-08-20-alternatives/dispatch),
> `alt.dirty-list-vs-scan`, per frame, `K` = 1024: at 10 dirty the list costs
> 107 ns against the scan's 1.19 µs; at 102 dirty, 723 ns against 1.18 µs; at
> **512 dirty — `M/K` = 50% — the list costs 3.49 µs and the scan 2.30 µs, so the
> scan wins by 1.52×**, at a noise of 1.9%.

That is not this post's `runSinglePass`: different engine, different containers,
and its two arms are not the two walks this code switches between. But it is the same question — walk `M` or walk
`K` — and it puts the crossover somewhere below half, where this post claimed
sparse still won by a wide margin all the way to 99%. So the specific claim
*"below `M = K`, sparse wins"* should be read as unproven, not as measured.

The stake is unchanged, and so is the code. `M = K` only happens via the
emitter's own `markAllUpdated()` — which the collection reaches from `clear()`
and from nowhere else — not on ordinary partial writes. The transferable
part was never the speedup: an equality check triggers only on the case it was
reasoned about, where a tuned threshold has a constant somebody has to defend —
and, as it turns out, a sweep somebody has to be able to produce.

`runSinglePass` switches on that exact condition — `M = K`, which is what
`markAllUpdated()` produces — and uses sparse otherwise:

```typescript
if (flushingKeys.size === this.keyHandlers.size) {
    // every subscribed key dirty: iterate the map, skip K get()s
    this.keyHandlers.forEach((handlers, key) => {
        if (!flushingKeys.has(key)) return;
        if (!handlers || handlers.size === 0) return;
        this.notifyHandlers(handlers);
    });
} else {
    flushingKeys.forEach(key => {
        const handlers = this.keyHandlers.get(key);
        if (!handlers || handlers.size === 0) return;
        this.notifyHandlers(handlers);
    });
}
```

## Cost

Two walks and a branch, versus one. The branch is an exact equality, not a tuned
threshold, so nothing here has a crossover constant to mis-place — it triggers
only on all-keys-dirty. What the `alt.dirty-list-vs-scan` rows above suggest is
that a real crossover exists somewhere below `M = K`, and this code does not use
it: below the equality it always walks the dirty keys. Whether that leaves
something on the table at high `M/K` is open, and open is what it should be
called until a pair with these two walks as its arms is recorded. Both walks probe
for containment, so either stays correct if a subscription changed between mark and
flush.

## Where it lives

`packages/core-legacy/src/core/OIMUpdateEventEmitter.ts` (`runSinglePass`) — the legacy engine, kept at `packages/core-legacy`. The engine shipped today faces the question in the shape the `alt.dirty-list-vs-scan` rows measure, not in this one.
