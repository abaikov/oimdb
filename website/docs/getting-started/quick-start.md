---
sidebar_position: 2
description: Build a working program step by step with an entity collection and its store slot, writes, a subscription and flush, an index, a sorted view and a hand-filled bucket.
---

# Quick Start

This page takes you from nothing to a working program with an entity collection and
its store slot, an index, a sorted view, a subscription and a flush. Each step links to the page
that covers that piece in full.

The steps add up to one program. The blocks marked `setup` hold its declarations, in
order, and every example builds on them and on the writes the earlier steps made.
The comment after a call shows what it logs.

## 1. The runtime

```typescript setup
import { OIMDB, OIMEffectService } from '@oimdb/core';

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
```

`OIMDB` holds what every collection on a page has to share: the clock, the default channel slot
(`db.defaultChannelSlot`) and the unused-slot collector slot (`db.collectorSlot`). It
also carries the optional strategies you give it (`entityWriter`,
`slotReleasePolicy`, `slotStamp`, `indexKeysService`), and every factory that
takes `db` (`createOIMEntityService`, `createOIMIndexService`, …) passes them
on to what it builds. Every service is stateless: the state lives on the store slots and the
slots, so `OIMEffectService.INSTANCE` is the one effect service there is.

Collections that are meant to wake each other's subscribers have to share a channel slot.
Creating every store slot with `createStoreSlot(db)` guarantees that, so you never wire a
channel by hand.

The channel is the clock and the delivery pass. A **frame** delivers
every write made since the previous frame: each effect those writes scheduled runs
once, then the after-each-frame handlers run (see the
[glossary](/docs/core/model#glossary)). With no options, nothing is delivered until
you call `db.flush()`. A write marks what it changed and asks for a frame. The
frame runs when you flush, and every effect whose sources moved runs once in it,
however many writes landed before it. A test flushes where it wants to assert. An
application hands the flush to its orchestrator: with cnstra that is one line,
and every synchronous turn of a stimulation becomes one frame. See
[delivery with cnstra](/docs/guides/with-cnstra).

To have the channel decide when to deliver, give it a scheduler:

```typescript
const scheduledDb = new OIMDB({
    channelScheduler: (flush) => { void Promise.resolve().then(flush); },
});
// the first write of a turn schedules one flush in a microtask; no db.flush() call is needed
```

The model behind the frame is on [The model](/docs/core/model#the-frame). The
rules for writing during a frame are under
[The frame](/docs/core/channel#the-frame).

## 2. An entity collection and its store slot

```typescript setup
import { createOIMEntityService } from '@oimdb/core';

type Card = { id: string; deck: string; title: string; rank: number };

const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
```

```typescript
console.log(cardService.hasSlotContentByKey(cards, 'c1'));   // false: nothing is written yet, and the read mints nothing
```

An entity collection files entities by primary key. `keyOf` says how to get the key
out of an entity. The collection service holds no data: you make it once per entity type, and
each `createStoreSlot(db)` is one collection of that type, a store slot carrying its own
store. The collection service has the reads (`getSlotByKey`, `holdSlotByKey`, `findSlotByKey`,
`getSlots`, the column doors); its `slotContentService` has the writes. A door that works on the
store takes the store slot first; a door that works on a slot it is handed takes only the slot.
`createOIMEntityService` is a convenience wrapper over the base layer (section 9). It also accepts
`entityWriter` (how a write lands: in place or replacing, see
[The two writers](/docs/core/writing#the-two-writers)) and `slotReleasePolicy`
(when a slot goes, see
[Releasing an identity](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing)).
Both are picked here, at construction, so no write branches on them later.

Collections and keys (scalar and composite) are covered on
[Collections and identities](/docs/core/collections).

## 3. Write

```typescript setup
const cardContentService = cardService.slotContentService;
const first = cardContentService.upsertEntity(cards, { id: 'c1', deck: 'd1', title: 'alpha', rank: 1 });
const second = cardContentService.upsertEntity(cards, { id: 'c2', deck: 'd1', title: 'beta', rank: 2 });
```

```typescript
console.log(first.entity?.title);                  // alpha
console.log(first === cardService.getSlotByKey(cards, 'c1'));   // true: the key resolves to the same identity
```

`upsertEntity` returns the slot, which is the entity's identity. Keep it. Every
later operation that goes through the slot (`cardContentService.updateEntity(slot, patch)`,
`cardContentService.deleteEntity(slot)`, a subscription) does no lookup to find the entity.
Getting the slot back later with `cardService.getSlotByKey(cards, 'c1')` costs a map read. There
are no by-key write doors: resolve the slot once, then write through it.

A key is resolved to an identity once, and everything after goes through the
identity. See [The model](/docs/core/model) and [Writing](/docs/core/writing).

After this step the store slot `cards` holds `c1` (deck `d1`, title `alpha`, rank 1) and
`c2` (deck `d1`, title `beta`, rank 2).

## 4. Subscribe and flush

```typescript
const effect = effectService.createEffect(db, [first], [], () => {
    console.log('card is now', first.entity?.title);
});

cardContentService.updateEntity(first, { title: 'ALPHA' });
cardContentService.updateEntity(first, { title: 'ALPHA!' });
db.flush();          // -> "card is now ALPHA!" — once, for both writes

effectService.disposeEffect(effect);
```

An effect is a plain object, built and disposed by `OIMEffectService.INSTANCE`.
`effectService.createEffect(db, sourceSlots, sourceComputeds, body)` builds an effect. Its body
runs in the next frame after one of its sources moved, once per frame. It only reacts to writes
made after it was created. `effectService.createEffectImmediate(…)` is the same, but also runs
the body once at creation. `effectService.subscribeEffect(…)` is `createEffect` that hands back a
disposer. `effectService.disposeEffect(effect)` gives the subscription back.

A subscription is an effect over slots rather than a selector over the whole
state, so a write to `c1` does not call anything subscribed to another entity. See
[Reading and subscribing](/docs/core/reading-subscribing).

Now `c1` has the title `ALPHA!`.

## 5. Watch one column

```typescript
const titleColumn = cardService.holdColumn(first, 'title');
const titleEffect = effectService.createEffect(db, [titleColumn], [], () => {
    console.log('title is now', first.entity?.title);
});

cardContentService.updateEntity(first, { rank: 5 });         // does not run it
db.flush();                                            // logs nothing

cardContentService.updateEntity(first, { title: 'alpha' });  // does
db.flush();                                            // -> "title is now alpha"

effectService.disposeEffect(titleEffect);
cardService.unholdColumn(titleColumn);
```

Every column of an entity can have a slot of its own. Use it when a consumer
renders a single field of an entity whose other fields change often.
The root of the column form is the **column slot**.
Getting it is a separate call on the collection service: `holdColumn(slot, name)` creates it and
holds it, `unholdColumn(column)` gives the hold back, and the column slot is
released once its last effect is disposed and nothing holds it. See
[Subscribing to one column](/docs/core/reading-subscribing#subscribing-to-one-column).

Now `c1` has the title `alpha` and rank 5.

## 6. An index

```typescript setup
import { createOIMIndexService } from '@oimdb/core';

const cardsByDeckService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);
```

```typescript
const deckOne = cardsByDeckService.holdSlotByKey(cardsByDeck, 'd1');
const deckContentService = cardsByDeckService.slotContentService;
const onDeckOne = effectService.createEffect(db, [deckOne], [], () => {
    console.log('d1 has', deckContentService.getBucketMemberSlotCount(deckOne), 'card(s)');
});

console.log(deckContentService.getBucketMemberSlotCount(deckOne));   // 2: c1 and c2, filed when the bucket was minted

cardContentService.upsertEntity(cards, { id: 'c3', deck: 'd1', title: 'gamma', rank: 1 });
db.flush();          // -> "d1 has 3 card(s)"

cardContentService.updateEntity(first, { title: 'Alpha' });
db.flush();          // logs nothing: c1 is still in d1

cardContentService.updateEntity(second, { deck: 'd2' });
db.flush();          // -> "d1 has 2 card(s)"

effectService.disposeEffect(onDeckOne);
deckOne.owner.unholdSlot(deckOne);
```

An index files the entities of one entity store slot into **buckets** by the key
`keyOf` derives from each entity. Use it when an entity's place follows from
its own columns ("the cards of a deck"). Moving a card is then a write to
the card. The index service is made once per entity collection type; its
`createIndexStoreSlot(cards)` returns the index's bucket store slot for that one
entity store slot, and `disposeIndexStoreSlot` takes it down.

- The index store slot listens to the source store slot itself; the entity
  collection does not know about indexes.
- A bucket wakes on membership only: an entity joining or leaving it. A write
  to an entity that stays in the bucket wakes the entity's own subscribers and
  leaves the bucket's alone.
- A bucket is minted on its first `getSlotByKey` / `holdSlotByKey` and is filled
  from the entities written before that, without a flush.
- The bucket strategy is the index's `slotContentService` option: array-driven (arrival order)
  by default, `new OIMSlotContentBucketServiceSetDriven()` for no order. The array-driven one is
  what a sorted view reconciles against.

`holdSlotByKey` takes a counted reference on the bucket. Give it back with
`slot.owner.unholdSlot(slot)` once you are done. That count, plus the effects on the bucket, is all
that keeps the bucket alive. See
[Indexes](/docs/core/oimindex),
and [Why an index looks like this](/docs/core/index-shape) for why membership is
pushed.

Now deck `d1` holds `c1` (`Alpha`, rank 5) and `c3` (`gamma`, rank 1); `c2` is in `d2`.

## 7. A sorted view

```typescript setup
import { createOIMComputedServiceSorted } from '@oimdb/core';

const cardsByRankService = createOIMComputedServiceSorted({
    indexService: cardsByDeckService,
    sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const cardsByRank = cardsByRankService.createSortedStoreSlot(cardsByDeck);
```

```typescript
const sortedDeckOne = cardsByRankService.computedCollectionService.holdSlotByKey(cardsByRank, 'd1');
const onSorted = effectService.createEffectImmediate(db, [], [sortedDeckOne], () => {
    console.log(sortedDeckOne.computedValueService.getValueForSlot(sortedDeckOne).map((slot) => slot.entity?.title));
});
// -> [ 'gamma', 'Alpha' ]

cardContentService.updateEntity(first, { title: 'ALPHA' });
db.flush();          // logs nothing: no member arrived or left, and no rank changed

cardContentService.updateEntity(first, { rank: 0 });
db.flush();          // -> [ 'ALPHA', 'gamma' ]

cardContentService.updateEntity(second, { deck: 'd1' });
db.flush();          // -> [ 'ALPHA', 'gamma', 'beta' ]

effectService.disposeEffect(onSorted);
sortedDeckOne.owner.unholdSlot(sortedDeckOne);
```

A sorted view is a computed store slot over an index store slot: one computed slot per
bucket key, whose value is that bucket's entity slots in order. The sorted service takes no
`db`: its store slots run on the channel slot of the index store slot they sort.

- Its sources decide when it re-sorts: the bucket slot (membership) plus one
  bucket column slot for each column in `sortColumns`. A write to a column that is not
  listed does not re-derive it. A `comparator` replaces the column order. Given
  without `sortColumns`, it re-sorts on any write to a member.
- The order is derived by the read that asks for it (`slot.computedValueService.getValueForSlot(slot)`),
  never ahead of time. The effect above names it in the third
  argument, `sourceComputeds`, and the channel refreshes it before it decides whether
  to run the body. Read a computed's value only through its value service. The `value`
  field on the slot is not refreshed on its own.
- A re-sort that yields the same sequence keeps the previous array, so a consumer
  that compares by reference needs no comparison of its own.

A bucket does not sort. The order lives in this derivation over the index,
because the order belongs to the read and membership belongs to the write. See
[Ordering](/docs/core/oimindex#ordering) and
[The compute graph](/docs/core/computed-effects).

## 8. A bucket you fill yourself

```typescript setup
import { createOIMBucketService, type TOIMEntitySlot } from '@oimdb/core';

const searchResultService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const searchResults = searchResultService.createStoreSlot(db);
```

```typescript
const alphaQuery = searchResultService.holdSlotByKey(searchResults, 'q:alpha');
const resultContentService = searchResultService.slotContentService;
resultContentService.writeBucketMemberSlots(alphaQuery, [first]);
db.flush();

const onResults = effectService.createEffect(db, [alphaQuery], [], () => {
    console.log('q:alpha has', resultContentService.getBucketMemberSlotCount(alphaQuery), 'result(s)');
});

resultContentService.writeBucketMemberSlots(alphaQuery, [first, second]);
db.flush();          // -> "q:alpha has 2 result(s)"

effectService.disposeEffect(onResults);
alphaQuery.owner.unholdSlot(alphaQuery);
```

A bucket collection without an index is **manual**: what a bucket holds is yours
to write. Use it when membership is a fact about a response rather than about
the entity: a search result, a page of server ids, a selection. No column can
express "the server did not return these three", so the code that received the
response is the only place that can say which slots belong. When membership
follows from a column, use the index from step 6 instead.

`writeBucketMemberSlots(bucket, slots)` states the whole list; there are also position
writes and delta writes. See
[Writing a bucket's slots](/docs/core/indexes#writing-a-buckets-slots).

## 9. The same, from the base layer

`createOIMEntityService` and `createOIMBucketService` are convenience wrappers. The base layer is a
content service — the strategy for what a slot holds — and a collection service over it:

```typescript
import {
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotStoreServiceMapDriven,
    createOIMSlotCollectionService,
    createOIMSlotContentEntityService,
    type TOIMBucketSlotsSetStore,
    type TOIMStoreKey,
} from '@oimdb/core';

const baseCardService = createOIMSlotCollectionService({
    slotContentService: createOIMSlotContentEntityService<Card>(db, {
        keyOf: (card) => card.id,
        slotStoreService: new OIMSlotStoreServiceMapDriven<TOIMEntitySlot<Card, TOIMStoreKey>>(),
    }),
});
const baseCards = baseCardService.createStoreSlot(db);

const unorderedService = createOIMBucketService<
    TOIMEntitySlot<Card>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<Card>>,
    OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>() });
const unordered = unorderedService.createStoreSlot(db);

const alpha = baseCardService.slotContentService.upsertEntity(baseCards, { id: 'c1', deck: 'd1', title: 'alpha', rank: 1 });
const beta = baseCardService.slotContentService.upsertEntity(baseCards, { id: 'c2', deck: 'd1', title: 'beta', rank: 2 });

const all = unorderedService.holdSlotByKey(unordered, 'all');
unorderedService.slotContentService.writeBucketMemberSlots(all, [beta, alpha]);
db.flush();

console.log(unorderedService.slotContentService.getBucketMemberSlotCount(all));   // 2
all.owner.unholdSlot(all);
```

The entity content service requires `keyOf` (absent only for a single entity); `slotStoreService`
defaults to a Map store, and the optional ones (`entityWriter`, `slotEmptiness`,
`slotReleasePolicy`, `columnSlotStoreService` or `columnNames`) fall back to the db's and then to
the shared defaults in `OIMDefaults`. The bucket content service is the strategy: an
`OIMSlotContentBucketServiceArrayDriven` keeps the order you wrote and has the positional
writes; an `OIMSlotContentBucketServiceSetDriven` has no positions to write. See
[Architecture](/docs/core/architecture#where-a-strategy-is-picked-at-construction)
for every strategy picked at construction.

## What to know before you go further

- A read mints, and the collector takes the mint back. `cardService.getSlotByKey(cards, pk)`
  always returns a slot. For a key that has none it mints one and hands it to the
  unused-slot collector, which gives it back at the next `flush()`. To keep a key
  whose value has not arrived yet, use `cardService.holdSlotByKey(cards, pk)`. See
  [The four doors](/docs/core/model#the-four-doors).
- A slot with content stays until you clear it. With no `slotReleasePolicy`,
  a collection is built with `OIMSlotReleasePolicyAtEmpty.INSTANCE`: an empty slot goes
  once nothing holds it, and a slot with content is kept. Policies that drop
  content nobody is looking at are opt-in. See
  [Releasing an identity](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).
- A write anywhere inside a flush throws: in an effect body, in
  `onBeforeFlush`, and in every after-each-frame handler. To write in response
  to a change, write after `flush()` has returned. A
  `OIMChannelService.INSTANCE.subscribeAfterEachFrame(channelSlot, fn)` handler still runs inside the flush.
  See [The rules](/docs/core/channel#the-rules).
- `cardContentService.deleteEntity(slot)` removes the value and keeps the identity.
  Existing subscribers stay subscribed, and a manual bucket that holds the slot
  still holds it. Taking it out is your job.
- The stored object is the one you passed in. The default insert strategy
  (`oimInsertEntityWithoutCopy`) keeps it, and the in-place writer patches that same
  object afterwards. Pass `entityInsertStrategy: oimInsertEntityWithCopy` if you must
  keep your object untouched.

## Where to next

<DocCards>
<DocCard to="/docs/core/model" title="The model">Slots, the four doors, the frame and the forks.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">The two writers in full.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">Positions.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">The index and its ordering.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">Derived values.</DocCard>
<DocCard to="/docs/packages/react" title="React">Hooks over the same slots.</DocCard>
</DocCards>
