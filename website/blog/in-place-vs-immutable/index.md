---
slug: in-place-vs-immutable
title: "In-place or immutable? Ship both"
authors: [oimdb]
tags: [internals, design]
date: 2026-06-12
---

Updating an entity can either build a fresh merged object or mutate the one already in the store. Each choice serves a different reader, so OIMDB ships both and picks per collection.

{/* truncate */}

## Context

An *entity updater* decides how a partial patch is applied to the stored entity on `upsertOne`. `OIMCollection` calls it on every write. The decision it encodes is whether the stored object keeps its reference or gets a new one.

## Problem

That single reference decision splits readers, and one strategy can't serve both:

- **Reference-comparison readers** — React's `Object.is` / `useSyncExternalStore`, `React.memo`, prev/next diffing, time-travel — need a *new* reference to notice a change.
- **Subscription readers** — signal hooks that re-read on a keyed notification — want a *stable* reference and don't compare.

## Options

- **Merge — `{ ...prev, ...draft }`** — new reference per update, so reference-comparison readers see the change; the previous object is left intact. Costs one allocation + shallow copy per update.
- **In-place — `Object.assign(prev, draft)`** — zero allocation, stable reference; reference-comparison readers go blind, and a collection read by both a signal hook and a memoized React tree updates one and not the other.

## What OIMDB does

The default is merge (`createMergeEntityUpdater`): the common reader is React, where correctness beats a micro-benchmark. In-place is opt-in via `createInPlaceEntityUpdater()` passed as `opts.updateEntity`, for collections where *every* reader is subscription-driven (`@oimdb/react`'s `*Signal` hooks).

Data-layer cost per update, no React:

| updater | upsert + flush |
|---|---|
| in-place | 0.25 µs |
| merge | 0.34 µs |

The ~0.09 µs gap is the allocation + shallow copy that merge does and in-place skips. Real on update-heavy data layers; invisible under a React commit (~33 µs).

The mean understates in-place's actual point. Merge's per-update allocation is garbage — under sustained high-frequency writes (a streaming feed, a fast tick loop) that's continuous churn the collector has to reclaim, and the cost surfaces as GC pause tail-latency, not in a 0.09 µs average. In-place allocates nothing, so it produces no such garbage. The flat per-op number is the smaller half of the argument.

## Cost

Two updaters with different reference semantics. In-place is faster but fragile — drop it into a tree that relies on `Object.is` and updates vanish with no error. The footgun is structural: the price of the zero-allocation path.

## Where it lives

- `packages/core/src/core/createInPlaceEntityUpdater.ts`
- `packages/core/src/core/createMergeEntityUpdater.ts`
- `packages/core/src/core/OIMCollection.ts`
