---
slug: dirty-flag-vs-set
title: "A boolean flag beats a Set for the dirty batch"
authors: [oimdb]
tags: [internals, performance]
date: 2026-06-12
---

A keyed emitter dedups its per-flush batch. The default tool is a `Set`. A boolean flag on the carrier plus a plain array does the same job 3.6–4.2× cheaper, paid for with a hand-maintained invariant.

{/* truncate */}

## Context

`OIMCarrierKeyedEmitter` is the per-key pub/sub behind collections and indexes. Handlers live on the *carrier* — the collection's entity slot, or the index's bucket (see [handlers on the carrier](/blog/handlers-on-carrier)). On a write the changed carrier is marked dirty; on `queue.flush()` the batch of dirty carriers is delivered once.

## Problem

Marking a carrier dirty runs on **every mutation** — the hottest write-path op, and far more frequent than flushes. The batch has to dedup: a carrier written ten times in one tick must be delivered once.

## Options

- **`Set<carrier>`** — `set.add(carrier)` computes the carrier's identity hash, probes the set's table, inserts. Containment and dedup come for free.
- **flag + array** — `if (carrier.dirty) return; carrier.dirty = true; arr.push(carrier)`. Dedup is a boolean read, the answer to "is it in" lives on the carrier itself, append is an array push.

## What OIMDB does

Flag + array:

```ts
if (carrier.dirty) return;        // already in the batch
carrier.dirty = true;
this.dirtyCarriers.push(carrier);
```

The flag stays up for the whole frame and is cleared at the end of it, not as each carrier is delivered. That is deliberate and it is not the batching rule: writes are refused for the length of a flush — the frame body, `onBeforeFlush` and the after-each-frame tail alike — so nothing can re-mark a delivered carrier, and a flag still standing is what lets an effect read *what* changed rather than only that something did.

No benchmark in this repository builds a `Set`-as-queue arm, so no timing is stated for it.

The comparison was rebuilt as a measured pair and recorded in [`2026-08-20-alternatives/dispatch/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-08-20-alternatives/dispatch), as `alt.dirty-flag-vs-set-as-queue.all-dirty` and `.sparse-64-of-1024` — 1024 identities, marked and then walked, nothing else. Per row per write:

| pending batch | every identity dirty | 64 of 1024 dirty |
|---|---|---|
| `Set<identity>` | 26.2 ns | 28.4 ns |
| stamp + array | 7.2 ns | 6.8 ns |
| | **3.63× cheaper** | **4.16× cheaper** |

The other shape people propose — a `Map<identity, frame>` beside the array, so that nothing of the engine's is written onto the caller's object — lands in the same place, as `alt.dirty-flag-vs-side-map.*` in the same piece: 25.4 ns and 25.1 ns against our 7.0 ns and 6.3 ns, 3.61× and 3.97×. The gap is the identity-hash that `Set.add` and `Map.set` run on every mark and the array push skips.

Two things about that pair differ from the code quoted below, and both are stated in the artifact's own caveat. The shipped mark stamps the identity with a **frame number** rather than the boolean this post describes, so it needs no reset pass over the delivered batch — the arm measured is cheaper than the one the original ~4× was taken on. And every mark in the pair is a *first* mark, so our stamp never takes its early return and the `Set` never probes an entry it already holds: the arrangement least favourable to the stamp. The direction held; the size is now measured rather than remembered.

This measures the batching primitive in isolation — mark + iterate, nothing else. A real write does more around it (apply the patch, schedule the flush), so the dirty-batch op is a *fraction* of one write, not 4× of end-to-end write time. The point is that it's a fraction paid on every mutation while flushes are rare, so shaving the per-mark constant compounds.

## Cost

The flag is shared mutable state with an invariant: `carrier.dirty === true` iff the carrier is in the pending batch or awaiting the frame-end clear. Break it and you either drop updates (flag stuck `true` → future marks skipped) or double-deliver. A `Set` needs none of this — removal from the batch is implicit.

Holding the invariant costs a second list and a second pass, in a `finally` so a throwing handler cannot leave a carrier stuck:

```ts
} finally {
    for (let j = 0; j < flushing.length; j++) {
        this.pendingClear.push(flushing[j]);
    }
    this.scheduleFrameEndClear();
}
```

`endFrame()` then walks `pendingClear` and resets `dirty` — and `dirtyFields` with it, where a carrier has one.

## Where it lives

`packages/core-legacy/src/core/OIMCarrierKeyedEmitter.ts` — the code quoted above, in the legacy engine kept at `packages/core-legacy`. The design survives the rewrite as the frame stamp the pair above measures: the engine shipped today writes `changedInFrame` on the slot instead of a boolean, which is why it needs no clearing pass at all.
