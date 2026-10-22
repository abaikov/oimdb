---
slug: when-a-computed-pays
title: "When a computed pays for itself"
authors: [oimdb]
tags: [reactivity, performance]
date: 2026-09-02
---

A computed caches a derivation so that reads between two writes do not repeat it. It also costs something to hold. One recorded piece prices a computed against calling the same function in the consumer's body, along two axes — how dear the body is, and how many reads fall between two writes — and the answer depends on both: 21.4× cheaper for a 128-row walk read sixty-four times per write, 2.50× dearer for a one-field body read eight times.

{/* truncate */}

## Question

When is a computed worth building, against recomputing in the body that reads it?

A memo pays out of the product of what the body costs and how many reads fall between two writes. Sharing a computed between consumers is the same axis: sixteen consumers reading it in one frame and one consumer reading it sixteen times both ask the node sixteen questions and run the derive body once.

## The two arms

- **A node** — `OIMSingleComputed` as it shipped on 2026-09-02, over a list of 128 rows.
- **The body** — the same function called in the consumer, with no node and no state.

Both arms write through the same `OIMChannel.write` over the same slot shape, so the write side cancels in the ratio. The dear body filters and sums the 128 rows; the cheap body reads one field off one row.

The pair is `alt.memo.a-node-vs-recomputing-in-the-body.*` in `packages/bench/src/price/alternativePairsMemo.ts`.

## The measurement

Recorded in [`2026-09-02-alternatives/memo/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-09-02-alternatives/memo). Per frame, `ours` is the node:

| row | node | body | ratio | verdict in the report |
|---|---|---|---|---|
| dear body, 1 read per write | 2.73 µs | 2.65 µs | 1.03× | unsettled (`!=±`) |
| dear body, 8 reads per write | 3.31 µs | 19.52 µs | 0.17× | node 5.91× cheaper |
| dear body, 64 reads per write | 7.61 µs | 163.03 µs | 0.05× | node 21.4× cheaper |
| cheap body, 8 reads per write | 669 ns | 267 ns | 2.50× | body 2.50× cheaper |
| mount a chain of four and drop it | 280 ns | 163 ns | 1.72× | body 1.72× cheaper |

The instrument: `control-resolution-2x` 1.95×, `control-scale-same-body` 0.98×, 1.6% from 1.00; the report treats no decision within 4.9% of 1.00 as settled. The run was gated at a foreign load of 3.50, raised from the default.

Reading the rows:

- **One read per write** is the floor of what a node can do: the derive body runs exactly once on both arms, so everything the node does is overhead. The report wrote down in advance that a reading at or below 1.00 here would mean the instrument is wrong. It came out at 1.03×, inside the run's error.
- **Eight and sixty-four reads** are where the node is for. Seven or sixty-three skipped walks of 128 rows outweigh the node's bookkeeping.
- **The cheap body** holds the read ratio of the eight-read row and makes the body trivial. At that body the node loses at the same read count that carries a dear one, so the boundary is a property of the body as much as of the reads.
- **Mount a chain of four and drop it** builds four computeds over the list, settles the head once and drops the stack, against one closure built, called once and dropped. That is the shape of the `churnChain` scenario, where neither a cached walk nor a shared value can occur; this row is the size of the structure built for nothing. No `detach` is called on either side.

## Caveats

- **Against the node, by construction.** It is a filed slot carrying `effects`, `holdCount`, `owner` and `key`, and every read paid a call into `anySourceChangedSinceRun` and an `isRevisionAfter` per source; when it derived, the comparator and two pairs of stamps. The body arm allocates nothing.
- **Not varied: the comparator cut.** Every write moves a row the filter keeps often enough for the sum to move, so the node is never handed the case where its value held and the readers above it are spared — the case in which a node does best after the read count.
- **Neither arm pays a frame.** No effect is subscribed and `channel.flush()` is never called.
- **The node has changed since.** A computed slot now carries `checkedAt*`, and `refreshComputedSlot` returns on two integer comparisons when it equals the channel clock. All reads between two writes here happen at one clock reading, so on the current engine the second and later reads take that shorter path, where the node measured here walked its sources on every read. Nothing has re-measured these rows against it.

## What it means for a consumer

Build a computed where the body walks something and more than one read falls between writes, or where several consumers share it. Read a field directly when the body is a field read.

## Where it lives

- `packages/core/src/facade/computed/OIMSingleComputed.ts` — one computed.
- `packages/core/src/facade/computed/OIMComputedCollection.ts` — a keyed collection of them.
- `packages/core/src/engine/computed/utils/refreshComputedSlot.ts` — the settle at the read, with the `checkedAt*` return.
