---
slug: handlers-on-carrier
title: "Handlers on the carrier, not in a map"
authors: [oimdb]
tags: [internals, performance]
date: 2026-06-12
---

A keyed pub/sub normally keeps a `Map<key, handlers>`. But the code that triggers a notification already holds the object that changed — so hashing the key again to find its subscribers is wasted work.

{/* truncate */}

## Context

`OIMCarrierKeyedEmitter` delivers per key: subscribe to pk `42`, get notified when `42` changes. It backs every reactive collection and index. The textbook layout is `Map<key, Set<handler>>`.

## Problem

The hot path is *marking* a changed key dirty — it runs on every mutation. With a map that means hash the key, look up the bucket, check it exists. But the writer that mutated the entity already holds the entity object: it just paid to find the entity, and now pays again to find that entity's subscribers by key.

## Options

- **`Map<key, Set<handler>>` in the emitter** — self-contained; carriers know nothing about subscriptions. Every mark and every delivery is a key hash + map lookup, even though the caller already holds the changed object.
- **Subscribers on the carrier** — the entity slot (collection) or bucket (index) carries its own `subscribers` set. The writer holds the carrier, so `markUpdatedCarrier(carrier)` reads `carrier.subscribers` directly — no hash, no lookup.

## What OIMDB does

Subscribers live on the carrier (`IOIMSubscribable`), and the fast mark path never touches a map:

```ts
public markUpdatedCarrier(carrier: TCarrier): void {
    this.assertNotInFlush();
    const subscribers = carrier.subscribers;
    if (!subscribers || subscribers.size === 0) return;
    if (carrier.dirty) return;
    carrier.dirty = true;
    this.dirtyCarriers.push(carrier);
    this.scheduleFlush();
}
```

When only a key is available, `markUpdatedKey` resolves the carrier through an `IOIMCarrierResolver`.

Two numbers, because the micro-win and the end-to-end win are different sizes. In isolation — just the dispatch, nothing around it — the carrier emitter is **55–68% faster** per key than the `Map<key, handlers>` emitter (option A); the range is across key-set sizes (the bigger the map, the more the saved hash+lookup is worth). But dispatch is a small slice of a real operation, so the number that matters end-to-end is the second: inside a full index write, delivery is **~14%** of total time with the map emitter and **~0–3%** with the carrier one. Membership bookkeeping, not delivery, dominates the rest — so once delivery is near-free, little is left to shave, and the 55–68% does not translate into a 55–68% faster operation.

## Cost

The emitter is no longer self-contained: it depends on carrier objects and a resolver. The index case, where the carrier is a standalone per-key object, reintroduces a `Map<key, carrier>` plus an `onCarrierEmptied` hook to prune carriers whose last subscriber left — without it a churning key space leaks carriers. A uniform data structure is traded for a faster one whose correctness depends on prune callbacks firing.

## Where it lives

`packages/core/src/core/OIMCarrierKeyedEmitter.ts`, `packages/core/src/types/IOIMSubscribable.ts`, `packages/core/src/core/OIMKeyedCarrierResolver.ts`
