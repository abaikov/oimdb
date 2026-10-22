---
slug: pull-or-push-by-depth
title: "Pull or push, measured at three depths"
authors: [oimdb]
tags: [reactivity, performance]
date: 2026-09-02
---

A derivation finds out it is stale either because the read asks its sources, or because the write already marked it. OIMDB asks at the read. One recorded piece puts both against each other at chain depths 1, 2 and 3, with everything else held still: the read-side check is 1.67× cheaper at depth 1, the two are inside the instrument's error at depth 2, and the write-side mark is 1.70× cheaper at depth 3.

{/* truncate */}

## Context

Between a write to a root slot and the next read of a computed above it, the computed has to end up current. Two mechanisms can carry that.

- **Pull at the getter.** The write stamps the root and stops. A read settles the computed by comparing each source's revision against the computed's own `ranAt*` stamp, bringing source computeds current first.
- **Push at the write.** The write walks the transitive dependents and sets a dirty flag on each, stopping where the flag is already set. A read then learns in one boolean that it owes a derivation.

Push has the cheaper read and pays for it at the write; pull pays nothing at the write and one comparison per source at each read. Which is cheaper per frame depends on how those costs grow with the depth of the graph, and that is the axis this piece moves.

## The measurement

`alt.settle.pull-at-the-getter-vs-push-at-the-write.depth-{1,2,3}`, in `packages/bench/src/price/alternativePairsSettle.ts`, recorded in [`2026-09-02-alternatives/settle/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-02-alternatives/settle). Every row writes 300 roots per frame and then reads 200 computeds whose derive body walks 3 sources. Only the number of levels between the roots and the computeds that are read moves.

| depth | pull (ours) | push | ratio | verdict in the report |
|---|---|---|---|---|
| 1 | 2.80 µs | 4.67 µs | 0.60× | pull wins, 1.67× cheaper |
| 2 | 12.60 µs | 12.48 µs | 1.01× | unsettled — inside the run's own error |
| 3 | 33.09 µs | 19.44 µs | 1.70× | push wins, 1.70× cheaper |

All per frame. The instrument: `control-resolution-2x` 1.94×, `control-scale-same-body` 1.04×, 3.8% from 1.00, so the report treats no ratio within 3.8% of 1.00 as a reading and no decision within 11.4% of it as settled. The run was gated at a foreign load of 3.50, raised from the default (`gateWasRaised: true`).

At depth 1 the sources under every read are roots, which are current by definition, so push's walk at the write bought nothing. Each added level grows pull's read faster than it grows push's mark, and the two cross between depth 1 and depth 2.

## Which way the rows lean

The report lists these under every row:

- **Against pull.** The pull arm is `OIMSingleComputed` as it shipped on 2026-09-02, a filed slot carrying `effects`, `holdCount`, `owner` and `key`, and every settle paid a call into `anySourceChangedSinceRun`, an `isRevisionAfter` per source, the comparator and two pairs of stamps (`ranAt*` and `changedAt*`). The push arm's node carried one boolean and wrote it once.
- **Against push.** Nothing, except that it walks a recursive `markDependents` where a real engine might flatten it.
- **Not exercised: a change absorbed part-way up.** Every root moves every frame and every sum changes, so the comparator never cuts a chain on either arm and push is never charged for marking a cone whose value held. That is the arrangement in which push is at its worst, and it is not in this piece.
- **Not exercised: sharing.** Every node is read by exactly one consumer.
- **Neither arm pays a frame.** No effect is subscribed and `channel.flush()` is never called.

So all three rows are tilted toward push, and the depth-3 row is the far end of the one axis that could reverse the choice. Three levels of 200 nodes each is deeper than most screens go.

## What OIMDB does

Pull. `refreshComputedSlot` refreshes each source computed through its owner, asks `hasSourceChangedSinceLastRun` whether any source revision is ahead of `ranAt*`, and derives only if one is. `changedAt*` advances only when the derived value differs from the previous one by the slot's same-value guard, which is what stops the chain for everything above a value that held.

Since this run the computed slot also gained `checkedAt*`, a stamp written on every completed ask, so a second read at the same clock reading stops on two integer comparisons — see [The first touch pays for everyone](/blog/first-touch-pays-for-everyone). With one reader per node, as here, that stamp has nothing to save, so the rows above say nothing about it either way. That post also states that no piece in the tree measures pull against push; this piece, recorded four days earlier, does, at the one geometry above.

Push stays unshipped. The rows show where it would win — deep chains where everything changes — and the arrangement where it should lose has not been measured. A push arm also marks at the write, so it is not a strategy a derivation can choose in its own constructor: the write path would have to read a dependents list on behalf of every consumer, including those that took the other arm.

## Where it lives

- `packages/core/src/engine/computed/utils/refreshComputedSlot.ts` — the settle at the read, and the stamps it writes.
- `packages/core/src/engine/computed/utils/hasSourceChangedSinceLastRun.ts` — the per-source revision comparison.
- `packages/core/src/engine/computed/utils/refreshSourceComputeds.ts` — bringing source computeds current first.
- `packages/core/src/engine/computed/types/TOIMComputedSlot.ts` — `ranAt*`, `checkedAt*`, and `changedAt*` from the slot.
