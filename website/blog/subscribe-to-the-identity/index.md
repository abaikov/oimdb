---
slug: subscribe-to-the-identity
title: "Subscribing to the identity, and what it costs to leave"
authors: [oimdb]
tags: [internals, performance]
date: 2026-09-02
---

An effect in this engine subscribes to the slot it was handed; the 3.12.1 engine subscribed a handler under a key. Three pieces recorded on one evening put the two side by side on the wake and on the mount-and-release cycle. The wake went to the slot subscription in all three. The mount-and-release cycle went against it until the detach stopped searching for itself, and then came out 1.13× cheaper.

{/* truncate */}

## Context

In 3.12.1 a subscription is addressed by a key: `OIMCarrierKeyedEmitter.subscribeOnKey` reserves a carrier through the collection's provider and puts a handler in that carrier's `Set`; a write calls `markUpdatedKey`, and `OIMEventQueue.flush` delivers. In this engine an effect is handed the slot itself and files itself in the slot's subscriber list, so neither the subscribe nor the mark pays a hash.

That difference is the design's and not the harness's: 3.12.1 has no slot-addressed subscribe.

## Question

Is a subscription filed on the identity cheaper to wake, and what does it cost to mount and take down — the half of a component's life with no wake in it?

## The measurement

`alt.subscription.effect-vs-keyed-handler.*` in `packages/bench/src/price/alternativePairsSubscription.ts`. Both arms call the shipped classes of both engines directly — `OIMChannel.effect` / `write` / `flush` against 3.12.1's `subscribeOnKey` / `markUpdatedKey` / `OIMEventQueue.flush` — with no adapter, no dataset and no consumer. No entity is written, no patch merged, no derivation settled; each engine flushes once per frame.

Three recorded pieces, in the order they were taken:

1. [`2026-09-02-alternatives/subscription/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-02-alternatives/subscription) — the detach "splices itself out of every root it filed on".
2. [`2026-09-02-alternatives/subscription-after-the-swap/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-02-alternatives/subscription-after-the-swap) — the detach "takes itself out of every list it is filed on by the position it remembers". This piece adds the 64-subscriber row.
3. [`2026-09-02-alternatives/subscription-without-the-empty-walk/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-02-alternatives/subscription-without-the-empty-walk) — its report text is identical to the second's apart from the readings. The directory's name is the only record of what changed between the two; nothing in the tree describes the walk that was removed.

Per frame, ours against 3.12.1:

| row | run 1 | run 2 | run 3 |
|---|---|---|---|
| wake 256 identities, one effect each | 4.31 µs / 8.16 µs — 0.53× | 3.97 µs / 8.42 µs — 0.47× | 3.52 µs / 8.21 µs — 0.43× |
| wake 256 effects on one identity | 2.65 µs / 3.57 µs — 0.74× | 2.73 µs / 3.54 µs — 0.77× | 2.63 µs / 3.57 µs — 0.74× |
| mount 64 on one identity and detach them | — | 7.04 µs / 4.45 µs — 1.58× | 3.86 µs / 4.45 µs — 0.87× |
| mount 256 on one identity and detach them | 32.83 µs / 18.45 µs — 1.78× | 30.83 µs / 18.87 µs — 1.63× | 15.53 µs / 17.56 µs — 0.88× |

The instrument, per run: `control-resolution-2x` 1.92× / 1.95× / 1.93×; `control-scale-same-body` 1.3% / 1.2% / 0.1% from 1.00. All three were gated at a foreign load of 3.50, raised from the default (`gateWasRaised: true`).

## Reading it

**The wake.** The two wake rows differ in one thing — whether the 256 wakes share an identity — so together they say whether a design pays per subscriber or per identity. On 256 identities the old engine pays a hash per mark and the slot subscription does not; that row must not be quoted as "dispatch is faster" without saying what it is faster at. Neither row asks about coalescing across a frame: there is one write per frame. That is the `alt.coalesce-vs-eager.*` family in [`2026-08-20-alternatives/dispatch/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-08-20-alternatives/dispatch).

**The teardown.** The 64-subscriber row exists to show a term that grows with the number of subscribers on one identity: divide it by four and set it against the 256 row. In run 1 the detach found itself with `indexOf` and removed itself with `splice`, so every removal shifted the tail of the list. Run 2 removes by remembered position. Run 3 is the first in which both teardown rows came out below 1.00.

**What sits against us on every row.** An effect is born holding its two source lists, stamps itself against the clock and files itself onto every root it reads; the old engine's handler is a function put in a carrier's list. **Against the old engine:** `subscribeOnKey` pays a hash to reserve a carrier, which ours does not.

## What OIMDB does

Subscribes to the slot, and detaches by position with a swap from the tail. Each edge an effect files records where it landed: `positionInFirstSubscribedSlot` for the first, `positionsInOtherSubscribedSlots` for the rest. `OIMSlotOwner.unsubscribeFromSlot` checks that the effect still sits at that position, moves the tail subscriber into it, pops the tail, and tells the moved effect its new position through its service. No search, no shift.

## Caveats

- **The effect measured is gone.** These rows ran `OIMEffect`, a class. On 2026-10-18 the effect became a `TOIMEffect` literal driven by `OIMEffectService` — see [An effect as a literal, driven by one service](/blog/effect-as-a-literal). The swap-with-tail detach carried over; the rows have not been re-run on the literal.
- **The third run's change is not identified** anywhere but in its directory name, so the step from run 2 to run 3 is a measured effect with no recorded cause.
- [The first touch pays for everyone](/blog/first-touch-pays-for-everyone) says no directory under `packages/bench/measurements/` holds a teardown piece. The mount-and-release rows above are teardown pieces at two subscriber counts on one identity, recorded four days before that post.
- `packages/bench/WHY-EACH-ROW.md` describes the 256-subscriber teardown row as not re-run against the position-based detach. Runs 2 and 3 are that re-run.

## Where it lives

- `packages/core/src/engine/slot/OIMSlotOwner.ts` — `subscribeToSlot` and the swap-with-tail `unsubscribeFromSlot`.
- `packages/core/src/engine/computed/OIMEffectService.ts` — `setPositionInSubscribedSlot` and `disposeEffect`.
- `packages/core/src/engine/computed/types/TOIMEffect.ts` — the two position fields.
