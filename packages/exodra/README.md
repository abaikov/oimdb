# @oimdb/exodra

Adapts `@oimdb/core` reads into [Exodra](https://exodra.org) bindables: `TExoBindable`,
`TExoBindableList`. There is no React and there are no hooks. Every OIMDB read becomes
something you can drop straight into an Exodra view.

```bash
npm install @oimdb/exodra @oimdb/core
```

It pulls in only the **type-only** `@exodra/reactivity-types` package, never the reactivity
runtime. Your app already provides `@exodra/reactivity` for `bindable`, `derive` and `h`.

## One door from the engine

A subscription in this core is **one call**,
`OIMEffectService.INSTANCE.createEffect(db, sourceSlots, sourceComputeds, body)`. The effect
service is stateless; the `db` you pass is the channel map, and its `defaultChannelSlot` is the
channel the effect runs on. The value is read off the slots afterwards instead of being carried
by the subscription. So there is one adapter, and one entity, one column, a bucket's slots and a
derived value all come through it. Every bridge here takes that same `db` as its first argument.
The examples on this page share this store:

```typescript setup
import {
    OIMDB,
    OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService,
    createOIMComputedServiceSorted,
    createOIMEntityService,
    createOIMIndexService,
    type TOIMBucketSlotsSetStore,
    type TOIMEntitySlot,
    type TOIMStoreKey,
} from '@oimdb/core';

type TCard = { id: string; deckId: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;

const db = new OIMDB();
const cardService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
const cards = cardService.createStoreSlot(db);
const byDeckService = createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
const byDeck = byDeckService.createStoreSlot(db);
const boardService = createOIMBucketService<TCardSlot>(db);
const boards = boardService.createStoreSlot(db);
const cardsByDeckService = createOIMIndexService(db, {
    entityService: cardService,
    columns: ['deckId'],
});
const cardsByDeck = cardsByDeckService.createIndexStoreSlot(cards);
const orderService = createOIMComputedServiceSorted({
    indexService: cardsByDeckService,
    sortColumns: [{ column: 'rank', direction: 'asc' }],
});
const order = orderService.createSortedStoreSlot(cardsByDeck);
const renderCard = (slot: TOIMEntitySlot): string => JSON.stringify(slot.entity);
```

```typescript
import { exoBinding } from '@oimdb/exodra';

const slot = cardService.holdSlotByKey(cards, 'c1');
const bucket = byDeckService.holdSlotByKey(byDeck, 'spades');

const entity = exoBinding(db, {
    sourceSlots: [slot], derive: () => slot.entity,
});

const deckCards = exoBinding(db, {
    sourceSlots: [bucket], derive: () => Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucket)),
});

const deck = orderService.computedCollectionService.holdSlotByKey(order, 'spades');
const ordered = exoBinding(db, {
    sourceComputeds: [deck], derive: () => deck.computedValueService.getValueForSlot(deck),
});
```

### Why it takes the engine's arguments and not a wrapper

The core publishes no `{ getValue, onChange }` object for an entity, a field, a bucket or a
derivation. Reading is `slot.entity`, or `computedSlot.computedValueService.getValueForSlot(computedSlot)`, and watching is
an effect. Both halves have to be *constructed*, so such a type declared here would have
exactly one producer (a constructor of ours) and exactly one consumer (a translator of
ours, one line later). It would be a rename, not a layer.

Instead, `exoBinding` handles the two things a hand-written `exoSource` pair has to
get right, and each of them fails **silently**:

| | what goes wrong without it |
|---|---|
| settles every derivation before the read | nothing in a frame walks to a computed slot, and only `computedValueService.getValueForSlot` produces its value, so a `derive` that reaches a derivation's result any other way sees whatever the last produce left there |
| one effect per bindable, none while nobody listens | a second subscriber arming a second effect doubles the cost of every write to that entity |

### Lifetime is the caller's, and it is not optional

`exoBinding` **holds nothing**. A bindable is lazy: its effect exists only while somebody
is subscribed, so the bindable outlives its own subscriptions, and a hold scoped to one of them
buys nothing. The give-back, `slot.owner.unholdSlot(slot)`, ends in `releaseSlotIfUnheld`, so
returning it at teardown leaves exactly the state the teardown would have left anyway.

So whoever **resolved** the identity holds it for as long as the bindable lives, and signals
this by handing back a `TOIMExoDisposable`:

```typescript
import { exoBinding } from '@oimdb/exodra';

const groupFor = (deckId: string) => {
    const held = orderService.computedCollectionService.holdSlotByKey(order, deckId);   // a hold is what mints one
    return Object.assign(
        exoBinding(db, {
            sourceComputeds: [held], derive: () => held.computedValueService.getValueForSlot(held),
        }),
        { dispose: () => held.owner.unholdSlot(held) },
    );
};
```

Getting this wrong exposes only a **valueless** identity: an empty bucket, a key
resolved before its entity arrived, or an entity since removed. A slot holding a value is kept by
that value.

## What still needs its own function

Four things, because they do work that no core primitive does on its own:

- **`exoFollowKey(key, makeBindable)`**: repoints a live subscription as a *selection*
  moves. `makeBindable` must hand back a `TOIMExoDisposable`, because repointing has to
  give the previous key's handle back. Otherwise every key transition strands one.
- **`exoCombine(sources, fn)`**: fans in across *any* `TOIMExoReadable`, including local
  UI state or two different channels. A computed also combines, but only inside one
  channel's graph, and unlike this function it is glitch-free.
- **`exoRows(keys, render)`**: identity-stable children from a sequence of primary keys.
  `render` hands back a `TOIMExoRenderedRow` (`{ schema, dispose }`) for the same reason:
  a schema is a tree the caller builds, and on every real path it holds core references
  that nothing else counts. A row that holds nothing writes `dispose: () => {}`.
- **the list bridges**, below.

## Lists are a fork, and both arms ship

**Who decides the order** is the whole difference. The engine's order is a
derivation: `createOIMComputedServiceSorted` over an index, or any computed of
entity slots. The caller's order is a bucket under `OIMBucketCommands`, which keeps
the positions it is given. Which arm you get depends on which of the two you hand
the bridge.

```typescript
import { exoDerivedList, exoPositionalList } from '@oimdb/exodra';

// The engine orders it: the script is DERIVED, by oimOrderedListCommandsOfTransition.
const deck = orderService.computedCollectionService.holdSlotByKey(order, 'spades');
const list = exoDerivedList(db, deck, slot => renderCard(slot));

// You order it: the script is the one OIMBucketCommands already RECORDED.
const bucket = boardService.holdSlotByKey(boards, 'board');
const board = exoPositionalList(db, boardService.slotContentService, bucket, renderCard);
```

`exoDerivedList(db, computedSlot, render, maxCommandsPerSlot?)` takes a `TOIMComputedSlot` of
`readonly TOIMEntitySlot[]` (one held from `createOIMComputedServiceSorted`,
`createOIMComputedServiceBucketMemo`, or a computed service of your own). It pays one
`oimOrderedListCommandsOfTransition` per frame that moved the list: one pass over both lists,
one longest-increasing-subsequence pass, and `common − LIS` moves, which is the optimum.

`exoPositionalList(db, slotContentBucketService, bucketSlot, render)` pays nothing at all. It
takes the bucket collection's **content service** (`bucketService.slotContentService`), the
object that holds the bucket's slots and its reads. `OIMBucketCommands` records
`insertBucketMemberSlotAt`, `moveBucketMemberSlotToPosition`, `removeBucketMemberSlotRange` and
the rest on the bucket slot (`bucket.commands`, `bucket.isWholeListRecorded`) as this frame's
script, and the bridge forwards it from inside the frame. The script is cleared once the flush
that delivered it has ended. The content service must be built with an `OIMBucketCommands` as
its `bucketCommands`, which is what `createOIMBucketService(db)` gives you when you pass no
`slotContentService`: its default is the array-driven content service with commands.

### One baseline, in one place

Both return a `TOIMExoList<TSchema>` (a `TExoBindableList` plus a `dispose`), and both are
**attached from construction**, not from their first subscriber. That is what lets
`snapshot()` promise the list that every later op is measured against. It is the same variable
the diff (or the applier) advances, moved in one place, so a consumer that starts from the
snapshot and applies every op can never be off by one position.

**One baseline, and only one.** If you read the bucket's slots directly *as well as* the command
stream, you get two baselines over one bucket that agree only at frame boundaries. An entity slot
that is written but not yet flushed is already in `snapshot()` and then arrives a second time as
an `insert`.

Each entity slot's schema is memoised in a `WeakMap` inside the bridge, so a `reset` hands back the
same objects as the previous snapshot, and an identity-reconciling renderer moves rows
instead of remaking them. *The memo is per bridge and is not shared: two lists showing one
entity slot render it twice, and nothing measures the difference.*

## Reference

The full API is in **`llms.txt`**, which ships inside this package: read it beside
this README in the installed package, or
[on GitHub](https://github.com/abaikov/oimdb/blob/master/llms.txt).
