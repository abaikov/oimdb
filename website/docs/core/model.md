---
sidebar_position: 1
description: The engine model in one page, covering the three kinds of slot, stateless services and the store slots they work on, the OIMDB root, the four minting doors and the frame.
---

# The model

Everything this engine delivers news about is a **slot**: an identity that
something may refer to, that may hold content, and that a **frame** may deliver
news about. An entity is a slot. One column of an entity is a slot. A bucket is a
slot. A derived value is a slot. A service is not a slot, and it holds no state: it is the
code that files the slots of one kind under their keys, in the store each of its store slots carries.

<InShort>

- An entity, a column of an entity, a bucket and a derived value are each a slot.
- A key is resolved to its slot once, and every reader, writer and subscriber then works through that object.
- Services are stateless; the state lives on the slots and the store slots.
- A slot goes when nothing refers to it, and a reference is given back by the thing that took it.
- Where a trade-off has two defensible strategies, both ship and you pick at construction.

</InShort>

## Glossary

<Glossary>
  <Term name="slot" type="TOIMSlot">A plain object that is the identity of one key in one collection, or of one single value. It carries its `owner`, its `holdCount` and the `effects` filed on it.</Term>
  <Term name="entity slot" type="TOIMEntitySlot">A slot whose content is one entity, read as `slot.entity`.</Term>
  <Term name="column slot" type="TOIMColumnSlot">A slot hanging off a carrier slot that stands for one column, a group of columns or any column. An effect on it is woken only when a write moves that column.</Term>
  <Term name="bucket" type="TOIMBucketSlot">A slot whose content is other slots.</Term>
  <Term name="computed" type="TOIMComputedSlot">A slot whose value is derived from other slots and is refreshed by the read that asks for it.</Term>
  <Term name="effect" type="TOIMEffect">A body filed on slots by `OIMEffectService.INSTANCE.createEffect`. A frame runs it when one of its sources moved.</Term>
  <Term name="channel slot" type="TOIMChannelSlot">What every write goes through. It carries the clock, the effects scheduled by the slots that moved and the flush state; `OIMChannelService.INSTANCE` is the code that runs it.</Term>
  <Term name="frame">The delivery of the writes made since the previous frame: each effect those writes scheduled runs once, then the after-each-frame handlers run.</Term>
  <Term name="flush">One call of `db.flush()`. It runs `onBeforeFlush` and a frame when anything is owed, then the unused-slot collector gives back its holds and the after-each-flush handlers run.</Term>
  <Term name="hold">A counted reference on a slot (`holdCount`), taken by `owner.holdSlot` or a collection's `holdSlotByKey` and given back by `owner.unholdSlot`.</Term>
  <Term name="store slot" type="TOIMStoreSlot">One collection: the state of one instance — the `store` its slots are filed in, its `channelSlot`, its listeners and column state. `createStoreSlot(db)` makes one; every door that works on a whole collection takes it first.</Term>
  <Term name="mint">Create the slot of a key that has none and file it in the store of its store slot.</Term>
  <Term name="release">Unfile a slot that nothing holds or refers to, once its release policy allows it. The slot's RELEASED flag is then set (`oimIsSlotReleased(slot)`).</Term>
</Glossary>

Three sentences carry the rest of this section:

1. Four doors mint an identity: writing a value, subscribing, taking a
   hold, and `getSlotByKey`, whose mint the unused-slot collector holds for the
   turn. `findSlotByKey`, `findEntityByKey` and `hasSlotContentByKey` look a key up and mint nothing.
2. A slot goes when nothing refers to it, and a reference is given back by
   the thing that took it.
3. Where a trade-off has two defensible strategies, both ship and you pick at
   construction.

A key is resolved to its slot once, and from then
on every reader, writer and subscriber works through that object: an effect is
filed on the slot itself, a bucket holds the slot itself, a column is a slot
hanging off its carrier. Nothing on the delivery path looks a key up again, and a
subscriber who arrived before the value did is subscribed to the same object the
value later lands on.

## The three kinds of slot

There are three, and no others:

| Kind | What its content is | Type |
|---|---|---|
| entity | a value, whose columns can be watched one by one | `TOIMEntitySlot` |
| bucket | other slots | `TOIMBucketSlot` |
| computed | a value derived from other slots | `TOIMComputedSlot` |

Every slot, whatever its kind, has the shape `TOIMSlot`. Its fields are `readonly`
in the type you are handed: you read them, and ask `slot.owner` for holds,
subscriptions and releases. `slot.storeSlot` is the store slot the slot is filed in,
which is why a door handed a slot needs no store slot of its own.

Each kind comes in two shapes: one of it, with no key; or many of it, filed by
key. The store service decides which: a single is built over
`OIMSlotStoreServiceSingleSlotDriven.INSTANCE`, which files at most one slot in a
`TOIMSingleSlotStore` (`{ slot }`), and its reads are `OIMSingleSlotService`'s.

| kind | single | collection |
|---|---|---|
| entity | `createOIMSingleEntityService(db)`: `getSingleSlot`, `holdSingleSlot`, `findSingleSlot` | `createOIMEntityService(db, { keyOf })`: `getSlotByKey`, `holdSlotByKey`, `findSlotByKey` |
| bucket | `createOIMSingleBucketService(db)` | `createOIMBucketService(db)`, or an index |
| computed | `createOIMComputedService({ computedSlotStoreService: OIMSlotStoreServiceSingleSlotDriven.INSTANCE, … })`, read by the key `undefined` | `createOIMComputedService({ … })` |

`createStoreSlot` mints nothing. A single's slot is minted on the first
`getSingleSlot(storeSlot)` or `holdSingleSlot(storeSlot)`, exactly as a
collection's slot is minted on the first read of its key, and `findSingleSlot(storeSlot)`
answers it without minting. It is released at its release policy like any slot of that
type, and the next get or hold mints a fresh one. A single invents no behaviour of its own.
Use the single shape for one value the whole program shares (settings, a session,
one selection); see [Standalone records](/docs/core/object). Use a collection
as soon as the values are told apart by a key.

Both computed shapes own `TOIMComputedSlot`, the plain data type minted from
`createSources`: a computed slot dies when nothing holds it, the store slot outlives it
and mints a fresh one on the next read or hold. Its value is read through the
value service the slot carries — `slot.computedValueService.getValueForSlot(slot)` — because that
call is what re-derives a stale value. `slot.value` compiles and is not refreshed by reading
it. See [The compute graph](/docs/core/computed-effects).

## Every collection is a content service, a collection service and a store slot

A collection type is two stateless objects:

- the **content service** — what one slot holds and how it is written:
  `OIMSlotContentEntityService` (built by `createOIMSlotContentEntityService(db, { keyOf })`),
  `OIMSlotContentBucketServiceArrayDriven` / `OIMSlotContentBucketServiceSetDriven` / `OIMSlotContentBucketServiceSortedArrayDriven`, or a computed's
  `OIMComputedValueService`. It is the strategy, and it owns the slot owner (`slotOwner`) that holds,
  subscribes and releases the slots of every store slot of that type;
- the **collection service** over it — `OIMSlotCollectionService` (or `OIMSingleSlotService` for a
  single), the read doors by key and the column doors. Its `slotContentService` is the content service.

A store slot (`TOIMStoreSlot`) is one collection, the state the two services work on. It is not a slot:
it has no owner, no hold count and no effects, so it is never held or subscribed.

```typescript setup
import {
    OIMDB,
    OIMEffectService,
    OIMSlotReleasePolicyAtUnhold,
    OIMSlotReleasePolicyNever,
    OIMUnusedSlotCollectorService,
    createOIMBucketService,
    createOIMComputedService,
    createOIMEntityService,
    createOIMEntityWriterReplacing,
    type TOIMEntitySlot,
    type TOIMStoreKey,
} from '@oimdb/core';

type Card = { id: string; deck: string; title: string };

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const byDeckService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const byDeck = byDeckService.createStoreSlot(db);
const rankService = createOIMComputedService<TOIMStoreKey, number>({});
const ranks = rankService.createComputedStoreSlot(
    db,
    (computedSlot) => cardService.slotContentService.findEntityByKey(cards, computedSlot.key)?.title.length ?? 0,
    (key) => ({ sourceSlots: [cardService.getSlotByKey(cards, key)] }),
);

declare const pk: TOIMStoreKey;
declare const key: TOIMStoreKey;
declare const entity: Card;
declare const slot: TOIMEntitySlot<Card, TOIMStoreKey>;
declare const body: () => void;
```

```typescript
cardService.getSlotByKey(cards, pk)                             // an entity collection
byDeckService.holdSlotByKey(byDeck, key)                        // a bucket collection
rankService.computedCollectionService.getSlotByKey(ranks, key)  // a computed collection
```

What a content service adds is its own vocabulary for its own content: `upsertEntity`, `updateEntity`
and `deleteEntity` on an entity content service; `addBucketMemberSlots`, `removeBucketMemberSlots`
and `getBucketMemberSlots` on a bucket content service; `getValueForSlot` on a computed value service.

## The root: `OIMDB`

`OIMDB` is what every `create…` factory that builds a collection type takes, and what every
`createStoreSlot(db)` takes. The computed factories (`createOIMComputedService`,
`createOIMComputedServiceSorted`, `createOIMComputedServiceBucketMemo`) take no db: a computed store
slot gets its channel slot from `createComputedStoreSlot(db, …)` or from the store slot it reads.
The root holds what every collection in one program must share, and the defaults you want to state once:

| Property | What it is |
|---|---|
| `defaultChannelSlot` | the `TOIMChannelSlot` every store slot made with `createStoreSlot(db)` delivers through |
| `clock` | the revision and epoch every write is stamped with |
| `collectorSlot` | the collector slots: the unused-slot collector that holds what getters mint, and the three release collectors |
| `entityWriter` | the writer an entity content service uses when its own options name none |
| `slotReleasePolicy` | the release policy the entity, bucket and index factories use when their own options name none |
| `slotStamp` | an `IOIMSlotStamp` written on a slot at every content change |
| `indexKeysService` | how index key positions on a slot are allocated (`OIMIndexKeysServiceAppending` when absent) |

Its constructor takes the channel's options (`channelScheduler`, `errorPolicy`,
`onBeforeFlush`), the clock and timer (`getNowMs`, `releaseTimer`) and those four defaults in one object.
`db.flush()` flushes its default channel slot.

```typescript
const appDb = new OIMDB({
    channelScheduler: (flush) => { void Promise.resolve().then(flush); },
    entityWriter: createOIMEntityWriterReplacing(),
    slotReleasePolicy: OIMSlotReleasePolicyAtUnhold.INSTANCE,
});

const noteService = createOIMEntityService<Card>(appDb, { keyOf: (card) => card.id });
const notes = noteService.createStoreSlot(appDb);
const archiveService = createOIMEntityService<Card>(appDb, {
    keyOf: (card) => card.id,
    slotReleasePolicy: OIMSlotReleasePolicyNever.INSTANCE,
});
const archive = archiveService.createStoreSlot(appDb);
```

A factory option outranks the root's, and the root's outranks `OIMDefaults`.
`createOIMComputedService` reads only its own `slotReleasePolicy`, so a root's
policy does not reach a computed. The policy belongs to the collection type, so every store
slot of one type shares it.

An effect over slots of two collections runs in one frame only if both store slots
report to the same channel slot. The same holds for the collector: a mint
is given back by the flush of the channel slot that owns that collector. `OIMDB` is
the place where those are made once and shared.

`OIMDefaults` is process-wide, and it is set once. Its static `OIMDefaultValue` entries
(`ENTITY_WRITER`, `ENTITY_SLOT_EMPTINESS`, `COLUMN_SLOT_STORE_SERVICE`, `COMPUTED_COLUMN_SLOT_STORE_SERVICE`,
`INDEX_KEYS_SERVICE`, `STORE_SLOT_LISTENER`, …) answer for every option left out anywhere. Calling `setValue` on one
after its `getValue` has run throws: the objects built before the call would keep the
old one. For the same reason the package refuses to load twice in one process —
two copies would each have their own `OIMDefaults`.

## The four doors

The four doors are writing a value, subscribing, taking a hold, and reading a key
that has none. What admits each of them is that the act leaves a reference behind
on what it produced — a value, an effect, a count, or a tracked mint — so nothing
can unfile the identity under the caller who just obtained it.

```typescript
cardService.slotContentService.upsertEntity(cards, entity);          // door 1: write. The value is the reference.
cardService.slotContentService.insertEntity(cards, key, entity);     //         the same door, stated by key.
effectService.createEffect(db, [slot], [], body);                    // door 2: subscribe. The effect is the reference.
const held = cardService.holdSlotByKey(cards, key);                  // door 3: hold. A counted reference and a give-back.
slot.owner.holdSlot(slot);                                           //         the same door, on a slot you were handed.
const read = cardService.getSlotByKey(cards, pk);                    // door 4: read. The collector's hold is the reference.
```

The same four doors exist on every collection. A single uses `getSingleSlot(storeSlot)` and
`holdSingleSlot(storeSlot)`; on a column, they are the collection service's `getColumn(slot, columnName)` and
`holdColumn(slot, columnName)`.

A read by `getSlotByKey` mints, and the collector takes the mint back. It returns
`TSlot` and never `undefined`: on a miss it mints the identity, files it, and
hands it to the db's unused-slot collector, which holds it until the next
`flush()`. A read is admitted as a door only because of that hold — without it
the read would hand back an identity the next release unfiles under its caller,
after which the next resolution mints a second one and the caller reads empty for
ever. A caller who then holds or subscribes keeps the identity; a caller who
walks away costs one slot until the end of the turn.

Which reads mint:

| Mints | Does not mint |
|---|---|
| `getSlotByKey`, `getSingleSlot`, `getColumn`, `getAnyColumn`, `getEntitiesByKey` on an index service | `findEntityByKey`, `findSlotByKey`, `findSingleSlot`, `hasSlotContentByKey`, `hasSingleSlotContent`, `isSameKey`, `getSlots`, `getSlotCount`, `getBucketMemberSlots` |

`findEntityByKey(storeSlot, key)` answers the entity or `undefined`, and `hasSlotContentByKey(storeSlot, key)`
answers whether a slot is filed under the key with content; both look the key up
and file nothing. There are no by-key write doors: a write by key resolves the slot first
(`updateEntity(getSlotByKey(storeSlot, key), patch)`), and that read is the mint. The
complete list is in [Reading and subscribing](/docs/core/reading-subscribing#which-read-mints).

A read can be scoped past a flush. `OIMUnusedSlotCollectorService.INSTANCE.open(collectorSlot)` and
`close(collectorSlot)` — or `run(collectorSlot, body)`, which brackets `body` with both — defer the give-back:
while a scope is open the collector's flush returns having done nothing, so a
frame inside the scope does not take a mint back, and the outermost `close` gives
everything back. Scopes nest; a `close` with no `open` throws.

```typescript
const unusedSlotCollectorSlot = db.collectorSlot.unusedSlotCollectorSlot;
const sameSlot = OIMUnusedSlotCollectorService.INSTANCE.run(unusedSlotCollectorSlot, () => {
    const first = cardService.getSlotByKey(cards, 'c1');
    db.flush();
    return first === cardService.getSlotByKey(cards, 'c1');
});
```

The write door always hands back the identity it resolved or minted, whatever the
write changed. A door that mints must leave a reference behind, and that is the
same test the four doors are admitted on. What the write changed goes into the
optional `changed` array instead — see
[Writing](/docs/core/writing#which-entities-actually-changed).

A refusal and an unchanged write are different things. A refusal means no content ever
arrived: the write did not happen and that identity is unwound, so a refused key
is not filed. An unchanged write did happen and the content was already
there: the door completed and the caller is handed the identity, and whether an
identity nothing keeps is worth keeping is the owner's question, asked through
`releaseSlotIfUnheld`. The bulk loads `insertEntities` and `fillEntities` do not hand out a
reference: they return `void`, and on a key that is taken or named twice they throw and roll
back only the entities that call filed.

## A slot goes when nothing refers to it

The whole life of a slot, from mint to release, is covered in
[Slot lifecycle](/docs/core/lifecycle).

There is no release API, no sweep a caller starts, and no owner field for a
caller to set. The owner is asked — `slot.owner.unholdSlot(slot)` by whoever
gives a hold back, and, at a deadline, `slot.owner.releaseSlotIfUnheld(slot)` by the release queue,
which needs no deadline question answered first — and it re-reads every
condition, so asking twice is harmless.

`holdCount` has one writer, the owner. A command that
released a slot on request would let one caller unfile an identity another caller
is still subscribed to, and the second caller would keep reading an object no
lookup returns any more. Counting references and letting the owner decide is what
makes "nothing refers to it" checkable in one place.

`releaseSlotIfUnheld(slot)` is public on `IOIMSlotOwner`, because the release
queue reaches it through `slot.owner`. It is not a release command: it is
a guard that returns having done nothing unless the slot is unheld, unreferenced,
still owned by the object asked and allowed to go by the release
policy. It returns silently on a slot something else already released,
where every door that tries to work with a released slot throws.

The terms, and who gives each back:

| Term | Given back by |
|---|---|
| `holdCount` | `slot.owner.unholdSlot(slot)`; the unused-slot collector's flush after a `getSlotByKey`; a slot leaving a bucket; `effectService.disposeEffect(effect)`, for the hold the effect took |
| `effects` | `effectService.disposeEffect(effect)` |
| a column slot on the carrier | `unholdColumn(columnSlot)` and the last effect on that column being disposed; the carrier is asked again when its last column goes |
| the value | `slotContentService.deleteEntity(slot)` or `slotContentService.clearBucketMemberSlots(bucket)` — under the default policy; see the release policies below |
| a composite-key edge | the tree pruning that composite key part |

What the value counts for is the release policy's answer. Every collection type is
built with one `slotReleasePolicy`, and the policy is asked only once nothing holds
the slot. The table of policies, the default of each kind and the
time policies with their markers are in
[Slot lifecycle](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).
With the default, an entity you wrote and nobody holds stays in memory until it
is deleted, which is what a store is for; a computed nobody holds is dropped,
because it can be derived again.

A slot in a bucket is a counted reference, a hold. A slot you put in a
bucket and never took out is a slot nothing reclaims: a bucket's slots are the
caller's, so the give-back is the caller's too.

Subscribing takes a hold too. `createEffect` files the effect in `slot.effects`
and calls `holdSlot` on each root the caller named (both through `owner.subscribeToSlot`); `disposeEffect(effect)` gives both back.
A subscribed slot is therefore a held slot, and the release clocks need not count subscribers.

A collection given an idle window (`OIMSlotReleasePolicyAfterIdle`) opens that
window at exactly two moments: when a slot first gets content while nothing
subscribes to it, and when the last subscriber leaves (`unsubscribeFromSlot`
takes the last effect off the slot). A give-back (`unholdSlot`) opens no window
and stamps nothing, but it asks the owner whether the slot may go, so a slot whose
window ran out while it was held is released at the give-back. A held slot is not
released while it is held. A collection given no time policy runs no clock, and
that is the default. The windows are described in
[Slot lifecycle](/docs/core/lifecycle#an-idle-window-opens-twice-and-a-held-slot-is-off-the-clock).

`slotContentService.deleteEntity(slot)` takes the value away and leaves the identity standing for as
long as anything still wants it. So `deleteEntity` then `upsertEntity` under one key is one
identity, and whoever was subscribed is still subscribed to the thing they were
given.

Ending the whole channel is a different level and has its own call. Every
term above is per identity, which suits one subscription ending but not
everything ending: walking every bucket and every slot to unfile each one is
bookkeeping for a future that never arrives, because the moment you drop the
channel all of it is garbage together. `OIMChannelService.INSTANCE.dropChannelSlot(channelSlot)` ends
it without walking your graph, on your word that nothing is subscribed to
anything on that channel slot — the engine does not check that, because checking
means asking every slot for its `effects` list, which is the walk the call exists
to skip. The one list it does walk is the unused-slot collector's, which holds
what this frame's getters minted and which nothing else would ever give back once
the channel is dropped. It still does not let anything ask for one slot to go.
See
[dropping the whole channel](/docs/core/channel#dropping-the-whole-channel).

## The frame

A frame is the delivery of every write since the previous frame, as a batch: each
effect those writes scheduled runs once, however many writes touched its sources,
and then the after-each-frame handlers run. A flush is one `db.flush()`: it
runs `onBeforeFlush` and a frame when anything is owed, then the unused-slot
collector gives back its holds and the after-each-flush handlers run.

A write marks the slot and schedules the effects filed on it; it
runs nothing. Ten writes to one slot before a flush cost ten marks and one
delivery, and an effect over several slots that all moved runs once. When the
flush happens is the `channelScheduler` — a function handed the flush to
call later — and with none, nothing is ever delivered until you call `flush()`
yourself.

- An effect hears only what happens after it. `effectService.createEffect(...)` is stamped
  with the channel slot's clock at birth and its body first runs in a frame where one of
  its sources moved. `effectService.createEffectImmediate(...)` also runs the body once, now.
- Writes are refused for the whole of a flush, not just the frame body. A
  subscriber is told during the frame, on a half-built world — the graph has
  not advanced, the delivery list has already been taken — so a write from there
  would land in a frame that is no longer collecting. `onBeforeFlush` and the
  after-each-frame handlers are inside the same flush and refused too. It throws by
  name. Every content service asks the channel slot before it writes, on a collection and on a
  single alike.
- `flush()` inside a frame is refused for the same reason: a frame inside a
  frame is not nested, it is the outer one taken apart. `flush()` from the
  tail of a flush, `onBeforeFlush` or an after-each-frame handler, is not
  refused: it returns having done nothing.
- No door writes from inside a flush. A write in response to a change
  happens after `flush()` has returned: a handler hands the work to a
  microtask or a later callback rather than writing itself. Handlers given to
  `OIMChannelService.INSTANCE.subscribeAfterEachFlush(channelSlot, handler)` run after the flush has
  lowered its flag and given the collector back, so a write from one is accepted and asks for the
  next frame.
- A derivation is asked, never woken. Nothing schedules a computed slot
  and no frame walks to one; it settles when a reader asks for its value. A
  derivation nobody reads costs nothing per frame.
- One throwing handler does not abort the frame by default. The throw goes to
  the error policy: `OIMErrorPolicyLogAndContinue` (the default) logs it,
  hands it to its `onError`, and the frame finishes; `OIMErrorPolicyThrowAtOnce`
  throws it out of `flush()` and leaves the effects not yet reached for the next
  flush.

The full rules, with subframes and the after-frame hooks, are in
[The channel](/docs/core/channel#the-frame).

## Forks are strategies chosen at construction
Where a trade-off has two strategies that are each right for some consumer, this
package ships both behind one abstraction and you pick at construction —
once, statically, injected. The choice then costs nothing at run time: no branch,
no flag, no check on the hot path, because the object already is the answer.

The forks a consumer meets first:

| Fork | Strategies | Chosen at |
|---|---|---|
| how a write lands | `createOIMEntityWriterInPlace()` / `createOIMEntityWriterReplacing()` | the `entityWriter` option of the entity content service, or of `OIMDB` |
| whether the first value handed in is copied | `oimInsertEntityWithoutCopy` (default) / `oimInsertEntityWithCopy` / `oimInsertEntityWithSanitizedCopy` | the `entityInsertStrategy` option of either writer factory |
| how a bucket holds slots | `OIMSlotContentBucketServiceSetDriven` / `OIMSlotContentBucketServiceArrayDriven` (the positions are the caller's; such a bucket never sorts) / `OIMSlotContentBucketServiceSortedArrayDriven` | the `slotContentService` option of the bucket or index factory |
| what naming a slot records | `OIMBucketArrayMembershipNonUnique` / `OIMBucketArrayMembershipUnique` | `OIMSlotContentBucketServiceArrayDriven`'s constructor |
| who decides a bucket's slots | a bucket collection (the caller) / an index (the entity) | which factory you call |
| whether and when a slot is released | the [release policies](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) | `slotReleasePolicy` on the factory's options, or on `OIMDB`'s |
| when a flush runs | manual `flush()` / a `channelScheduler` | `OIMDB`'s options |
| what a throwing handler does | `OIMErrorPolicyLogAndContinue` / `OIMErrorPolicyThrowAtOnce` | `errorPolicy` on `OIMDB`'s options |

The whole list, keys and stores included, is in
[Architecture](/docs/core/architecture#where-a-strategy-is-picked-at-construction).

## Every collection has a channel

Every store slot is created with a channel slot, and every write to it, collection or single, is
reported there. `createStoreSlot(db)` takes `db.defaultChannelSlot`; an index or a computed store
slot over another store slot takes that one's. What `createStoreSlot` takes is an `IOIMChannelMap`,
an object with a `defaultChannelSlot`, so a second channel is a second `OIMDB` or any such object
over a `createOIMChannelSlot(…)`. See
[Writing](/docs/core/writing).

## Where to next

<DocCards>
<DocCard to="/docs/core/collections" title="Collections and identities">Stores, keys, and the chain-of-identities key.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">The write API and the strategies in full.</DocCard>
<DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">Effects and columns.</DocCard>
<DocCard to="/docs/core/channel" title="The channel: frames and subframes">Channels and frame rules.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">A bucket's slots written by hand, the bucket content services and positions.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">The auto-index.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">Computed slots, chains and effects.</DocCard>
<DocCard to="/docs/core/object" title="Standalone records">One identity, no collection.</DocCard>
<DocCard to="/docs/core/architecture" title="Architecture">The same model from the inside.</DocCard>
</DocCards>
