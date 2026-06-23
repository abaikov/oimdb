---
slug: dirty-flag-vs-set
title: "A boolean flag beats a Set for the dirty batch"
authors: [oimdb]
tags: [internals, performance]
date: 2026-06-12
---

A keyed emitter dedups its per-flush batch. The default tool is a `Set`. A boolean flag on the carrier plus a plain array does the same job ~4× cheaper, paid for with a hand-maintained invariant.

{/* truncate */}

## Context

`OIMCarrierKeyedEmitter` is the per-key pub/sub behind collections and indexes. Handlers live on the *carrier* — the collection's entity slot, or the index's bucket (see [handlers on the carrier](/blog/handlers-on-carrier)). On a write the changed carrier is marked dirty; on `queue.flush()` the batch of dirty carriers is delivered once.

## Problem

Marking a carrier dirty runs on **every mutation** — the hottest write-path op, and far more frequent than flushes. The batch has to dedup: a carrier written ten times in one tick must be delivered once.

## Options

- **`Set<carrier>`** — `set.add(carrier)` computes the carrier's identity hash, probes the set's table, inserts. Membership and dedup come for free.
- **flag + array** — `if (carrier.dirty) return; carrier.dirty = true; arr.push(carrier)`. Dedup is a boolean read, membership lives on the carrier itself, append is an array push.

## What OIMDB does

Flag + array:

```ts
if (carrier.dirty) return;        // already in the batch
carrier.dirty = true;
this.dirtyCarriers.push(carrier);
```

The flag is reset as each carrier is delivered, leaving it re-markable next tick.

Microbench — 1000 carriers, marked + iterated over 20,000 flushes (20M mark cycles), reused containers:

| pending batch | all dirty | 5% dirty per flush |
|---|---|---|
| `Set<carrier>` | 778 ms | 43 ms |
| flag + array | 181 ms | 9 ms |

~4.3× (all dirty), ~4.8× (sparse). The gap is the identity-hash that `Set.add` runs on every mark and the array push skips.

This measures the batching primitive in isolation — mark + iterate, nothing else. A real write does more around it (apply the patch, schedule the flush), so the dirty-batch op is a *fraction* of one write, not 4× of end-to-end write time. The point is that it's a fraction paid on every mutation while flushes are rare, so shaving the per-mark constant compounds.

## Cost

The flag is shared mutable state with an invariant: `carrier.dirty === true` iff the carrier is in `dirtyCarriers`. Break it and you either drop updates (flag stuck `true` → future marks skipped) or double-deliver. A `Set` needs none of this — removal from the batch is implicit.

Holding the invariant when a handler throws mid-flush takes explicit cleanup: delivery resets the flags of any carriers it never reached.

```ts
} finally {
    for (; i < flushing.length; i++) flushing[i].dirty = false;
}
```

## Where it lives

`packages/core/src/core/OIMCarrierKeyedEmitter.ts`
