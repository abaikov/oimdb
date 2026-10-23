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

When only a key is available, `markUpdatedKey` resolves the carrier through `IOIMCarrierProvider.findCarrier` — the same collaborator that mints a carrier for a subscription (`getOrReserveCarrier`) and is told when one loses its last subscriber.

No figure is stated for the saving: no benchmark in this repository builds a `Map<key, handlers>` arm to compare against (see [How we measure](https://github.com/abaikov/oimdb/blob/master/packages/bench/HOW-WE-MEASURE.md)). The mechanism: the writer already holds the carrier, so `markUpdatedCarrier` reads `carrier.subscribers` directly where the map emitter hashes the key and probes a table. That is a hash and a lookup that provably do not happen — whatever they are worth in nanoseconds.

The nearest measured thing is *not* this comparison and must not be read as it:

> [`2026-08-20-alternatives/addressing/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-08-20-alternatives/addressing) prices the same *principle* on a different operation — per-identity state read off the carrier you already hold, `slot.cache[column]` at 2.7 ns, against `stateByKey.get(row.id)`, a `Map` keyed by the primary key, at 20.5 ns. Ratio 0.13x, noise 0.9%.

That settles addressing-by-identity against addressing-by-key **for a read**. It does not measure an emitter, a mark, or a delivery, and it measures neither engine this post names: `slot.cache[column]` is the pair's own wording for its arm, and the column store on an entity slot is `slot.columns` today. What would settle this post is a pair whose two arms are the two emitters.

## Cost

The emitter is no longer self-contained: it depends on carrier objects and a provider. The index case, where the carrier is a standalone per-key object, reintroduces a `Map<key, carrier>` plus an `onCarrierEmptied` hook to prune carriers whose last subscriber left — without it a churning key space leaks carriers. A uniform data structure is traded for a faster one whose correctness depends on prune callbacks firing.

## Where it lives

`packages/core-legacy/src/core/OIMCarrierKeyedEmitter.ts`, `packages/core-legacy/src/types/IOIMSubscribable.ts` — the legacy engine, kept at `packages/core-legacy`. The engine shipped today keeps the principle and drops the emitter: subscribers live on the slot as `slot.effects`, and `OIMChannel.write` reads them off the slot the writer already holds.
