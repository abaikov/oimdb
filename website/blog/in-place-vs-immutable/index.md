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

No per-op timing is stated: `packages/core-legacy/bench/collection.bench.ts` constructs its collection with `createMergeEntityUpdater()` and only that, so there is no in-place arm to compare.

The argument is the allocation count. Merge allocates one object and shallow-copies the entity on every update; in-place allocates nothing. That allocation is also garbage the instant the next update replaces it — under sustained high-frequency writes (a streaming feed, a fast tick loop) it is continuous churn the collector has to reclaim, and the cost surfaces as GC pause tail-latency, which no per-op mean would have shown anyway.
## Cost

Two updaters with different reference semantics. In-place skips an allocation but is fragile — drop it into a tree that relies on `Object.is` and updates vanish with no error. The footgun is structural: the price of the zero-allocation path.

## Where it lives

- `packages/core-legacy/src/core/createInPlaceEntityUpdater.ts`
- `packages/core-legacy/src/core/createMergeEntityUpdater.ts`
- `packages/core-legacy/src/core/OIMCollection.ts`

This is the legacy engine, kept at `packages/core-legacy`. The fork is still shipped as two strategies in the engine shipped today, under `createOIMEntityWriterInPlace` and `createOIMEntityWriterReplacing` in `packages/core/src/factories/`, and it is still chosen once at the collection's constructor rather than per call.
