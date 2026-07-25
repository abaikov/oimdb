---
slug: mid-batch-updates
title: "An update during the batch is a consequence, not an input"
authors: [oimdb]
tags: [reactivity, internals]
date: 2026-07-24
---

Many reactive systems drain a queue and let handlers enqueue more updates into the same drain, processed right there. But an update that only appears *because* the batch is running is never new input — it's a consequence, and consequences are derivations. There is no such thing as new source truth in the middle of a batch.

{/* truncate */}

## Context

A flush takes the source mutations that accumulated since the last flush and settles everything that depends on them. Sources are the inputs — a user typed, a request resolved, code called `upsert`. Anything that happens *while* the flush runs is downstream of those inputs.

## Problem

The tempting shortcut is to reprocess whatever gets enqueued mid-flush in the same flush. It rests on a category error: that a value written during the batch might be new input. It never is. Walk the cases:

- **"When X changes, set Y."** `Y` is a function of `X` — that is denormalization, and the thing that turns one value into another is a computed. Written as an imperative effect, it's a computed you haven't named. Re-drained in place, it thrashes (recomputes once per source-mutation) and can run on a half-updated graph — a glitch ([why computed values wait for the flush](/blog/glitch-free-batched-compute)).
- **An async result.** It isn't in this batch at all — the response lands later, as its own event, starting its own flush. The effect in *this* batch only kicks off the I/O; the write happens in a future round.
- **The current time, a random value.** These are genuinely new information — so they are *inputs*. If `Y = X × now()`, you have two inputs, `X` and `now`, and `Y` is a computed of both. You model the clock as a source, not as an imperative write buried in an effect.

Every route ends in the same place: what arises during the batch is a derivation. New input always arrives as its own event, in its own batch.

## Options

- **Re-drain mid-flush enqueues in place.** Treats derivations as inputs — thrash, glitches, and writes that feed themselves with no bounded end.
- **Recompute derivations eagerly, per mutation.** Redundant recomputes and glitches on every shared descendant.
- **Settle derivations once, after the sources are fixed, in dependency order.** Each derived value recomputes once; new source truth only ever comes from the next batch.

## What OIMDB does

The third. The **compute runtime** recomputes dirty computeds **once each**, parents before children, by [graph level](/blog/precomputed-levels), at the flush boundary. A chain `A → B → C` collapses in one ordered pass; a value with three dirty inputs recomputes once.

And the **queue** defends the boundary. If code *does* write a source inside an effect — a computed that wasn't named — a [double-buffered swap](/blog/queue-double-buffer) sends that write's notification to the *next* flush, not this one. The mismodeled write can't cascade in place; the current flush stays bounded. The fix is still to make it a computed, but the queue won't let it melt down in the meantime.

## Cost

One mental model to hold: the batch settles at the flush boundary, not at the instant of each write. A source you write in an effect is in the store immediately but doesn't notify until the next flush, so a subscriber won't have reacted synchronously. And the tell is simple — if you're writing a source inside an effect, you've found a computed you haven't named yet.

## Where it lives

- `packages/core/src/modules/compute/core/OIMComputeRuntime.ts`, `.../computed/core/OIMComputed.ts` — level-ordered, recompute-once-per-flush derivation.
- `packages/core/src/core/OIMEventQueue.ts` — double-buffered drain; a source write during a flush defers to the next.
