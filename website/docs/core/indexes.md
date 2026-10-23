---
sidebar_position: 7
title: Buckets
description: How to build a bucket collection whose slots the caller states, write and read its slots, choose how a bucket holds them, and decide their positions.
---

# Buckets

```ts setup
import {
    OIMBucketArrayMembershipUnique,
    OIMBucketCommands,
    OIMDB,
    OIMEffectService,
    OIMSlotContentBucketServiceArrayDriven,
    OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService,
    createOIMEntityService,
    createOIMSingleBucketService,
    oimOrderedListCommandsOfTransition,
    type TOIMBucketSlotsArrayUniqueStore,
    type TOIMBucketSlotsSetStore,
    type TOIMEntitySlot,
    type TOIMOrderedListCommand,
    type TOIMStoreKey,
} from '@oimdb/core';

type Card = { id: string; deck: string; rank: number };

declare function render(value?: unknown): void;
declare function rebuildFrom(slots: Iterable<TOIMEntitySlot<Card>>): void;
declare function applyToTheRenderedList(commands: readonly TOIMOrderedListCommand[]): void;

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);

const orderedDeckService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const orderedDecks = orderedDeckService.createStoreSlot(db);
```

A **bucket** is a slot whose content is other slots. A **bucket collection** files buckets by key, in the
store of each bucket store slot. Together they answer "which entities belong to this thing".

<InShort>

- A bucket is a slot whose content is other slots, and a bucket collection files buckets by key in a bucket store slot.
- A bucket's slots are the caller's: you state them.
- A bucket holds its slots with a strategy you choose: the bucket content service.
- Positions are decided by the caller.

</InShort>

## Which one you need

| Your situation | Take | Section |
|---|---|---|
| The members come from outside: a server page, a search result, a selection, a visible window | `createOIMBucketService(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven() })` | [A bucket's slots are the caller's](#a-buckets-slots-are-the-callers) |
| Membership is a function of the entity (`card.deck`) | an index, `createOIMIndexService` | [Indexes](/docs/core/oimindex) |
| A list sorted by columns | `createOIMComputedServiceSorted` over an index service | [Ordering](/docs/core/oimindex#ordering) |
| A list whose order the user decides (drag, reorder) | `createOIMBucketService(db)` — array-driven by default | [Positions the caller decides](#positions-the-caller-decides) |
| ...and a renderer that patches instead of rebuilding | the same: its default content service records `OIMBucketCommands` | [The commands, on the bucket slot](#the-commands-on-the-bucket-slot) |
| One list under no key | `createOIMSingleBucketService(db)` | [A single bucket](#a-single-bucket) |
| A diff between two lists you hold yourself | `oimOrderedListCommandsOfTransition` | [Rendering an ordered bucket](#rendering-an-ordered-bucket) |

## A bucket's slots are the caller's

A bucket collection is manual. Which slots a bucket holds is a fact about the
response a caller is composing: a search result, a page of server ids, a visible
window, a selection. No column can express absence. There is no value an entity
can carry that means "and these three entities that the server did not return are
not here". So only the code that composed the response can state which slots the
bucket holds, and the engine does not guess.

The other strategy ships too: [an index](/docs/core/oimindex), for when
belonging really is a function of the entity. Which one you get depends on which
factory you call.

## Building one

```ts setup
const byDeckService = createOIMBucketService<
    TOIMEntitySlot<Card>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<Card>>,
    OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<Card>>() });
const byDeck = byDeckService.createStoreSlot(db);
const deckContentService = byDeckService.slotContentService;
```

A bucket holds bucket member slots of any slot type — entity slots, bucket slots, computeds — and the
bucket's type parameter is the type of its bucket member slots, `TBucketMemberSlot extends TOIMSlot`
(default `TOIMEntitySlot`).

A bucket collection is two stateless objects, like an entity collection:

1. **How a bucket holds its slots, and in what order** — the bucket content service, the strategy:
   `OIMSlotContentBucketServiceArrayDriven` (the default), `OIMSlotContentBucketServiceSetDriven`, or the
   sorted one an index builds for itself. It has every write and member read of a bucket.
2. **Where its buckets live** — the collection service over it, `OIMSlotCollectionService`, with an
   ordinary slot store service (a Map store unless you pass `bucketSlotStoreService`). A store is chosen by
   how something is *addressed* and knows nothing about what it holds.

The bucket store slot carries the channel slot, so who is told is decided at `createStoreSlot(db)`.

The options of `createOIMBucketService(db, options?)`:

| Option | Default | What it decides |
|---|---|---|
| `slotContentService` | `new OIMSlotContentBucketServiceArrayDriven({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot }) })` | how a bucket holds its slots |
| `maxCommandsPerSlot` | `OIM_MAX_COMMANDS_PER_SLOT` | the recorder of the default content service — see [the commands](#the-commands-on-the-bucket-slot) |
| `bucketSlotStoreService` | a Map store; required when `TKey` is an array (an `OIMSlotStoreServiceTreeDriven`), because a Map store compares arrays by reference | where buckets are filed |
| `slotReleasePolicy` | the db's, then `OIMSlotReleasePolicyAtEmpty.INSTANCE` — an unheld bucket stays while it has members and goes once it is empty | whether and when an unheld bucket goes |
| `columnSlotStoreService` / `columnNames` | `OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue()` | where bucket column slots live |

`createStoreSlot(db)` creates one bucket store slot: one keyed store of buckets.
A door that works by key or over the whole store takes that store slot first and is the collection
service's; a door that works on one bucket you hold takes only the bucket slot and is the content
service's.

The content service is typed by the bucket member slot type it holds, so pairing it with a
bucket of another bucket member slot type is a compile error rather than a silent misread.

*One content service instance may serve several bucket collections. It holds no
per-bucket state — the bucket does.*

## The buckets are the collection's

Asks for one take the bucket store slot first:

```ts
declare const key: TOIMStoreKey;

byDeckService.holdSlotByKey(byDeck, key);       // the bucket; holdCount up by one
byDeckService.getSlotByKey(byDeck, key);        // TOIMBucketSlot, never undefined; mints on a miss and the
                                                // unused-slot collector holds it for this turn
byDeckService.findSlotByKey(byDeck, key);       // the bucket or undefined; never mints
byDeckService.hasSlotContentByKey(byDeck, key); // a bucket is filed there and holds at least one slot
byDeckService.getSlots(byDeck);
byDeckService.getSlotCount(byDeck);
```

Hold a bucket when you will keep using it across frames (a subscription, a
component); `getSlotByKey` is for a read inside this turn.

## Writing a bucket's slots

```ts
const red = byDeckService.holdSlotByKey(byDeck, 'red');
const cardSlot1 = cardService.getSlotByKey(cards, 'c1');
const cardSlot2 = cardService.getSlotByKey(cards, 'c2');
const cardSlot3 = cardService.getSlotByKey(cards, 'c3');

deckContentService.writeBucketMemberSlots(red, [cardSlot1, cardSlot2]);   // the whole list, stated
deckContentService.addBucketMemberSlots(red, [cardSlot3]);                // this one joins, nothing else moves
deckContentService.removeBucketMemberSlots(red, [cardSlot1]);             // this one leaves, nothing else moves
deckContentService.clearBucketMemberSlots(red);                           // everyone out

red.owner.unholdSlot(red);
```

`addBucketMemberSlot` / `removeBucketMemberSlot` are the one-slot forms. There are no by-key writes: a
write by key resolves the bucket first (`getSlotByKey` mints it, `findSlotByKey` does not). A change that
matters only to a bucket somebody already asked for goes through `findSlotByKey` and does nothing on
`undefined`.

### Which door: you hold the answer, or you hold the delta

`writeBucketMemberSlots` is for a caller who has the list that should be there and does not
know what changed: a search result, a page from a server, a filter re-run. One
call, and the engine works out the arrivals and the departures for you.

Its cost is proportional to what the bucket holds, not to the change. The
diff builds a set over the whole incoming list and walks the standing one,
so a batch of ten into a bucket of two hundred pays for two hundred and ten.

`addBucketMemberSlots` and `removeBucketMemberSlots` are for a caller who knows the delta — an entity
arrived over a socket, a card was dragged in, an infinite list appended a page, an
entity was deleted. The standing slots keep the holds they already have. Both wake
subscribers once, and neither wakes anybody when nothing actually joined or left.

Adding costs what you name. Removing from a set-driven bucket costs what you name;
removing k slots from an ordered bucket of n is one pass over the list, n + k.
Removing them one call at a time instead is up to k·n. The `remove` commands it records
replay in order to the same list.

`addBucketMemberSlots` removes nothing. If the authoritative list *shrank* and you call
`addBucketMemberSlots`, the slots that left stay in the bucket, held. Not knowing
what left is exactly when `writeBucketMemberSlots` is the right door; its cost is the price of not knowing.

`writeBucketMemberSlots(bucketSlot, slots)` returns `true` when anything arrived or departed. It:

- **is idempotent.** Re-sending an unchanged list evicts nothing and wakes nobody.
- **follows the strategy.** A set-driven bucket takes the set difference. An array-driven
  bucket compares the sequence: the same slots in the same order change nothing, and any
  other sequence, a reordered one included, is written whole, because the sequence is what
  that bucket holds.
- **keeps the slots both lists name.** A slot in the old and the new list keeps its
  identity and its subscribers through the write.

`clearBucketMemberSlots` on an empty bucket records nothing and wakes nobody.

A slot in a bucket is a counted reference, a hold. Joining a bucket takes a
hold on the slot; leaving gives it back. So a bucket you never emptied keeps its
slots alive, and `cardService.slotContentService.deleteEntity(slot)` does not take the slot out
of your buckets. It takes the *value* away and leaves a valueless slot in the
bucket, just like the valueless slots a bucket holds when it was resolved before its
entities arrived.

## Reading a bucket's slots

```ts
const bucket = byDeckService.holdSlotByKey(byDeck, 'red');

for (const cardSlot of deckContentService.getBucketMemberSlots(bucket)) { render(cardSlot.entity); }
deckContentService.getBucketMemberSlotCount(bucket);                  // read without the walk
deckContentService.hasBucketMemberSlot(bucket, cardService.getSlotByKey(cards, 'c1'));
```

A write followed by a read with no flush between them hands back this frame's
slots, in the order the caller wrote them. A bucket never sorts.

The slots come back live: the `Set` itself, or the list itself. See
[the rule that comes with "live"](/docs/core/reading-subscribing#live-carries-one-rule).
Iterate the slots when you render each one through its own subscription; copy them with `Array.from`
for a one-off read. The entities of an index bucket by key are `indexService.getEntitiesByKey`.

Subscribing to a bucket is an ordinary effect:

```ts
const bucket = byDeckService.holdSlotByKey(byDeck, 'red');

effectService.createEffectImmediate(db, [bucket], [], () => { render(deckContentService.getBucketMemberSlots(bucket)); });
```

The bucket slot is written when its membership or its order changes, and only then.

## How a bucket holds its slots: the content services

| Content service | Storage | What one add records | Take it when |
|---|---|---|---|
| `OIMSlotContentBucketServiceSetDriven({ bucketCommands? })` | `Set` | one entry per slot; a slot named twice is one | order does not matter, or a sorted view will impose one |
| `OIMSlotContentBucketServiceArrayDriven({ bucketCommands?, bucketArrayMembership? })` | list, plus whatever the membership adds | whatever the membership records | the caller's order is part of the answer |

The array-driven service is the default of `createOIMBucketService` (with a recorder) and of
`createOIMIndexService` (without one). The set-driven service's membership test and removal are a hash
lookup. It keeps insertion order for iteration, but has no positions: it has no
`insertBucketMemberSlotAt`, `removeBucketMemberSlotAt`, `removeBucketMemberSlotRange` or moves, and no
`getBucketMemberSlotAt` / `getBucketMemberSlotPosition` either — asking a set for a place
does not compile, so nothing walks the set to answer it.

The array-driven service is what makes positions the caller's: nothing re-decides the order on a read,
and [the position doors](#the-doors) are the whole of how the list moves. Its membership test and a
removal of one named slot scan the list.

### And what naming a slot records: the membership

| Membership | Storage it builds | What one add records | Take it when |
|---|---|---|---|
| `OIMBucketArrayMembershipNonUnique.INSTANCE` (the default) | `TOIMBucketSlotsArrayStore` | one per **mention**; a slot named twice is two | the list may repeat a slot (a playlist), or the caller never repeats one and no set is worth keeping |
| `new OIMBucketArrayMembershipUnique()` | `TOIMBucketSlotsArrayUniqueStore` (list + `Set`) | one per slot, order kept | a position must name exactly one entity; a repeated add or insert is refused |

```ts
new OIMSlotContentBucketServiceArrayDriven<
    TOIMEntitySlot<Card>, TOIMBucketSlotsArrayUniqueStore<TOIMEntitySlot<Card>>
>({
    bucketArrayMembership: new OIMBucketArrayMembershipUnique<TOIMEntitySlot<Card>>(),
});
```

The bucket's own type says which storage it carries, so the pairing is checked:

```ts signature
TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot<Card>>>          // OIMSlotContentBucketServiceSetDriven
TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<Card>>>        // OIMSlotContentBucketServiceArrayDriven
TOIMBucketSlot<TOIMBucketSlotsArrayUniqueStore<TOIMEntitySlot<Card>>>  // ...with OIMBucketArrayMembershipUnique
```

Handing a set-driven bucket to the array-driven service is a compile error. The content
service you do not import stays out of your bundle.

## Positions the caller decides

Take this when the order is the user's: a kanban column, a playlist, a priority
queue someone reorders by hand. `createOIMBucketService(db)` builds an array-driven bucket collection with
a recorder, and you decide the positions:

```ts setup
const pageService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const page = pageService.createStoreSlot(db);
const pageContentService = pageService.slotContentService;
```

### The doors

An **index** is only valid until the next write; a **slot** is stable across
frames. Reach for a position when the position is what you already have (a drag
handle reports one), and for `addBucketMemberSlots` / `removeBucketMemberSlots` / `writeBucketMemberSlots`
otherwise. The two reads are on the array-based content services (array-driven and sorted), the five writes
on the array-driven one only; a set-driven bucket has no positions. Each takes the bucket slot and no store
slot.

| Door | What it does |
|---|---|
| `getBucketMemberSlotAt(bucketSlot, index)` | who sits there, `undefined` past the end |
| `getBucketMemberSlotPosition(bucketSlot, slot)` | where it sits, `-1` when it does not |
| `insertBucketMemberSlotAt(bucketSlot, at, slot)` | puts it at `at`, clamped to the ends of the list |
| `removeBucketMemberSlotAt(bucketSlot, at)` | takes it out and hands it back, `undefined` past the end |
| `removeBucketMemberSlotRange(bucketSlot, at, count)` | takes a run out and hands it back; a run past the end stops at the end |
| `moveBucketMemberSlotToPosition(bucketSlot, from, to)` | moves one slot and hands it back; refuses `from === to` and either end out of range |
| `moveBucketMemberSlotRangeToPosition(bucketSlot, from, count, to)` | moves a run, to a landing read in the list **without** the run in it, clamped |

Every position and count must be a whole number: `NaN` or a fraction throws
before anything moves. `±Infinity` passes that check and is treated as any other
out-of-range position by the door it reaches: clamped by an insert and by a range
move's landing, refused by `removeBucketMemberSlotAt` and `moveBucketMemberSlotToPosition`.

The default membership records one place per **mention**, so
`insertBucketMemberSlotAt` of a slot the bucket already holds gives it a second position.
Build the content service with an `OIMBucketArrayMembershipUnique` when a position must name
exactly one entity.

`insertBucketMemberSlotAt` answers the index the slot landed on (`at` clamped to the ends of
the list), or `OIM_NOTHING_WAS_INSERTED` (`-1`) for a repeat on an
`OIMBucketArrayMembershipUnique`. Under the default membership the landing can differ from
`getBucketMemberSlotPosition`, which names a repeated slot's first position.

### Per strategy

**A kanban column.** One bucket per column; a card dragged between columns:

```ts
const fromColumn = pageService.holdSlotByKey(page, 'todo');
const toColumn = pageService.holdSlotByKey(page, 'done');
const card = cardService.getSlotByKey(cards, 'c1');
const cardItWasDroppedOn = cardService.getSlotByKey(cards, 'c2');

pageContentService.removeBucketMemberSlotAt(fromColumn, pageContentService.getBucketMemberSlotPosition(fromColumn, card));
pageContentService.insertBucketMemberSlotAt(
    toColumn, pageContentService.getBucketMemberSlotPosition(toColumn, cardItWasDroppedOn) + 1, card,
);
```

Dragged inside one column it is one `moveBucketMemberSlotToPosition`.

**A priority queue the user reorders.** Raising to the front is a literal
position; nudging is relative to where the entity says it is:

```ts
const bucket = pageService.holdSlotByKey(page, 'queue');
const job = cardService.getSlotByKey(cards, 'c1');

pageContentService.moveBucketMemberSlotToPosition(bucket, pageContentService.getBucketMemberSlotPosition(bucket, job), 0);
pageContentService.moveBucketMemberSlotToPosition(
    bucket, pageContentService.getBucketMemberSlotPosition(bucket, job),
    pageContentService.getBucketMemberSlotPosition(bucket, job) + 2,
);
```

**A whole list handed in at once** — a server response, a restored draft.
`writeBucketMemberSlots` replaces the lot:

```ts
declare const slotsInTheOrderTheServerSent: readonly TOIMEntitySlot<Card>[];

const bucket = pageService.holdSlotByKey(page, 'results');
pageContentService.writeBucketMemberSlots(bucket, slotsInTheOrderTheServerSent);
```

**A reorder a renderer has to animate.** Read the commands, not the list — below.

### The commands, on the bucket slot

`OIMBucketCommands` records onto the bucket slot what this frame's writes DID.
A frontend rendering a reorder needs exactly that: the reorder
commands, not "something changed", because a rebuild destroys the node identity that
an animation, a focus and a scroll anchor are attached to. Take it for a positional
list a renderer patches; leave it out for a bucket that is only iterated.

**The recorder is chosen when the content service is built**, as `bucketCommands` in
its options (`new OIMBucketCommands({ maxCommandsPerSlot })`). It records for the buckets of
every store slot that content service serves. A content service built with `new` and no
`bucketCommands` records nothing, so a bucket nobody renders positionally allocates no
command. Nothing has to be disposed.

```ts
const bucket = pageService.holdSlotByKey(page, 'results');

effectService.createEffect(db, [bucket], [], () => {
    if (bucket.isWholeListRecorded) rebuildFrom(pageContentService.getBucketMemberSlots(bucket));
    else applyToTheRenderedList(bucket.commands ?? []);
});
```

The content service already writes the bucket slot on every mutation, so a consumer
subscribes to the bucket. `TOIMBucketSlot` carries two fields for it, and nothing
else a consumer reads:

| Field | What it says |
|---|---|
| `commands` | `readonly TOIMOrderedListCommand[]`, or `undefined` before the first write — what this frame's writes did, in order |
| `isWholeListRecorded` | the script was given up on; read the bucket's slots and rebuild |

Read both inside the frame. They are reset once the flush has fully ended, so
they exist only in an effect body or a `subscribeAfterEachFrame` handler; after `db.flush()` returns, `commands` is empty (or `undefined`) and
`isWholeListRecorded` is `false`. There is no "commands since frame N": a consumer
that did not read this frame's script reads the list instead.

A positional write is always recorded as a position, and `addBucketMemberSlots`
as an `insert` at the end. `isWholeListRecorded` is set by a write of the whole bucket — `writeBucketMemberSlots`,
`clearBucketMemberSlots`, `moveBucketMemberSlotRangeToPosition` — by a removal from a bucket whose
content service keeps no positions, which has no index to patch, and by the script
outgrowing the list it describes. `maxCommandsPerSlot` is the
commands-per-slot ratio above which that happens; it defaults to
`OIM_MAX_COMMANDS_PER_SLOT`, which is 1, because replaying a script longer
than the list it describes costs more than replacing the list. A
consumer animating moves cannot use a whole-list answer at all, since every move it
was going to animate is gone with it. So it passes `Infinity` and is handed every
command, however long the script runs.

The Exodra adapter consumes exactly this script:
[`exoPositionalList`](/docs/packages/exodra#lists-are-a-fork-and-both-arms-ship).

## A single bucket

One bucket under no address: the current search result, the visible window, a
selection. Take it for a hand-curated list that nothing looks up by key; take a keyed
bucket collection as soon as there is more than one such list and a key tells them apart.

A single bucket is a store slot of `createOIMSingleBucketService(db, options?)`, an `OIMSingleSlotService` over
a bucket content service with `OIMSlotStoreServiceSingleSlotDriven.INSTANCE` as its store. Its options are
those of `createOIMBucketService` without a store. `createStoreSlot(db)` mints nothing; its one bucket slot is
read through the single doors: `getSingleSlot(storeSlot)` hands it out (minting it on the first read, or a
fresh one if the last was released, and the unused-slot collector holds that mint until the next flush),
`holdSingleSlot(storeSlot)` hands it out held, and `findSingleSlot(storeSlot)` answers it without minting.

```ts
const searchResultService = createOIMSingleBucketService<TOIMEntitySlot<Card>>(db);
const searchResult = searchResultService.createStoreSlot(db);
const searchResultSlot = searchResultService.holdSingleSlot(searchResult);

searchResultService.slotContentService.writeBucketMemberSlots(searchResultSlot, [cardService.getSlotByKey(cards, 'c1')]);
effectService.createEffect(db, [searchResultSlot], [], () => {
    render(Array.from(searchResultService.slotContentService.getBucketMemberSlots(searchResultSlot)));
});
```

Every door of the content service takes the single bucket slot as it takes a keyed one, including
`markBucketColumnsChanged(bucketSlot, patch, changedColumns)`. Nothing marks a single bucket's columns
for you: whoever changes its members calls `markBucketColumnsChanged`, as the index does
for its buckets.

The single bucket slot is what an effect subscribes to. It lives under the release policy like any bucket:
while an effect or a hold keeps it, it stays; once it is unheld and empty under the default
`OIMSlotReleasePolicyAtEmpty` it is released, and the next `getSingleSlot` or `holdSingleSlot` mints a fresh,
empty one. Pass `OIMSlotReleasePolicyNever.INSTANCE` as `slotReleasePolicy` for a bucket slot that is never
released.

## Rendering an ordered bucket

`oimOrderedListCommandsOfTransition(prev, next, maxCommandsPerSlot?)` turns "what I
last rendered" into "what the bucket holds now" as a command list, so a consumer
patches instead of rebuilding. Take it when the list was not written through a
content service with a recorder — a sorted computed, an index bucket, a list you
built yourself — or when the consumer was not there for the frames in between;
a positional bucket with a recorder already hands you the script.

```ts
declare const whatIRendered: readonly TOIMEntitySlot<Card>[];

const bucket = orderedDeckService.holdSlotByKey(orderedDecks, 'red');
const now = Array.from(orderedDeckService.slotContentService.getBucketMemberSlots(bucket));

for (const command of oimOrderedListCommandsOfTransition(whatIRendered, now)) {
    switch (command.type) {
        case 'insert': /* command.index, command.slot */ break;
        case 'remove': /* command.index */               break;
        case 'move':   /* command.from, command.to */    break;
        case 'reset':  /* command.slots */               break;
    }
}
```

`whatIRendered` must be a snapshot you took where you rendered, never the
value `getBucketMemberSlots` handed you. `getBucketMemberSlots` returns the bucket's live list, which is why it
is typed `Iterable` and not an array. A `prev` kept live is the same array as
`next` on the following frame, so the diff comes back empty, no reorder is ever
drawn, and nothing throws. Keep the `Array.from(...)` copy, or subscribe to
`createOIMComputedServiceBucketMemo`, whose value is a fresh array on every write
that changed the list and the same array while it did not.

A list **may name one slot twice** — `OIMBucketArrayMembershipNonUnique`, the default
membership of the array-driven content service, records every mention. The diff matches the
mentions of one identity in the order they appear, and the script reproduces the
new list mention for mention. Its minimal move count is claimed for lists whose
identities are distinct.

Its third argument, `maxCommandsPerSlot`, is the commands-per-slot-of-`next` ratio above
which it returns one `reset` instead of the script — the same ratio
`OIMBucketCommands` takes as `maxCommandsPerSlot`. Left out it never
returns a `reset` at all, which is the arm an animating consumer wants.

It is the diff itself and does not subscribe for you: read the two
lists inside your own effect and call this.

## Giving a bucket store slot back

A bucket collection has no handle to give back, and neither has a bucket store slot. Each
bucket is held by whoever subscribed to it or put slots in it, and it goes when
the last of those lets go. A caller who means to empty a bucket store slot
clears each bucket in it:

```ts
for (const bucket of Array.from(byDeckService.getSlots(byDeck))) deckContentService.clearBucketMemberSlots(bucket);
```

## Where to next

<DocCards>
<DocCard to="/docs/core/oimindex" title="Indexes">Buckets filled from a source collection by `keyOf`, and sorted views over them.</DocCard>
<DocCard to="/docs/core/index-shape" title="Why an index looks like this">Push for membership, pull for order.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">Why a `remove` leaves a bucket's slots standing.</DocCard>
<DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">The "live" rule.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">How computeds are pulled and effects are woken.</DocCard>
</DocCards>
