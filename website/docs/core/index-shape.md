---
sidebar_position: 8
title: Why an index looks like this
description: Why index membership is a pushed bucket while its order is a pulled computed, and what that split means for the code you write.
---

import LiveDemo from '@site/src/components/LiveDemo';

# Why an index looks like this

An index answers two questions about a key: **which** entities are under it, and **in
what order**. OIMDB deliberately answers them with two different mechanisms:

| Question | Answered by | Mechanism |
|---|---|---|
| which entities | a bucket, kept by `OIMIndexService` | **push**: every write is delivered to the index, which edits the bucket |
| in what order | a computed, kept by `OIMComputedServiceSorted` | **pull**: the order is derived when somebody reads it |

This page explains why membership cannot be a computed and why the order should be one.

<InShort>

- Which entities are under a key is a bucket kept by `OIMIndexService`, and every write is delivered to the index.
- In what order is a computed kept by `OIMComputedServiceSorted`, derived when somebody reads it.
- A computed learns that something changed and is never told what, and its sources are fixed when it is created.
- So membership is a bucket, because the pull mechanism can find out that something is new only by looking at everything.

</InShort>

## A computed is pull

A computed slot is refreshed by its owner when its value is read
(`getValueForSlot`). The refresh asks one question of every
source: *did you change since my last run?* If any did, `derive` runs again from the top.

Two things follow from this:

- A computed learns that something changed and is never told what. The answer to "did you
  change" is a revision on the source, not a description of the change.
- Its sources are fixed when it is created. `createSources` runs once, when the
  slot is minted, and `sourceSlots` and `sourceComputeds` are read-only on the slot.
  Nothing hands it new sources afterwards, and nothing can push "this entity arrived"
  into it. Its value is whatever `derive` returns.

## So membership cannot be a computed

Take "the cards of the red deck" as a computed. There are two ways to write it, and both
fail:

- **Its sources are the cards it knows about.** A card inserted later is not among them,
  so the computed never sees it arrive.
- **Its source is something that moves on every write to the collection, and `derive`
  scans every card.** Now it does see new cards, but only by reading all of them, on every frame
  in which any card changed, in every deck that has such a computed. A write to one card
  of the blue deck costs a full scan for the red one.

The pull mechanism can find out that something is new only by looking at everything, so
membership is a bucket.

## Membership is a bucket, and it is pushed

An index store slot, made by `indexService.createIndexStoreSlot(sourceStoreSlot)`, is a
content-change listener on that source collection. Every write delivers the
written entity slot to it, and the index does this per slot:

1. reads the key it last filed the slot under, from the slot's own `indexKeys` cell;
2. computes `keyOf(entity)`;
3. if the two are equal, membership did not change, and no bucket is edited — only the
   bucket's any-column slot and bucket column slots are marked, which report member
   content and not membership, and only if somebody has asked for them;
4. if they differ, it writes the new key into the cell, removes the slot from the old
   bucket and adds it to the new one. A bucket that is not minted is skipped: a key
   nobody asked for costs the `keyOf`, the comparison and the cell write, and nothing else.

The cost of a write is one `keyOf`, one cell read and at most two bucket edits. It does not
depend on how many entities the collection holds or how many buckets the index has. A batch
of writes is grouped by key first, so each bucket is edited once per batch.

The only scan over the source happens when a bucket is **minted**: the index fills a new
bucket once with the entities that match its key, and when several keys are asked for in
one call (`getSlotsByKeys` / `holdSlotsByKeys`) one scan fills them all.

## The order is a computed

A sort is worth doing far less often than a write happens. A frame can carry many writes
into one bucket, and a bucket that nobody renders in order does not need an order at all.
Pushing the order (re-placing a slot on every write) pays for each write. Pulling it pays
once per frame, at the read, and never for a bucket nobody reads.

`OIMComputedServiceSorted` is a computed service over an
`OIMIndexService`, and each store slot it creates reads one index store slot. Its computed for a key has
these sources:

- the bucket slot of that key — it moves when membership changes;
- with `sortColumns`, one bucket column slot per sort column — it moves when a write changes
  that column on a member of the bucket. The index marks them only once somebody has
  asked for a bucket column slot, so an index with no sorted view pays nothing for them;
- with only a `comparator`, the bucket's any-column slot (`getAnyBucketColumnByKey`), so
  any write to a member counts. That slot wakes on member content only; a member joining or
  leaving wakes the bucket slot, which is the first source.

A write that changes neither membership nor a sort column — a title edit — moves none of
these sources, and the order is not derived again.

For point updates into large buckets the other arm ships too: an index that keeps its own
buckets sorted at write, `createOIMIndexServiceSortedArrayDriven`
([Sorted at write](/docs/core/oimindex#sorted-at-write)).

## Derive is a reconcile

A pull on its own would rebuild the list and sort it from scratch every time. The
derivation avoids that by starting from its previous value:

- **membership changed**: the previous array is walked against the bucket's current
  members; survivors keep their previous positions, departed slots are dropped, arrivals
  are appended. Then the array is sorted;
- **only a sort column changed**: the previous array is copied and sorted.

Either way the sort runs over an array that is already in order apart from what changed.
A sort that yields the same sequence keeps the previous array (`oimSameSlotSequence`), so
its `changedAtRevision` does not move and nothing downstream wakes.

## See it

Three decks, an index by deck, a sorted view by rank. Rename a card: only that card's
effect runs and no deck is derived again. Re-rank one: its deck's order is derived on
the next read. Move one: the index pushes it between two buckets.

<LiveDemo />

## In code

```ts
import { OIMDB, OIMEffectService, createOIMComputedServiceSorted, createOIMEntityService, createOIMIndexService } from '@oimdb/core';

type Card = { id: string; deck: string; title: string; rank: number };

declare function render(value: unknown): void;

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);

const cardsByDeckService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);
const cardsByRankService = createOIMComputedServiceSorted({
    indexService: cardsByDeckService,
    sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const cardsByRank = cardsByRankService.createSortedStoreSlot(cardsByDeck);

const red = cardsByRankService.computedCollectionService.holdSlotByKey(cardsByRank, 'red');
effectService.createEffectImmediate(db, [], [red], () => render(red.computedValueService.getValueForSlot(red)));
```

`cardsByDeck` is pushed to on every write to `cards`. `red` is derived when the effect
runs, and only if the red deck's membership or a card's `rank` in it moved. A title
edit wakes neither.

## What follows for your code

- If the entity decides which entities belong to a key, use an `OIMIndexService`.
- If the entities' columns decide the order, use `createOIMComputedServiceSorted`
  over the index service, which already skips the frames in which no sort column moved.
- If the user decides the order, use an array-driven bucket
  service whose positions are the caller's
  ([Positions the caller decides](/docs/core/indexes#positions-the-caller-decides)).
- If a server or a search decides which entities belong, use a manual bucket service
  ([A bucket's slots are the caller's](/docs/core/indexes#a-buckets-slots-are-the-callers)).

## Where to next

<DocCards>
<DocCard to="/docs/core/indexes" title="Buckets">The full API of buckets.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">The full API of `OIMIndexService`.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">`OIMComputedServiceSorted` and the other derivations.</DocCard>
<DocCard to="/docs/core/architecture" title="Architecture">Push and pull in the reactive model.</DocCard>
</DocCards>
