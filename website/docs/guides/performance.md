---
sidebar_position: 1
description: Where the engine spends work, covering identity versus key paths, coalesced delivery, pulled derivations, ordering, and how to choose strategies.
---

# Performance

This page describes where the engine spends work. The measured cost of each call is in [The price of a call](/docs/performance/the-price-of-a-call).

<InShort>

- Holding the identity avoids the map read that going through a key costs.
- Delivery is coalesced, and the coalescing is a stamp.
- Derivations are asked, not woken.
- Ordering is a derivation over an index, and the page ends on choosing strategies.

</InShort>

## The identity path and the key path

```ts setup
import { OIMDB, OIMEffectService, createOIMEntityService } from '@oimdb/core';

type Card = { id: string; title: string; deck: string };

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
const entityService = cardService.slotContentService;
const cards = cardService.createStoreSlot(db);
const slot = cardService.getSlotByKey(cards, 'c1');
const patch: Partial<Card> = { title: 'ACE' };
const handler = (): void => {};
```

```typescript
entityService.updateEntity(slot, patch);   // you already hold the identity
const found = cardService.findSlotByKey(cards, 'c1');   // one Map read
if (found !== undefined) entityService.updateEntity(found, patch);
```

Every write door takes the slot. There are no by-key write doors, so the map read is
always a call you can see: `findSlotByKey` or `getSlotByKey`. If a key arrives from outside (a
route param, a server payload), the read is unavoidable. If you already hold the slot, from the
return value of `upsertEntity` or from an earlier `getSlotByKey`, going back through the key is
pure waste.

**Not measured:** a price pair for each against its own floor (`findSlotByKey` plus
`updateEntity` against a `map.get` plus a store, `updateEntity` against a bare field assignment)
on this engine.

## A column of a slot is its own identity

A write reports the columns it moved, and each column anybody has subscribed to
is a slot with its own dependent list:

```typescript
const deckColumn = cardService.getColumn(slot, 'deck');
effectService.createEffect(db, [deckColumn], [], handler);
entityService.updateEntity(slot, { title: 'ACE' });   // never reaches handler
entityService.updateEntity(slot, { deck: 'hearts' }); // reaches handler
```

It is **lazy on both sides**. A column identity is minted only by the door that
asks for it (the collection's `holdColumn`, or its `getColumn` inside a
subscription), and it is dropped once its last effect is disposed and nothing holds
it. A write never mints one: the service's column owner skips a moved
column that has no slot filed.

So an entity type nobody watches by column pays one field read
(`slot.columnSlotStore === undefined`) per write and nothing else. A slot watched on one
column out of twenty pays one map probe per moved column against a map holding
one entry.

**Not measured:** the per-write cost of that field read, and the cost of the probe
against a populated column map.

## Delivery is coalesced, and the coalescing is a stamp

Whatever a frame's writes touched, each identity's effects run once. The
mechanism is the clock stamp on the slot compared against the clock reading the
last frame closed at (`OIMChannelService.isChangedInCurrentFrame`). It is an integer comparison,
not a lookup in a set.

**Not measured:** the price of a write that lands on an already-stamped slot against one
that lands on a clean one.

## Derivations are asked, not woken

Nothing schedules a computed slot, nothing marks it, and no frame walks to it.
It settles when a reader asks, and the settle asks one question first: *has
anything I read moved?*

**The chain short-circuits on that question.** A recursive settle returns without
deriving when nothing under it moved, so a chain over quiet roots is a walk of
integer comparisons, and a chain whose roots moved derives only the levels whose
inputs actually changed. `filter → sort → page` costs one comparison when an entity
moves without leaving the filter, instead of sorting everything again.

**Not measured:** the cost of a quiet settle per chain level, and the crossover against
recomputing.

## Ordering is a derivation over an index

A bucket on the set-driven or array-driven content service never sorts: its order is the caller's.
The sorted-array-driven one (`createOIMIndexServiceSortedArrayDriven`) keeps the order at the
write instead. The other sorted list is
`createOIMComputedServiceSorted({ indexService, sortColumns?, comparator? })`,
whose `createSortedStoreSlot(indexStoreSlot)` builds it over one index store slot: a pull computed re-derived on the read that asks. Its sources are the
bucket slot (membership) and one bucket column slot per sort column, so a write that
changes no sort column on a member does not re-derive it; with only a `comparator`
the sources are the bucket slot and the bucket's any-column slot (member content only; a join or leave wakes the bucket slot), and any member write re-sorts. A re-sort
that yields the same sequence keeps the previous array.

**Not measured:** the cost of a re-sort against keeping the order at the write, at
several bucket sizes.

## Emptying a bucket

`writeBucketMemberSlots` and `clearBucketMemberSlots` empty a bucket in one call, with zero
element moves. Removing slots one at a time from an array-driven bucket closes the gap with a
`splice` each time, so evicting *n* slots that way costs n(n-1)/2 element moves: **499 500** for
a thousand.

## Fast properties

A field read is a fixed-offset load only while the object is on fast properties
and every object reaching the read shares one hidden class. An object in
dictionary mode pays a hash lookup per read, and a site that sees too many hidden
classes stops caching altogether. V8 reports both states directly, so they are
checked as facts, not timed:

- every slot kind — entity, bucket, computed, column — is one object literal with
  every field present at birth; nothing adds a field later and nothing deletes one;
- per-index state on an entity slot lives in the `indexKeys` array, so indexes add
  no properties;
- every slot of a kind keeps one hidden class through holds, effects, moves between
  buckets, patches and release deadlines;
- neither writer `delete`s a column: a column that leaves is written `undefined`,
  in place or into a spread copy, so an entity keeps its hidden class when a
  column leaves, checked on a forty-column entity under both writers;
- three slot shapes reach the write door, one below V8's polymorphic ceiling of four,
  and four reach `holdSlot`.

These are facts about object layout read from V8 itself, not timings. The one case outside
the engine: an entity handed in with a few hundred fields is in dictionary mode before it
arrives.

See [Object shapes](../core/architecture.md#object-shapes) for how each part of
the engine is laid out to keep this.

## Choosing strategies

Both strategies of each fork are shipped, and **neither strategy of any fork has a measured
price on this engine.** The guidance below rests on architecture, not measurements.

| Fork | Pick the first strategy when | Pick the second when |
|---|---|---|
| `createOIMEntityWriterInPlace` / `createOIMEntityWriterReplacing` | consumers are subscription-driven | something downstream compares by reference |
| `OIMSlotContentBucketServiceSetDriven` / `OIMSlotContentBucketServiceArrayDriven` | you never render this bucket in the caller's order | you do, and you want the reorder commands |
| `OIMSlotContentBucketServiceArrayDriven` with `OIMBucketArrayMembershipNonUnique` / with `OIMBucketArrayMembershipUnique` | duplicates in a bucket are meaningful | a slot must appear once |
| `createOIMComputedServiceSorted` with `sortColumns` / with only a `comparator` | the order is a function of named columns | the comparator reads what no column list can name, so any member write re-sorts |
| `createOIMComputedServiceSorted` / `createOIMIndexServiceSortedArrayDriven` | the list is read less often than it is written | the list is read on every frame, so the order is kept at the write |
| `createOIMBucketService` / `createOIMIndexService` | what a bucket holds is a fact about a response | belonging really is a function of the entity |

Pick one strategy per fork for the whole app unless a task needs two: the
engine's shared call sites see every strategy in the process, and five of one
kind make a site megamorphic. See
[Mixing strategies in one app](/docs/performance/mixing-strategies).

## Where to next

<DocCards>
<DocCard to="/docs/performance/the-price-of-a-call" title="The price of a call">What each door costs against hand-written code.</DocCard>
<DocCard to="/docs/performance/the-price-of-a-call" title="The price of a call">The price suite, and what bounds each figure.</DocCard>
</DocCards>
