---
sidebar_position: 4
description: Which reads mint a slot and how the unused-slot collector handles them, and how to subscribe by building an effect over an entity, column or computed.
---

# Reading and subscribing

| You want | Take | Not |
|---|---|---|
| a value once, now | `getSlotByKey(storeSlot, key).entity`, or `slotContentService.findEntityByKey(storeSlot, pk)` | an effect you dispose straight away |
| to know whether a key has a value, without minting it | `hasSlotContentByKey(storeSlot, key)` | `getSlotByKey(storeSlot, key).entity !== undefined`, which mints |
| an identity that must outlive this turn | `holdSlotByKey(storeSlot, key)` … `unholdSlot(slot)` | keeping a `getSlotByKey` result across a `flush()` |
| to be told when a slot moves | `effectService.createEffect` | polling |
| a first value now, then every change | `effectService.createEffectImmediate` | `createEffect` plus a read before it |
| to be told when one column moves | `effectService.createEffect(db, [column], [], body)` | an effect over the whole entity |
| work after every effect of a frame has run | [`subscribeOnceAfterFrame` / `subscribeAfterEachFrame`](/docs/core/channel#work-that-needs-the-whole-settled-frame) | a write from an effect body |
| work once the flush has fully ended | [`subscribeAfterEachFlush`](/docs/core/channel#after-the-flush-has-ended) | a microtask you queue yourself from a tail handler |
| a cache that empties itself | [a `slotReleasePolicy` at construction](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing) | a sweep or a `release` call of your own |

<InShort>

- There is no observable wrapper: you read the slot.
- `getSlotByKey` mints, and the unused-slot collector gives back what you do not keep.
- `findSlotByKey`, `findEntityByKey` and `hasSlotContentByKey` look a key up and mint nothing.
- Subscribing is building an effect over an entity, a column or a computed.

</InShort>

## Reading is direct, and it mints

There is no observable wrapper in this engine. You read the slot.

```typescript setup
import {
    OIMDB,
    OIMEffectService,
    OIMSlotStoreServiceSingleSlotDriven,
    OIMUnusedSlotCollectorService,
    createOIMBucketService,
    createOIMComputedService,
    createOIMEntityService,
    type TOIMBucketSlot,
    type TOIMBucketSlotsArrayStore,
    type TOIMComputedSlot,
    type TOIMSingleSlotStore,
    type TOIMDisposer,
    type TOIMEntitySlot,
    type TOIMStoreKey,
} from '@oimdb/core';

type Card = { id: string; title: string; rank: number };

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
const byDeckService = createOIMBucketService<TOIMEntitySlot<Card>>(db);
const byDeck = byDeckService.createStoreSlot(db);

declare const slot: TOIMEntitySlot<Card, TOIMStoreKey>;
declare const bucket: TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<Card>>, TOIMStoreKey>;
declare const pk: TOIMStoreKey;
declare const body: () => void;
declare const render: (card: Card | undefined) => void;
declare const show: (value: number) => void;
declare const poll: () => void;
```

```typescript
const cardSlot = cardService.getSlotByKey(cards, 'c1');   // TOIMEntitySlot<Card>, never undefined
cardSlot.entity;                                         // Card | undefined
cardSlot.entity?.title;
cardService.slotContentService.findEntityByKey(cards, 'c1');   // the entity or undefined, and nothing minted
cardService.findSlotByKey(cards, 'c1');                  // the slot or undefined, and nothing minted
cardService.hasSlotContentByKey(cards, 'c2');            // false, and nothing minted

cardService.getSlotCount(cards);
for (const s of cardService.getSlots(cards)) { console.log(s.key); }

byDeckService.slotContentService.getBucketMemberSlots(bucket);       // Iterable<TOIMEntitySlot<Card>>
byDeckService.slotContentService.getBucketMemberSlotCount(bucket);
```

Every read that names a key is the collection service's and takes the store slot of the collection first;
a read of a bucket's members is the bucket content service's and takes only the bucket slot.

A key is resolved to its identity once, and from
then on every read, write and subscription goes through that object rather than
through a lookup. The slot you read from is the slot an effect subscribes to and
the slot a bucket files, so nothing downstream has to look the key up again. Keep
the slot you already have instead of re-resolving its key in a loop.

`getSlotByKey` resolves a key to an identity and mints one if the key has none. The
mint goes to the db's unused-slot collector, which holds it and gives
that hold back at the next `flush()` — so a read you then hold or subscribe to
keeps its identity, and a read you walk away from costs one slot until the end of
the turn. See [the four doors](/docs/core/model#the-four-doors).

`slot.entity` is `TEntity | undefined` because an identity outlives its value:
a key you reserved with `holdSlotByKey` has an identity and no value yet, and
`deleteEntity` takes the value away and leaves the identity filed for as long as something holds it.

### Which read mints

| Read | Mints when the key has no identity | What keeps the mint |
|---|---|---|
| `getSlotByKey(storeSlot, key)`, `getSingleSlot(storeSlot)` | the slot | the unused-slot collector, until the next `flush()` |
| `findEntityByKey(storeSlot, pk)`, `findSlotByKey(storeSlot, key)`, `findSingleSlot(storeSlot)` | nothing | — |
| `getEntitiesByKey(indexStoreSlot, key)` on an index service | the bucket | the unused-slot collector |
| `getBucketColumnByKey(indexStoreSlot, key, columnName)` on an index service | the bucket and its column slot | the unused-slot collector |
| `getColumn(slot, name)`, `getAnyColumn(slot)` | the column slot | the unused-slot collector |
| `holdSlotByKey(storeSlot, key)`, `holdSingleSlot(storeSlot)`, `holdColumn(slot, name)` | the slot | your hold, until its give-back |
| `hasSlotContentByKey(storeSlot, key)`, `hasSingleSlotContent(storeSlot)`, `isSameKey(key, otherKey)`, `getSlots(storeSlot)`, `getSlotCount(storeSlot)`, `getBucketMemberSlots(bucket)`, `getBucketMemberSlotCount(bucket)` | nothing | — |

A computed slot is read through the value service it carries — `slot.computedValueService.getValueForSlot(slot)`
— because that refreshes it first. `computedSlot.value` is the value as of its last refresh. See
[The compute graph](/docs/core/computed-effects).

### The unused-slot collector

The unused-slot collector holds what a getter minted until the next `flush()` ends, even when an
effect threw. That is what lets a caller read a key that has no value yet and subscribe to it or hold
it in the same turn: the subscription lands on the identity every later write uses. The db's collector
is `db.collectorSlot.unusedSlotCollectorSlot`, run by `OIMUnusedSlotCollectorService.INSTANCE`.

A scope defers the give-back past a frame:

```typescript
const unusedSlotCollectorSlot = db.collectorSlot.unusedSlotCollectorSlot;
OIMUnusedSlotCollectorService.INSTANCE.run(unusedSlotCollectorSlot, () => {
    const first = cardService.getSlotByKey(cards, 'c1');
    db.flush();
    cardService.getSlotByKey(cards, 'c1') === first;    // true: the scope is still open
});
```

`open(collectorSlot)` and `close(collectorSlot)` are the same thing by hand, and they nest; only the close
that brings the depth to zero gives the holds back. `close` without an `open`
throws, because it would sweep slots an outer scope still stands on. `run` closes
from a `finally`, so a body that throws still gives its holds back. A collector of
your own is a bag of holds you give back at once: `createOIMUnusedSlotCollectorSlot()`, pass each slot you
need to `holdSlotUntilFlush`, and `flush` it when you are done.

### "Live" carries one rule

`getBucketMemberSlots(bucket)` hands back the live slots the bucket content service maintains — the
`Set` itself for `OIMSlotContentBucketServiceSetDriven`, the list itself for the array-driven one.
`cardService.getSlots(cards)` carries the same rule: it iterates the store the store slot carries rather
than a copy of it. So a `deleteEntity`, or a `removeBucketMemberSlots` / `addBucketMemberSlots`, inside the
loop edits the thing the loop is walking. Nothing throws. On an array-driven bucket the slot is spliced
out under the loop's own index, so the loop silently skips the slot after each one it removed.

Copy first when the body writes:

```typescript
const bucketContentService = byDeckService.slotContentService;
for (const entry of Array.from(bucketContentService.getBucketMemberSlots(bucket))) {
    bucketContentService.removeBucketMemberSlots(bucket, [entry]);
}
```

## Subscribing is building an effect

`OIMEffectService.INSTANCE.createEffect` and `createEffectImmediate` are how an effect is built, and
subscribing is one of the four minting doors: what it leaves behind is a
reference to what it minted — the
effect itself — so nothing can unfile the identity under the subscriber. An
effect is a plain `TOIMEffect` object with no methods; the stateless `OIMEffectService.INSTANCE` does all
the work on it. Each takes the channel map (`db`) first.

`subscribeEffect(db, sourceSlots, sourceComputeds, body)` is `createEffect` that hands back a disposer
instead of the effect; it is what a binding library's `subscribe` wants.

```typescript
const effect = effectService.createEffect(
    db,
    [slot, bucket],                // root slots it reads
    [],                            // derivations it reads
    () => { render(slot.entity); },
);

effectService.disposeEffect(effect);
```

The body runs when something it reads has moved, and only then. Both source
lists are fixed at construction — a cycle therefore cannot be built, and a
derivation's sources cannot include itself. `createEffectWithSourceTracking(db, body)` is the other arm:
its body is handed an `OIMEffectSourceTracker` and names its sources as it reads.

With the fixed lists, the lists you hand in are the whole dependency set: a run costs no
tracking, and a slot read in the body but not named in a list does not wake it. `createEffect`
subscribes to and holds every slot you named, every computed you named and every root under
those computeds; `disposeEffect(effect)` gives each back.

### Reading a computed from an effect

```typescript
const rankService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    computedSlotStoreService:
        OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>,
});
const rankOf = rankService.createComputedStoreSlot(
    db,
    () => slot.entity?.rank ?? 0,
    () => ({ sourceSlots: [slot] }),
);
const rankSlot = rankService.computedCollectionService.holdSlotByKey(rankOf, undefined);

const rankEffect = effectService.createEffect(db, [], [rankSlot], () => {
    show(rankSlot.computedValueService.getValueForSlot(rankSlot));
});
```

Before deciding whether to run, the effect refreshes each computed it names and
then compares revisions: the body runs if a root slot it named directly, or a
computed it named, carries a revision after the effect's last run. A write that
reaches the computed's sources but leaves its value equal under its
`sameValueGuard` does not advance the computed's revision, so the body does not
run.

### It hears only what happens after it

A subscription is told about changes made after the call and about nothing
before them — for an entity, a column, a bucket and a derivation alike. A batch does
not soften this: writes accumulate until `flush()`, so subscribing behind a write
of the still-open batch is subscribing *after* that write, and it stays silent.

```typescript
cardService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
const cardSlot = cardService.getSlotByKey(cards, 'a');

effectService.createEffect(db, [cardSlot], [], () => { /* never runs for the upsert above */ });
db.flush();

effectService.createEffectImmediate(db, [cardSlot], [], () => { render(cardSlot.entity); });  // runs now
```

A first value is `createEffectImmediate`'s job. `createEffect` answers "tell me when this
changes"; `createEffectImmediate` answers "give me it now, and then tell me". If the immediate run
throws, `createEffectImmediate` disposes the effect it built and rethrows, so a failed
subscription leaves no hold behind.

A write made *later in that same batch* is delivered.

Anything that is a slot can be a source: an entity slot, a bucket slot,
a column slot, the slot of a standalone record (`getSingleSlot(storeSlot)`). A computed slot goes in the
`sourceComputeds` list. A store slot is not a slot and is not a source. A service is not a slot and is not
a source.

### A body may hand back its own undo

```typescript signature
type TOIMEffectBody = () => (() => void) | void;
```

A body that opens something per run has somewhere to close it: return a function
and it is called before the next run and by `disposeEffect`.

```typescript
const effect = effectService.createEffect(db, [slot], [], () => {
    const timer = setInterval(poll, 1000);
    return () => clearInterval(timer);
});
```

Returning nothing is the ordinary case. Anything returned that is not a function is
ignored, so an expression-bodied arrow such as `() => set.add(key)` is safe.

### Subscribing to one column

```typescript
const onRank = effectService.createEffect(db, [cardService.holdColumn(slot, 'rank')], [], () => { render(slot.entity); });
```

It wakes only when that named column moves. A write that changes
`title` does not run it. Use it instead of `createEffect(db, [slot], …)` when the body depends
on one column of a wide entity that is written often.

A column effect takes the column slot, which
goes in the root list of `createEffect`; the derivation list stays empty. What
mints the column identity and holds it is the door one level up —
`holdColumn(slot, name)` on the collection service of an entity or bucket collection, for a slot of a
collection or of a single alike, or
`holdBucketColumnByKey(indexStoreSlot, key, columnName)` on an index service for a column across a bucket's
members. Each has its give-back — `unholdColumn(columnSlot)` on the same service.

A computed has columns too: `computedCollectionService.holdColumn(computedSlot, 'field')` returns a
`TOIMComputedColumnSlot`, which goes in the `sourceComputeds` list and wakes the effect only when that
field of the derived value changes (see
[Computed columns](/docs/core/computed-effects#computed-columns)). Every collection service also has
`getAnyColumn(slot)` / `holdAnyColumn(slot)`, a column slot that wakes on any column write to its carrier.

A carrier slot is not released while a column slot is filed on it. A column slot goes when nothing
holds it and nothing subscribes to it. A column holds no value: what moved is on the slot you already
have (`slot.entity?.rank`); the effect says *when* to look.

Column names are type-checked. `holdColumn` takes the collection's column name type,
which `createOIMEntityService<Card>` sets to `TOIMEntityColumnName<Card>`, the
keys of `Card`, so a misspelt column fails to compile.
`deleteEntityColumns` on the entity content service takes `readonly TOIMEntityColumnName<TEntity>[]`.

### Holding what you subscribe to

Subscribing takes a reference, and `disposeEffect` gives it back. If you subscribed to a
slot somebody else resolved and you need it to outlive that subscription,
take a hold of your own:

```typescript
slot.owner.holdSlot(slot);
// …
slot.owner.unholdSlot(slot);
```

Without a hold of your own, an identity whose only reference was your subscription is
unfiled when `disposeEffect` gives the effect's hold back. Any number of readers can hold one
identity without knowing about each other; the slot goes when the last of them leaves.

To hold by key, use the keyed form of the same door, which hands back the
slot and nothing else:

```typescript
const heldSlot = cardService.holdSlotByKey(cards, pk);
```

`unholdSlot` on a slot whose `holdCount` is already `0` throws by name, so a
give-back is not idempotent — call it exactly once per hold. `holdSlot` and
`unholdSlot` on a released slot throw too: resolve the key afresh.

### Giving many handles back at once

Keep your own array. There is no scope object for effects in this package:

```typescript
const disposers: TOIMDisposer[] = [];

disposers.push(effectService.subscribeEffect(db, [slot], [], body));

const held = cardService.holdSlotByKey(cards, pk);
disposers.push(() => { held.owner.unholdSlot(held); });

for (let i = disposers.length - 1; i >= 0; i--) disposers[i]();
```

An effect from `createEffect` has no `dispose` of its own, so a detached disposer for it is
`() => effectService.disposeEffect(effect)`; `subscribeEffect` hands that disposer back for you.
`holdSlot` and `unholdSlot` are prototype methods on the owner that read `this`, so pulling
one off type-checks — `TOIMDisposer` is `() => void` — and throws a `TypeError`
when it is called. `subscribeAfterEachFrame`, `subscribeOnceAfterFrame` and
`subscribeAfterEachFlush` each return a `TOIMDisposer` closure and are passed
directly too.

By keeping the array yourself, you also take on the reverse ordering and the try/catch. For holds on slots
alone, a collector slot of your own is the scope (see
[the unused-slot collector](#the-unused-slot-collector)).

## Interop

An identity is plain data with no methods. Its `owner` is the only reference back
to the runtime, and operations go through the owner and the effect service, so the
API reads `effectService.createEffect(db, [slot], [], handler)` and has no
`slot.subscribe(handler)`.

To hand a slot to a binding library, build the pair yourself over what you have:

```typescript
const subscribe = (onStoreChange: () => void): TOIMDisposer =>
    effectService.subscribeEffect(db, [slot], [], onStoreChange);
const getSnapshot = () => slot.entity;
```

Under `createOIMEntityWriterInPlace`
— the default — `slot.entity` before and after an update is `===`, and a
bucket's slots are handed back as the same live object, so a binding that
decides "did it change?" by comparing values will never fire. What tells you
something happened is your effect running, so such a binding needs a counter
bumped *inside* the handler. Under `createOIMEntityWriterReplacing`, the entity
reference does move on every write, which is the whole reason that strategy ships.

## Where to next

<DocCards>
<DocCard to="/docs/core/channel" title="The channel: frames and subframes">Stamps writes with its clock and drives a flush.</DocCard>
<DocCard to="/docs/core/lifecycle" title="Slot lifecycle">How a slot is minted, kept and released.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">How computeds are pulled and effects are woken.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">Slot lists whose slots the caller states.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">Buckets filled from a source collection by a key function.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">Which write to call and what it wakes.</DocCard>
</DocCards>
