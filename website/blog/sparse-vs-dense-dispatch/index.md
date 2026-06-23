---
slug: sparse-vs-dense-dispatch
title: "Iterate the dirty keys, or the whole map?"
authors: [oimdb]
tags: [internals, performance]
date: 2026-06-12
---

When a handful of keys changed out of thousands subscribed, iterate the changed keys. Only when *every* subscribed key changed does iterating the whole map win. The emitter picks at flush time.

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
`K` repeated `get()` re-hashes. Both walks, benchmarked across `M/K`
(min-of-7, `K` = 10 000, ms total — lower is better):

```
M/K    sparse   dense    winner
  1%        6      534    sparse
 10%       78      631    sparse
 25%      176      570    sparse
 50%      330      623    sparse
 75%      597      779    sparse
100%      672      606    dense (~10%)
```

Dense wins exactly one ratio: `M = K`, by ~7–10% (holds at `K` = 1k and 50k too).
Below that sparse wins — by orders of magnitude when few keys changed. So a size
heuristic is doubly wrong with the wrong constant: `* 2` flips to dense at
`M ≥ K/2`, across a 50–99% band where sparse still wins, and `K/2` has nothing to
do with the one ratio (`M = K`) where dense actually pays.

Be clear about the stake: `M = K` only happens via `markAllUpdated()` / `clear()`,
not on ordinary partial writes, and the win there is ~10% of an already-cheap
dispatch. This is a small optimization on an infrequent path. The transferable
part isn't the speedup — it's the method: the first cut used a `* 2` size
heuristic on a guessed crossover; a clean min-of-7 sweep showed there is no
crossover region at all, just a single exact ratio, so the right code is an
equality check, not a tuned threshold.

`runSinglePass` switches on that exact condition — `M = K`, which is what
`markAllUpdated()` / `clear()` produce — and uses sparse otherwise:

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

Two walks and a branch, versus one. But the branch is an exact equality, not a
tuned threshold, so there is no crossover region to mis-place — it triggers only
on all-keys-dirty. Both walks probe membership, so either stays correct if a
subscription changed between mark and flush.

## Where it lives

`packages/core/src/core/OIMUpdateEventEmitter.ts` (`runSinglePass`)
