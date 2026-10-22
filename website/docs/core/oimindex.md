---
sidebar_position: 7.5
title: Indexes
description: How an index files the entities of a source collection into buckets by keyOf, what it costs, and how to read a sorted view over it.
---

# Indexes

```ts setup
import {
    OIMDB,
    OIMEffectService,
    OIMIndexKeysServiceReclaiming,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotReleasePolicyAtUnhold,
    createOIMComputedService,
    createOIMComputedServiceSorted,
    createOIMEntityService,
    createOIMIndexService,
    createOIMIndexServiceByCompositeKey,
    createOIMIndexServiceSortedArrayDriven,
    oimSameSlotSequence,
    type TOIMEntitySlot,
} from '@oimdb/core';

type Card = { id: string; deck: string; rank: number };

declare function render(value?: unknown): void;

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const cardContentService = cardService.slotContentService;

const byRank = (leftBucketMemberSlot: TOIMEntitySlot<Card>, rightBucketMemberSlot: TOIMEntitySlot<Card>): number =>
    (leftBucketMemberSlot.entity?.rank ?? 0) - (rightBucketMemberSlot.entity?.rank ?? 0);
```

An **index** is a bucket collection whose buckets are filled from an entity store slot by `keyOf`: every
write to the source decides which bucket the entity belongs to. Its buckets are the same
[buckets](/docs/core/indexes) a caller fills by hand; why it is shaped this way is on
[Why an index looks like this](/docs/core/index-shape).

<InShort>

- An index is a bucket collection filled from an entity store slot by `keyOf`.
- Take it when which bucket an entity belongs to is a function of the entity, so every write can decide it.
- When the members come from a response, take a manual bucket collection.
- A sorted view over an index gives the order.

</InShort>

## How an index files entities

Use an index when the bucket an entity belongs to is a function of the entity
(`card.deck`, a status, an owner id), so every write can decide it. When the members
come from a response instead, take a [manual bucket collection](/docs/core/indexes#a-buckets-slots-are-the-callers).
Why an index is a pushed bucket plus a pulled order is on its own page:
[Why an index looks like this](/docs/core/index-shape).

<IndexDiagram />

The index service is built once per entity collection type; `createIndexStoreSlot(entityStoreSlot)`
builds one index over one entity store slot, and returns the index's own store slot of buckets.

```ts setup
const deckIndexService = createOIMIndexService(db, {
    entityService: cardService,              // the entity collection it reads
    keyOf: (card: Card) => card.deck,        // which key an entity belongs to
});
const deckIndex = deckIndexService.createIndexStoreSlot(cards);
const deckBucketReads = deckIndexService.slotContentService;
```

```ts
const red = deckIndexService.holdSlotByKey(deckIndex, 'red'); // the bucket; minted on first hold
cardContentService.upsertEntity(cards, { id: 'c1', deck: 'red', rank: 1 });
db.flush();

Array.from(deckBucketReads.getBucketMemberSlots(red)); // [c1]
```

`createOIMIndexService(db, options)` builds the index over a Map store of buckets. Its options:

| Option | Default | What it decides |
|---|---|---|
| `entityService` | required | the source collection service; only its `getSlots` is used, to fill a new bucket |
| `columns` / `keyOf` | one of them required | [where the key comes from](#where-the-key-comes-from-columns-keyof-or-both) |
| `slotContentService` | `new OIMSlotContentBucketServiceArrayDriven()`, with no recorder | how a bucket holds its slots: pass `new OIMSlotContentBucketServiceSetDriven()` for no order, or one built with `bucketCommands` for a render script |
| `bucketSlotStoreService` | a Map store; required for an array key | where buckets are filed |
| `slotReleasePolicy` | the db's, then `OIMSlotReleasePolicyAtEmpty.INSTANCE` | [how long a bucket lives](#what-a-write-costs-and-how-long-a-bucket-lives) |
| `columnSlotStoreService` / `columnNames` | `OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue()` | where bucket column slots live |

The index-keys strategy is the db's (`new OIMDB({ indexKeysService })`, see
[below](#the-content-change-hook-and-indexkeys)). A key of several columns takes
[the composite-key door](#a-key-of-several-columns), which sets a tree-driven store.

```ts
const unorderedDeckIndexService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
    slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>(),
});
const unorderedDeckIndex = unorderedDeckIndexService.createIndexStoreSlot(cards);
```

The default buckets keep arrival order. Only the array-based content services answer by position:
`getBucketMemberSlotAt(bucketSlot, index)` reads the array at that index, O(1), and
`getBucketMemberSlotPosition(bucketSlot, entitySlot)` walks the array, O(n), returning
`-1` for a slot that is not a member. A set has no positions, so a set-driven index has neither. Take the
set-driven one when you read neither arrival order nor positions: its membership test and removal are a
hash lookup.

`OIMIndexService` is a collection service of buckets, so it has every read door of one. Its
`slotContentService` is the bucket content service narrowed by type to its reads — the index is the only
writer of its buckets. A door that names a key takes the index's store slot first; a door on a bucket takes
only the bucket slot:

| Doors | What for |
|---|---|
| `getSlotByKey`, `holdSlotByKey`, `findSlotByKey`, `hasSlotContentByKey`, `getSlotsByKeys`, `holdSlotsByKeys`, `slot.owner.unholdSlot` | the bucket of a key |
| `slotContentService.getBucketMemberSlots`, `getBucketMemberSlotCount`, `hasBucketMemberSlot`; `getEntitiesByKey(indexStoreSlot, key)` | what a bucket holds |
| `slotContentService.getBucketMemberSlotAt`, `getBucketMemberSlotPosition` | positional reads, on an array-based content service only |
| `getSlots`, `getSlotCount` | which buckets are filed |
| `getAnyBucketColumnByKey`, `holdAnyBucketColumnByKey` | [the bucket's any-column slot](#the-buckets-any-column-slot) |
| `getBucketColumnByKey`, `holdBucketColumnByKey`, `unholdColumn` | [bucket column slots](#ordering); `unholdColumn` also gives back an any-column slot |
| `disposeIndexStoreSlot` | [taking one index off its source](#disposing-an-index) |

The channel slot of an index store slot is its source store slot's.

### Where the key comes from: `columns`, `keyOf`, or both

The same pair as the sorter's `sortColumns` / `comparator`:

```ts
const byColumn = createOIMIndexService(db, { entityService: cardService, columns: ['deck'] });
const byFunction = createOIMIndexService(db, { entityService: cardService, keyOf: (card: Card) => card.deck });
const byFunctionOfColumns = createOIMIndexService(db, {
    entityService: cardService,
    columns: ['deck'],
    keyOf: (card: Card) => card.deck.toLowerCase(),
});
```

- **`columns` alone** with ONE column: the key is its value, typed by `TOIMIndexKey`
  from that column, which must hold a store key.
  Several columns make a composite key, the array of their values in that order, and
  take the composite-key door — see [A key of several columns](#a-key-of-several-columns).
- **`keyOf` alone** is any function, and it runs again on every write to the source:
  a function does not say which columns it reads.
- **Both**: the columns are the ones `keyOf` reads.

With `columns`, a patch or put whose changed columns include none of them keeps the
entity's key and calls nothing. A write of the whole value — a fill, a clear,
`markEntityChanged(slot)` with no names — always reads the key again.

A slot with no entity is filed under no bucket, and neither is an entity whose
`keyOf` returns `undefined`. `createOIMIndexService` constrains the key to `TOIMStoreKey` unless it is handed
a `bucketSlotStoreService`, `createOIMIndexServiceByCompositeKey` to an array of `TOIMStoreKey`, and a key
type handed to them by hand must be assignable to the one `TOIMIndexKey` computes from `columns`.

### A key of several columns

An array key has its own door: `createOIMIndexServiceByCompositeKey`. Name two or more columns and the key
is the array of their values, in that order:

```ts
type PlayingCard = { id: string; deck: string; suit: string };

const playingCardService = createOIMEntityService<PlayingCard>(db, { keyOf: (card) => card.id });
const playingCards = playingCardService.createStoreSlot(db);
const byDeckAndSuitService = createOIMIndexServiceByCompositeKey(db, {
    entityService: playingCardService,
    columns: ['deck', 'suit'],
});
const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(playingCards);
byDeckAndSuitService.getEntitiesByKey(byDeckAndSuit, ['red', 'hearts']);
```

- **The key type comes from the columns** (`TOIMIndexKey<TEntity, TColumns>`): one
  column is that column's value without `undefined`, several are a tuple of their
  values, so `['deck', 'suit']` above is keyed by `readonly [string, string]` and a
  one-column index refuses an array. Columns must be written inline or `as const`: a
  `string[]` variable carries no length, so its key could be either a value or an array,
  and both doors refuse it.
- The composite-key door builds the index's bucket store on an
  `OIMSlotStoreServiceTreeDriven` over `OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()`. To tell whether an
  entity's key moved, the index asks its bucket store `isSameKey`.
- A `keyOf` returning an array of `TOIMStoreKey` takes `createOIMIndexService` with a tree store passed as
  `bucketSlotStoreService`.
- Each write that reads the key builds one array; a fresh array with the same parts is
  the same key, so it moves nothing and wakes nothing.
- `getSlotsByKeys` / `holdSlotsByKeys` fill every new bucket either way, but only a
  scalar key gets the ONE pass over the source: array keys are filled one pass per
  key, the cost of calling `getSlotByKey` for each.

**No bucket exists for a key until it is minted.** A bucket minted through any door
(`getSlotByKey`, `holdSlotByKey`, `getSlotsByKeys`, `holdSlotsByKeys`, `getEntitiesByKey`) is filled with the
source entities written before it, without a flush, so minting inside an effect body does not throw.
`getSlotsByKeys` / `holdSlotsByKeys` fill all new buckets in ONE pass over the source
— take them when you mint many keys at once, such as every column of a board.

The usual way to consume one is an effect on the bucket:

```ts
const red = deckIndexService.holdSlotByKey(deckIndex, 'red');

effectService.createEffectImmediate(db, [red], [], () => render(Array.from(deckBucketReads.getBucketMemberSlots(red))));
```

The bucket wakes on **membership only** — an entity joining or leaving it. A write to an
entity that stays in the bucket does not wake it; each entity is subscribed to through its
own slot.

### What a write costs, and how long a bucket lives

- **A key with no bucket is not maintained at all.** No slots, no service calls — an
  entity arriving under such a key costs one key read, one comparison and, when its
  key changed, one write of its index-key cell. What decides it is whether the bucket
  exists, not whether anyone holds it: while a bucket stands it is maintained, held or not,
  and a key whose bucket was released goes back to costing nothing.
- **Entities are filed on write**, using the index's key, through the source store slot's
  content-change hook.
- **A bucket's lifetime is the `slotReleasePolicy`, not the index's.** Name nothing (here or on the db)
  and you get `OIMSlotReleasePolicyAtEmpty.INSTANCE`: an unheld bucket stays, and goes on being
  maintained, while it has members, and goes once it is empty. Pass
  `OIMSlotReleasePolicyNever.INSTANCE` and a bucket stands for good;
  `new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs })` and it cools on the queue;
  `OIMSlotReleasePolicyAtUnhold.INSTANCE` and it ends at the last give-back, and the next
  hold builds a fresh one with one scan of the source. The policies themselves:
  [Releasing an identity on a clock](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).
- **Order is not the bucket's business.** A sorted list is
  `createOIMComputedServiceSorted` over the index service ([Ordering](#ordering)).
  Compose a second computed over the bucket for filtering or any other order.

```ts
const deckIndexOnlyWhileHeldService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
    slotReleasePolicy: OIMSlotReleasePolicyAtUnhold.INSTANCE,
});
const deckIndexOnlyWhileHeld = deckIndexOnlyWhileHeldService.createIndexStoreSlot(cards);
```

Use `OIMSlotReleasePolicyAtUnhold` when keys are many and each is looked at briefly (a details panel
per user); keep the default when a few keys are read over and over.

An order of your own is a derivation over the bucket:

```ts
const rankedInDeckService = createOIMComputedService<string, readonly TOIMEntitySlot<Card>[]>({
    createSources: (key: string) => ({
        sourceSlots: [deckIndexService.getSlotByKey(deckIndex, key)],
    }),
    derive: (computedSlot) => Array.from(
        deckBucketReads.getBucketMemberSlots(deckIndexService.getSlotByKey(deckIndex, computedSlot.key)),
    ).sort(byRank),
    sameValueGuard: oimSameSlotSequence,
    initialValue: [],
});
const rankedInDeck = rankedInDeckService.createComputedStoreSlot(db);
```

The bucket is named in `sourceSlots`, so the computed holds it for
as long as the composed order is filed.

### Disposing an index

`createIndexStoreSlot(entityStoreSlot)` is the whole wiring of one index: it registers a
content-change listener on that store slot (`OIMContentChangeListenerService.INSTANCE`), and the entity
collection knows nothing about indexes. `disposeIndexStoreSlot(indexStoreSlot)` unsubscribes that index
from its source, empties its buckets and gives back every entity slot it held. The minting doors on that
index store slot (`getSlotByKey`, `holdSlotByKey`, `getSlotsByKeys`, `holdSlotsByKeys`, `getEntitiesByKey`,
the bucket column doors) throw after it, because the index no longer hears its source; the give-backs
(`slot.owner.unholdSlot`, `unholdColumn`) still work, so a consumer tearing down after the index
does not have to know the order. The index service and its other store slots are untouched.

```ts
const temporaryIndex = deckIndexService.createIndexStoreSlot(cards);
deckIndexService.disposeIndexStoreSlot(temporaryIndex);
```

### The bucket's any-column slot

For a reader that needs the whole list every time a member's content changes, the
index hands out a bucket's any-column slot: `getAnyBucketColumnByKey(indexStoreSlot, key)` and
`holdAnyBucketColumnByKey(indexStoreSlot, key)`, given back with `unholdColumn`. It is a
`TOIMColumnSlot` on the bucket slot, and it wakes when any column of any member of
that bucket changes. A member joining or leaving is not its business: that wakes the
bucket slot (`getSlotByKey` / `holdSlotByKey`). A reader that wants both subscribes to
both.

```ts
const redBucket = deckIndexService.holdSlotByKey(deckIndex, 'red');
const redAnyColumn = deckIndexService.holdAnyBucketColumnByKey(deckIndex, 'red');
const redEffect = effectService.createEffect(db, [redBucket, redAnyColumn], [], () => {
    render(deckIndexService.getEntitiesByKey(deckIndex, 'red'));
});
effectService.disposeEffect(redEffect);
deckIndexService.unholdColumn(redAnyColumn);
redBucket.owner.unholdSlot(redBucket);
```

**Do not use it to render a list.** One edit of one entity wakes the whole list, so a
view bound to it re-renders every item for a one-field change. Subscribe the list to
the bucket and each entity to its own slot. The any-column slot is for an export, an
aggregate over the entities, or a log.

It costs nothing until asked for: an entity write is checked against it only after the
first `getAnyBucketColumnByKey` / `holdAnyBucketColumnByKey`. A
`getAnyBucketColumnByKey` nobody kept is gone at the next `flush()`.

### The content-change hook and `indexKeys`

`OIMContentChangeListenerService.INSTANCE.addContentChangeListener(storeSlot, listener, readColumnNames)` and
`removeContentChangeListener(storeSlot, listener)` file and unfile a listener on one store slot, by the
listener object. An `IOIMContentChangeListener` has `onContentChanged(slot, patch, changedColumns)` and
`onContentChangedMany(slotChannelQueue, patchChannelQueue, changedColumnsChannelQueue)`: three
parallel queues read with `getEntryCount()` / `getEntryAt(i)` and valid only during the call. A content
service holds a store slot's notifications until its own outermost content subframe closes, so the
many-entity doors (`upsertEntities`, `insertEntities`/`fillEntities`, `deleteEntities`, `clearAllEntities`)
call `onContentChangedMany` ONCE when they return; the index groups entities by key and moves
each group with one bucket write. Which columns a listener reads is declared when it is
added: `readColumnNames`, and `undefined` means every column; removing the listener gives them back. The
index declares its key `columns` (every column for an opaque `keyOf`), and adds the columns its
bucket column slots watch (`addReadColumn`), and every column once a bucket any-column slot was asked for
(`addReadAnyColumn`). Column slots on entities are not in it — a write finds those on the entity. A write to
a column no listener reads is one `Map.has` per name: no listener call, no buffer, no
array (the content service reuses one array of changed names). A listener of your own that needs
every column write is added with `readColumnNames` `undefined`. The filter is the union of every
listener on that store slot, not each listener's own list: once a write touches a column any of
them reads, all of them are called, so a listener with a narrower list still checks
`changedColumns` itself, as the index does against its key columns. Implement the listener yourself only for a
derivation that has to be pushed per write the way an index is; anything that can be
pulled belongs in a computed.

Each indexable slot carries, per index, the key it is filed under now, so a moved entity
leaves its old bucket in O(1), also under the in-place writer. Only the index writes it, through the
`IOIMIndexKeysService` (`get(slot, position)`, `set(slot, position, indexKey)`) at the position
`createIndexStoreSlot` allocated (`indexStoreSlot.indexKeysPosition`); positions are allocated per source store
slot. The strategy is chosen once per db, `new OIMDB({ indexKeysService })` (default
`OIMDefaults.INDEX_KEYS_SERVICE.getValue()`):

| strategy | on `disposeIndexStoreSlot` | cost |
|---|---|---|
| `OIMIndexKeysServiceAppending` (default) | the position is never reused; its stale entry stays on each slot | a slot's `indexKeys` grows to the highest position any index wrote on it (K indexes made and disposed → an array of K on a slot the last one filed), and a stale entry keeps its key reachable. Writes pay nothing for a disposed index: only live listeners are kept |
| `OIMIndexKeysServiceReclaiming` | wipes that position on every slot of the source and reuses it | O(N) per dispose |

```ts
const dbWithShortLivedIndexes = new OIMDB({ indexKeysService: new OIMIndexKeysServiceReclaiming() });
```

Switch to `OIMIndexKeysServiceReclaiming` only if you create indexes dynamically and often. That is
expensive, so avoid it.

## Ordering

**A bucket never sorts, except the bucket of a `createOIMIndexServiceSortedArrayDriven` index.** Its order is
what the caller or the arrivals put in: `addBucketMemberSlots` appends, `insertBucketMemberSlotAt` inserts, a
move moves, `writeBucketMemberSlots` takes the sequence given. A sorted list is a computed over an index —
`createOIMComputedServiceSorted({ indexService, sortColumns?, comparator? })`, then
`createSortedStoreSlot(indexStoreSlot)` for each index — or the
index sorts its own buckets, see [Sorted at write](#sorted-at-write).
Take it when the order is a function of the entities' columns; take
[positions](/docs/core/indexes#positions-the-caller-decides) when the user decides it.

```ts
const cardsInDeckService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.deck,
});
const cardsInDeck = cardsInDeckService.createIndexStoreSlot(cards);
const cardsByRankService = createOIMComputedServiceSorted({
    indexService: cardsInDeckService,
    sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const cardsByRank = cardsByRankService.createSortedStoreSlot(cardsInDeck);

const red = cardsByRankService.computedCollectionService.holdSlotByKey(cardsByRank, 'red');
effectService.createEffectImmediate(db, [], [red], () => { render(red.computedValueService.getValueForSlot(red)); });
red.owner.unholdSlot(red);
```

- `indexService` is the `OIMIndexService` whose buckets the sorted list reads, and the
  index store slot handed to `createSortedStoreSlot` is the index it reads them from. The sorted service
  takes no db: its store slots run on the index store slot's channel slot.
- `sortColumns` — `TOIMSortColumn<TEntity>[]`, each `{ column, direction: 'asc' | 'desc' }`,
  `column` a `TOIMSortableColumnName<TEntity>` (string, number or bigint values) —
  **decide which writes re-sort.**
- `comparator: (left: TEntity, right: TEntity) => number` **decides the order**.
  Without it the order is `oimColumnsComparator(sortColumns)`: the columns in turn, an
  undefined or null value last in either direction. An entity slot whose entity is gone sorts last.
- Only `comparator` → any write to a member re-sorts. Neither → a member keeps the
  place it first took and an arrival is appended.
- **Both** → the two split the job: `comparator` orders, and `sortColumns` is the list
  of columns whose change wakes the sort. **List every column the comparator
  reads.** A change to a column it reads but `sortColumns` omits does not re-sort — the
  list keeps its old order until something listed changes. Reach for this when the
  order needs a rule `oimColumnsComparator` cannot express (a locale compare, a
  computed key, a tie-break) and you still want the sort to wake only for the
  columns that rule reads, instead of for every write to a member as with
  `comparator` alone:

  ```ts
  type TitledCard = { id: string; deck: string; title: string; rank: number; note: string };
  const titledCardService = createOIMEntityService<TitledCard>(db, { keyOf: card => card.id });
  const titledCards = titledCardService.createStoreSlot(db);
  const titledCardsInDeckService = createOIMIndexService(db, {
      entityService: titledCardService,
      keyOf: (card: TitledCard) => card.deck,
  });
  const titledCardsInDeck = titledCardsInDeckService.createIndexStoreSlot(titledCards);
  const byTitleInGermanService = createOIMComputedServiceSorted({
      indexService: titledCardsInDeckService,
      sortColumns: [{ column: 'title', direction: 'asc' }, { column: 'rank', direction: 'asc' }],
      comparator: (left, right) => left.title.localeCompare(right.title, 'de') || left.rank - right.rank,
  });
  const byTitleInGerman = byTitleInGermanService.createSortedStoreSlot(titledCardsInDeck);
  // a write to `title` or `rank` re-sorts; a write to any other column does not
  ```

It re-sorts only when the bucket's membership changed or a write changed one of its
columns on a member: its sources are the bucket slot of the key plus the
**bucket column slot** of each column (or the bucket's any-column slot when only a
comparator is given). Its slots are computed slots: pulled, re-derived on the read that
asks, subscribed to in the `sourceComputeds` list of `createEffect`. Read the value through
`slot.computedValueService.getValueForSlot(slot)`; `slot.value` is not refreshed by reading it. A
re-sort that yields the same sequence keeps the previous array, so a consumer
memoising on identity needs no comparison of its own. The sorted array names each
member slot once, even over a bucket that names one twice. Why this is a pull and
membership is a push: [Why an index looks like this](/docs/core/index-shape).

**Bucket column slots.** An index hands out one column slot per bucket and column —
`getBucketColumnByKey(indexStoreSlot, key, columnName)`, `holdBucketColumnByKey(indexStoreSlot, key, columnName)`,
`unholdColumn(columnSlot)`. It is a `TOIMColumnSlot` whose `carrierSlot` is the
bucket slot, written when a write changes that column on any member of the bucket.
Subscribe to one when you need "some member's `rank` moved" without "some member's
`title` moved":

```ts
const rankInRed = deckIndexService.holdBucketColumnByKey(deckIndex, 'red', 'rank');
const onRankInRed = effectService.createEffect(db, [rankInRed], [], () => { render(); });
effectService.disposeEffect(onRankInRed);
deckIndexService.unholdColumn(rankInRed);
```

An index marks bucket column slots only once somebody has asked for one, so an
index nobody sorts pays nothing for them.

**A comparator that throws is thrown at the reader that asked** — out of the sorted
computed's `getValueForSlot`. The derive is not stamped as run, so the next read runs the
comparator again; the bucket under it is untouched.

### Sorted at write

The sorted computed above sorts at read, over any index. The other arm keeps the index's
own buckets in order, so a read needs no computed. You pick one at construction:
`createOIMIndexServiceSortedArrayDriven(db, { entityService, columns? | keyOf?, sortColumns, bucketSlotStoreService?, slotReleasePolicy?, columnSlotStoreService? | columnNames? })`
returns an `OIMIndexServiceSortedArrayDriven`. `sortColumns` is the same `TOIMSortColumn<TEntity>[]`
that `createOIMComputedServiceSorted` takes, and it is required.

```ts
const cardsByDeckService = createOIMIndexServiceSortedArrayDriven(db, {
    entityService: cardService,
    columns: ['deck'],
    sortColumns: [{ column: 'rank', direction: 'asc' }, { column: 'id', direction: 'desc' }],
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);
const spades = cardsByDeckService.holdSlotByKey(cardsByDeck, 'spades');
Array.from(cardsByDeckService.slotContentService.getBucketMemberSlots(spades));
cardsByDeckService.slotContentService.getBucketMemberSlotAt(spades, 0);
```

- **Reads come back in order.** `getBucketMemberSlots`, `getBucketMemberSlotAt` and
  `getBucketMemberSlotPosition` answer in `sortColumns` order.
- **A lazy insertion buffer.** A write appends the arrival to an unsorted tail of the
  bucket's array (`TOIMBucketSlotsSortedArrayStore` is the array store plus a count of the
  sorted prefix). The first read settles the tail: binary insertion for a short tail, one
  sort for a long one. A bucket nobody reads is not sorted.
- **A member is re-filed when one of its sort columns changes, and only then.** A write to
  a column that is neither the key nor a sort column neither reorders the bucket nor wakes it.
- **There are no positional writes** on this bucket. The order belongs to the comparator,
  so `insertBucketMemberSlotAt` and the other position writes stay on `OIMSlotContentBucketServiceArrayDriven`.
- **Bucket commands are always `OIMBucketCommandsNone`**: the strategy records no render script.
- **Parts.** `OIMSlotContentBucketServiceSortedArrayDriven` (options
  `TOIMSlotContentBucketServiceSortedArrayDrivenOptions`: `compareBucketMemberSlots`; it adds
  `repositionBucketMemberSlot(bucketSlot, bucketMemberSlot)`) under `OIMIndexServiceSortedArrayDriven`.

Which arm to take: sort-at-write suits point updates, where a rank change re-files one
member. Sort-at-read suits bulk loads. Both ship; neither is the default.

## Where to next

<DocCards>
<DocCard to="/docs/core/indexes" title="Buckets">A bucket's slots written by hand, positions, and the commands a renderer replays.</DocCard>
<DocCard to="/docs/core/index-shape" title="Why an index looks like this">Push for membership, pull for order.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">The many-entity doors an index hears once.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">How computeds are pulled and effects are woken.</DocCard>
</DocCards>
