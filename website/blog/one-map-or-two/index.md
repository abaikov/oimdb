---
slug: one-map-or-two
title: "One map or two: where the row lives"
authors: [oimdb]
tags: [internals, performance]
date: 2026-10-12
---

A keyed store can keep a row and its identity together — one `Map<key, slot>`, the
row on the slot — or apart: a `Map<key, row>` for the data and a second
`Map<key, slot>` whose identities are minted only when something needs one. Apart
is the cheaper first load. It is dearer on every write once anything is watching,
and dearer by 3.5× when a subscription asks for an identity.

{/* truncate */}

## Context

Every row in OIMDB has an identity — the *slot* — and the slot carries the
bookkeeping a reactive store needs: the subscriber list, the revision it last
changed at, the hold count, the emptiness flag. Thirteen fields.

A row also has data. The question is whether the two live in one place.

## Problem

Keeping them together means a first load mints a slot per row, and a slot is an
object. A population of ten thousand rows is ten thousand slots nobody has
subscribed to yet, and most of them nobody ever will.

So the proposal: keep the rows in their own map and mint identities lazily. The
first load then writes one map entry per row and allocates nothing.

## Options

**One map.** `slots.get(key)` resolves the row and its subscriber list in one
hash, because they are the same object. A write already holds everything it needs
to decide whether anybody must be told.

**Two maps.** `rows.set(key, row)` stores the data. But a write still has to
answer "does anybody watch this key?", and nothing but the identity map can
answer it — so once that map is non-empty, every write pays a second hash. The
early return on an empty identity map is available exactly once in a store's
life: before the first subscription.

## The numbers

Four rows, one per axis, both arms hand-written so only the map arrangement
differs. 8192 rows per pass, 15 samples, two independent processes per arm — both
readings are printed because the second has as much claim on the quotient as the
first.

| axis | one map | two maps | cheaper |
|---|---|---|---|
| first load, nobody subscribed | 84 / 76 ns | 54 / 56 ns | two maps, by ~25 ns/row |
| read the row by key | 31 / 35 ns | 30 / 28 ns | a tie |
| overwrite, one subscriber standing | 34 / 30 ns | 38 / 48 ns | one map |
| subscription: key → identity | 29 / 33 ns | 113 / 104 ns | one map, by ~3.5× |

**THE SPREAD ON THIS RUN IS LARGE AND THE READER SHOULD KNOW IT.** Inside a
process the samples spread 44% to 490%; between its two processes each arm
disagreed with itself by 3.7% to 27.3%. The harness marks all four rows `void`
for exactly that reason, and its own rule is that a voided ratio decides nothing.
The figures above are printed as what was observed, not as settled margins: read
the first and the fourth row as directional, and the second and third as too
close to separate on this run. A quieter machine would narrow them; it would not
move the operation counts below, which is why the decision rests on those.

## What the operation counts say, machine or no machine

| axis | one map | two maps |
|---|---|---|
| first load | `get` (miss) + mint 13 fields + `set` | one `set` |
| read by key | `get` + one property load | `get` |
| overwrite with a subscriber | `get` + field writes + read `effects` | **`set` + `get`** + field writes + read `effects` |
| subscription | `get` | `get` (miss) + mint + `set` + `get` into the row map |

The asymmetry is the whole decision. Two maps save **once per row** — a mint on
the load, a property load on the read. They pay **on every write, for ever**, from
the moment the first subscriber appears: a second hash to learn whether this key
is one somebody watches. And they move the mint onto the subscription path, where
it also has to read the row map, or the subscriber would start from nothing.

A store that is loaded once and read is better off apart. A store that is written
to while something is watching — which is what a reactive store *is* — is better
off together.

## What OIMDB does

One map. The row lives on the slot.

The first load pays a mint per row and we keep it, because the alternative buys a
one-off saving with a permanent tax on the write path and a 3.5× tax on mounting
a subscription. The mint itself was measured separately and is mostly not ours:
of 83.3 ns per identity, 8.6 ns is our own code and the rest is V8's `Map`.

What this decision does **not** rest on is bytes. Two maps with nobody subscribed
hold no slots at all, so they save the whole object per row, and on a large
enough population that could outweigh everything above. That measurement does not
exist yet, and when it does it may reopen this.

## Reproducing it

```bash
npm run alternatives -- --only identity-store
```

Four pairs in `packages/bench/src/price/alternativePairsIdentityStore.ts`, with
the reasoning beside them in `packages/bench/src/price/README.md#alternativepairsidentitystore`. Neither arm is
`OIMEntityCollection`: the shape only shows with the change window, the column
slots, the emptiness check and the collector taken out of both sides, so these
rows are not a reading of the library and must not be quoted as one.
