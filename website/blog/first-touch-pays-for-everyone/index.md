---
slug: first-touch-pays-for-everyone
title: "The first touch pays for everyone: why derivations pull"
authors: [oimdb]
tags: [internals, performance]
date: 2026-09-06
---

A derivation has to learn that it is stale. The obvious way is for the source to push a mark at it; the way OIMDB takes is for the read to ask. The obvious way looked cheaper right up to the point where we counted what the asking actually costs — which is once per frame, for all consumers together, no matter how many of them ask.

{/* truncate */}

## Context

A write lands on a row. Somewhere above it a `filter` feeds a `sort` feeds a page of a list, and three components are on screen holding the result. Between the write and the paint, every derivation in that cone has to end up correct, and none of them should recompute twice.

Two mechanisms can carry that.

- **Push the mark.** The write walks the row's dependent derivations and sets a dirty flag on each, then keeps walking upward, because a derivation over a dirty derivation is dirty too. A read is then one boolean and a recompute if it is set.
- **Pull the comparison.** The write touches nothing but the row. A read asks the derivation to settle, and settling compares each source's revision against the derivation's own. Nothing above the row knows anything until somebody wants a value.

Push has the better-looking read: one boolean, whatever the source count. That is the whole of its case, and it is why it keeps getting proposed.

## Problem

"Push wins the read" is only an argument if reads are where the cost is. So: how much does the pull actually pay across one frame?

Two facts about this engine decide it, and neither is a matter of taste.

**The clock cannot advance during a frame.** `OIMChannel.write` opens with `assertNotFlushing()` — a write from inside a running frame throws. The clock advances only inside `write`, so from the moment a flush begins until the next write lands, every reader in the process sees one identical clock reading: the effects running inside the frame, the render that follows it, an imperative read of `.value` after that.

**A derivation records when it last asked, not only when it last derived.** A computed slot (`TOIMComputedSlot`) carries `ranAt*` — when it last derived — and the sources are compared against it. That stamp advances only when the ask ended in a derivation, so on its own it leaves an ask that found nothing changed no trace, and the next reader walks the same sources again. `checkedAt*` is the second stamp, written on every ask that completes whether or not it derived. A second ask at the same clock reading stops on two integer comparisons.

Put those together and the arithmetic changes shape. Inside one frame, the first reader to reach a node walks that node's sources; every other reader that reaches it — from any direction, at any depth, in any component — stops at the stamp. **The first touch is not the first touch of one consumer. It is the first touch among all of them, and it is shared.** A diamond stops costing twice. A subgraph under two screens stops costing twice. The number of readers drops out of the cost of the frame entirely — which is a count, and it is pinned by a test rather than by a stopwatch: `packages/core/src/engine/computed/tests/one-walk-per-clock-reading-however-many-readers.test.ts`.

What is left is one comparison:

| | what it walks, per frame | what a read costs after that |
|---|---|---|
| **pull** | the union of the cones under everything **read** | two comparisons |
| **push** | the union of the cones over everything **written** | one boolean |

The table is an argument about the graph. One recorded piece measures pull against push directly: [`2026-09-02-alternatives/settle/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-02-alternatives/settle) puts them side by side at chain depths 1, 2 and 3, and the result is mixed (pull is 1.67× cheaper at depth 1, the two are inside the instrument's error at depth 2, push is 1.70× cheaper at depth 3); it is written up in [Pull or push, measured at three depths](/blog/pull-or-push-by-depth). Three further pieces concern the dedup arm, and the state of each is on disk beside its own records:

- [`2026-09-06-alternatives/dedup-place/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-06-alternatives/dedup-place) and [`2026-09-06-alternatives/dedup-place-with-checked-stamp/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-06-alternatives/dedup-place-with-checked-stamp) each carry a `VOID.md` and **may not be cited for anything**: their writes were discarded by the engine before they reached the channel, their "deduplicating" arm had a fan-out of one and therefore never deduplicated once, and neither fixture had a subscriber, so the shipped arm skipped the dependent walk that every real consumer forces.
- [`2026-09-06-alternatives/dedup-place-rebuilt/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-06-alternatives/dedup-place-rebuilt) is the repair, and it holds **one** row — `alt.computed-dedup.getter-vs-channel.read-after-flush`, the pull at the getter against a push written into the file, at **1.87 µs against 1.78 µs per frame, a ratio of 1.05x**. That is inside the 0.85x–1.15x band the pair's author wrote down *before* running it, which is another way of saying it separates nothing. It also carries the harness's `L` marker: foreign load rose above the gate while it was measured, so the row is a shape and not an answer, and the three rows that would move one axis away from it were never taken.

So the depth sweep is the one recorded comparison, and it does not settle the direction at depth 3. The reasoning below stands on operation counts and on the code; a corrected pair, run quiet and carrying its off-axis rows, can refute it.

## Options

**Push, recomputing at the end of the frame.** Refused on correctness, not on cost. Writes here happen outside frames, so a read between a write and the flush is ordinary code — a manual scheduler, an open change span, a caller looking at what it just wrote. A frame-end recompute hands that reader the value from before the write. Make it correct and the read has to ask something; at that point it is the pull with a boolean in place of a comparison, and it still pays the write-side walk.

**Push, marking only.** Correct — the recompute stays on the read. Its cost is a walk over the cone **above the writes**, whether or not anything up there is ever read. An application holds far more derivations than any one frame reads: screens out of view, filed indexes, memoised lists. Push pays for all of them; pull does not look at a single one.

And it marks before it knows. When a `filter` recomputes and the value holds, `changedAt*` does not advance and the `sort` and the page above it are finished — one comparison instead of a re-sort. That is what `held` on a derivation is *for*. A push has already marked them, so they recompute on their next read for a change that did not happen. The cone it walks is not only sized by the wrong thing, it is bigger than it needs to be.

**Pull.** Pays a call and two comparisons per source at the first touch of each node per clock reading, and nothing after that. Its walk is sized by what is read, which is what a screen is.

## What OIMDB does

Pull. `refreshComputedSlot` returns immediately when `checkedAt*` equals the reading of the channel clock; otherwise it refreshes each source computed through its owner (`getValueForSlot`), compares each source root's revision against its own `ranAt*`, and derives only if something is ahead of it — stamping `checkedAt*` on the way out either way. `held` then decides whether `changedAt*` advances, which is what stops the chain for everyone above.

Push is not refused as an idea — it is the arm for short chains where everything derived is read and writes are rare against reads. It is not the default because its cost is proportional to the wrong quantity, and because it needs a second dependent registration on every source with the detach cost that already exists once: taking N readers off one root is `indexOf` plus `splice` per root, which is quadratic in N by count.

Teardown is measured for the subscription this engine files today: [`subscription-after-the-swap/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-02-alternatives/subscription-after-the-swap) and [`subscription-without-the-empty-walk/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-02-alternatives/subscription-without-the-empty-walk) mount and detach 64 and 256 subscribers on one identity (see [Subscribing to the identity](/blog/subscribe-to-the-identity)). No piece measures a second dependent registration for push. The quadratic claim for that registration is an operation count over the `indexOf` + `splice` path, not a measurement; a recorded churn-teardown piece at three values of N is what would turn it into one.

## Cost

Pull's price is paid where it is easiest to forget: the first touch of a deep cone is a walk, and `refreshSourceComputeds` does not stop early — every source derivation is settled, because a source must be current before the comparison can be made. Early exit exists only in the comparison (`hasSourceChangedSinceLastRun`) that follows. So a first read into a tall graph is proportional to the graph, and the stamp makes that once rather than once per reader.

The stamp has a condition. It is sound because one clock numbers every write beneath a derivation, and a derivation is handed exactly one channel clock (`TOIMChannelClock`) at construction. Ask one derivation whose sources sit behind two channels and two independently numbered revisions can collide, so the stamp would answer "asked already" for a question it never asked. No derivation in this engine has sources from two channels — and if one is ever built, that is where this breaks.

## Where it lives

- `packages/core/src/engine/computed/types/TOIMComputedSlot.ts` — the `checkedAt*` and `ranAt*` fields; `changedAt*` comes with the slot.
- `packages/core/src/engine/computed/utils/refreshComputedSlot.ts` — the refresh, and the stamps it writes.
- `packages/core/src/engine/computed/utils/hasSourceChangedSinceLastRun.ts` — the comparison of source revisions, with its early exit.
- `packages/core/src/engine/channel/OIMChannel.ts` — `assertNotFlushing` at the top of `write`, and the clock bump below it, which is why a frame has one clock reading.
- `packages/core/src/engine/computed/tests/one-walk-per-clock-reading-however-many-readers.test.ts` — the shared-first-touch count, asserted rather than timed.
