---
sidebar_position: 2
description: How to build an entity collection, choose scalar or composite keys, reserve a key before any write, and pick the emptiness strategy.
---

# Collections and identities

An entity collection type is built once per entity type from three things you name at
construction: how its identities are filed, how a key comes out of an entity, and
what counts as empty. A collection is one instance of that type: a store
slot made with `createStoreSlot(db)`, and every door that works on a whole collection takes
that store slot first.

<InShort>

- An entity collection type is two stateless services: the entity content service (writes, the slot owner) and the collection service over it (reads by key, columns).
- Keys are scalar or composite, and composite keys come in strategies you pick between.
- A key can be reserved before anything has written it.
- What counts as empty is a strategy chosen at construction.

</InShort>

```typescript setup
import { OIMDB, OIMEffectService, OIMSlotNeverReleasePolicy, OIMSlotMapStoreService, createOIMSlotCollectionService, createOIMEntityContentService, OIMSlotCollectionBucketService, getOIMBucketMemberSlotEntities, isOIMSlotEmpty, type IOIMSlotEmptinessPolicy, type TOIMEntitySlot, type TOIMStoreKey, OIMScalarKeyTreeWalk, OIMCompositeKeyTreeWalk } from '@oimdb/core';

type Card = { id: string; title: string; rank: number };

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card>() });
const cards = cardService.createStoreSlot(db);

declare const pk: TOIMStoreKey;
declare const key: TOIMStoreKey;
declare const entity: Card;
declare const slot: TOIMEntitySlot<Card, TOIMStoreKey>;
declare const render: (card: Card | undefined) => void;
```

## Which one to build

| You have | Build | Why not the others |
|---|---|---|
| many entities of one type, each with its own key, and readers who must be woken | `createOIMSlotCollectionService({ keyOf })`, or the base layer by hand, then `createStoreSlot(db)` per collection | — |
| one record with no key — settings, a session | `createOIMSingleSlotService()`, its `createStoreSlot(db)` and an `writeSlotContentByKey` | a collection would make you invent a key and a store for one value — see [Standalone records](/docs/core/object) |
| a value computed from entities | a computed — see [Computed and effects](/docs/core/computed-effects) | an entity is written by you; a computed is written only by its derive |
| "which entities belong to group X" | an index or a bucket collection — see [Indexes](/docs/core/oimindex) and [Buckets](/docs/core/indexes) | a collection keeps no membership list of its own |

The entity collection is built around one rule: a key is resolved to an
identity once, and everything after that works through the identity. An effect,
a column subscription, an index bucket and a composite key all hold the slot
object, never the key. So a write never has to look up a subscriber, and the
same key always resolves to the same object for as long as anything refers to it.

## Building one

`createOIMSlotCollectionService(options)` is the convenience door. Its options are `slotContentService`
(required), `slotStoreService` (a Map store when left out; a tree store for a composite key),
`slotReleasePolicy`, `slotSubscriptionListener`, `defaults`, and `columnSlotStoreService` or `columnNames`. Each
optional one falls back to `defaults`, then to the built-in default.

```typescript
const archiveService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card>(), slotReleasePolicy: OIMSlotNeverReleasePolicy.INSTANCE });
const archive = archiveService.createStoreSlot(db);
```

The base layer it wraps is two calls:

```typescript
const baseCardService = createOIMSlotCollectionService({
    slotContentService: createOIMEntityContentService<Card>(),
    slotStoreService: new OIMSlotMapStoreService<TOIMEntitySlot<Card, TOIMStoreKey>>(),
});
const baseCards = baseCardService.createStoreSlot(db);
```

Build from the base layer when the key is not a single scalar (a chain, see below) or when you need
a store of your own. Every option is a strategy picked once at construction, so nothing on the write
path branches on it:

| Option of `createOIMEntityContentService` | Default when left out | What it decides |
|---|---|---|
| `keyOf` | required for a key; left out for a single | how a key comes out of an entity |
| `slotStoreService` | a Map store; required for any other store, and for a single (`OIMSingleSlotStoreService.INSTANCE`) | how identities are filed in a store slot |
| `entityWriter` | `defaults.entityWriter`, then the in-place writer | how a write lands on the stored object — see [The two writers](/docs/core/writing#the-two-writers) |
| `columnSlotStoreService` | a shared map-driven store | where column slots live — see [Column slots](#column-slots) |
| `columnNames` | none | the column names, filed in an ordinal store — see [Naming the columns up front](#naming-the-columns-up-front) |
| `slotEmptinessPolicy` | "the entity is `undefined`" | what counts as "no value" — see [Emptiness is a strategy](#emptiness-is-a-strategy) |
| `slotReleasePolicy` | `defaults.slotReleasePolicy`, then `OIMSlotAtEmptyReleasePolicy.INSTANCE` | how long an identity stays filed — see [How long an identity stays](#how-long-an-identity-stays) |

Every factory also takes `defaults`, an `OIMDefaults` instance holding the strategies several factories
should share: the ones above, plus `slotStamp` (an `IOIMSlotStamp` whose `stamp(slot)` runs each time
emptiness is settled), `indexKeysService` (how per-index keys are kept on each slot — see
[the content-change hook](/docs/core/oimindex#the-content-change-hook-and-indexkeys)) and
`storeSlotListener`. A factory's own option wins over `defaults`, and a field `defaults` leaves out falls
back to the built-in default. Without `defaults` a factory uses `OIMDefaults.INSTANCE`, which is empty.

## A store aggregate

A store aggregate is a store slot together with the methods of its service that take that store slot
first, so a call no longer passes it. Build one over a store slot you have with
`service.createStoreAggregate(storeSlot)`, or build the service, the store slot and the aggregate in one
call with `createOIMSlotCollectionStoreAggregate(db, options)` or `createOIMSingleSlotStoreAggregate(db, options)`,
which take the options of `createOIMSlotCollectionService` / `createOIMSingleSlotService`. For a collection of entities,
`createOIMEntitySlotCollectionStoreAggregate<Card>(db, options?)` builds the entity content service too and takes its
options beside the collection's; a composite key goes through the general factory:

```typescript
import { createOIMSlotCollectionStoreAggregate } from '@oimdb/core';

const handStoreAggregate = createOIMSlotCollectionStoreAggregate(db, {
    slotContentService: createOIMEntityContentService<Card>(),
});
const handSlot = handStoreAggregate.writeSlotContentByKey('h1', { id: 'h1', title: 'Queen', rank: 12 });
handSlot.updateEntity({ rank: 13 });
handStoreAggregate.getSlotByKey('h1') === handSlot;   // true
handStoreAggregate.storeSlot;                         // what hooks, indexes and computeds take
```

The aggregate carries `storeSlot`, `slotService`, `slotContentService` and the store methods of its
service: `OIMWritableSlotCollectionStoreAggregate` the read, batch and `writeSlotContentByKey` methods,
`OIMWritableSingleSlotStoreAggregate` the single's read methods, `writeSingleSlotContent` and
`clearSingleSlotContent`, and `OIMSlotCollectionIndexStoreAggregate` (from an index service's
`createStoreAggregate(indexStoreSlot)`, or in one call from
`createOIMSlotCollectionIndexStoreAggregate(handStoreAggregate, { keyOf })`) the index reads as well. That factory takes the
options of `createOIMSlotCollectionIndexService` minus `entityService`, with the default bucket store; a sorted-array
index or a custom bucket store goes through its service. A method that takes a slot, such as
`updateEntity`, stays on its service. The one-call factories build a new service each time; for many
store slots of one type, build the service once and call `createStoreAggregate` on it.

`createOIMEntitySlotCollectionStoreAggregate` returns an `OIMEntitySlotCollectionStoreAggregate`, which also
reads the whole collection with no index:

```typescript
import { createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';

const deckStoreAggregate = createOIMEntitySlotCollectionStoreAggregate<Card>(db);
deckStoreAggregate.writeSlotContentByKey('d1', { id: 'd1', title: 'Ace', rank: 1 });
deckStoreAggregate.writeSlotContentByKey('d2', { id: 'd2', title: 'Two', rank: 2 });
deckStoreAggregate.getEntities();      // [Ace, Two]
deckStoreAggregate.getEntityCount();   // 2
```

Both read the collection's list, `OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(storeSlot)`; see
[Reading the whole population](#reading-the-whole-population).

## Name the entity

`TEntity` types the whole surface: `writeSlotContentByKey` refuses anything that is not a card,
`updateEntity` takes a `Partial<Card>`, and `slot.entity` is `Card | undefined`. Note
the `undefined`: an identity outlives its value.

Naming it also makes the services **invariant** in it, on purpose: a function
that says it takes a collection of cards must not silently accept a collection of something else.
A helper over "any collection" is generic in the entity and takes a `Pick` of the collection service
with only the doors it calls, and the store slot — the shape `@oimdb/react` and `@oimdb/persist` take
— never annotated with `object` for the entity.

## Reads on the collection service, writes on the content service

Everything about a key is asked of the collection service, with the collection's store slot first:

```typescript signature
cardService.holdSlotByKey(cards, pk)                     // the slot; holdCount up by one
cardService.getSlotByKey(cards, pk)                      // TOIMEntitySlot, never undefined; mints on a miss and
                                                         // the unused-slot collector holds it for this turn
cardService.peekSlotByKey(cards, pk)                     // the slot or undefined; never mints
cardService.hasSlotContentByKey(cards, pk)               // false for a key nothing filed or an empty slot; never mints
cardService.getSlots(cards)                              // IterableIterator<TOIMEntitySlot>
cardService.getSlotCount(cards)                          // number
cardService.isSameKey(key, otherKey)                     // what the store means by one key
slot.unholdSlot()                              // give one hold back; the owner then asks whether it may go
```

The by-key write is the collection's; the slot writes are the content service's, `cardService.slotContentService`:

```typescript signature
cardService.writeSlotContentByKey(cards, key, entity, changed?)  // mints if there is none; always returns the slot
cardService.peekSlotByKey(cards, key)?.entity                    // the entity or undefined; never mints
const cardContentService = cardService.slotContentService;
slot.updateEntity(patch)                     // a door handed a slot takes no store slot
```

A door that works on one slot it is handed (`updateEntity`, `writeSlotContent`,
`updateEntityColumn`, `deleteEntityColumns`, `markEntityChanged`, `clearSlotContent`) takes no store slot:
the slot carries the store slot it is filed in. The one by-key write is the whole-value `writeSlotContentByKey`.

`hasSlotContentByKey` is the key question that files nothing: it looks the key
up, and answers from `isOIMSlotEmpty(slot)` when there is a slot. Use it for "is there a
value" where a mint would be wasted work.

`writeSlotContentByKey` is **total**: the slot comes back whatever the write changed. Its
optional last argument is a caller-owned array that it appends the slot to
exactly when the content that landed was different. See
[Writing](/docs/core/writing#which-entities-actually-changed).

No door releases on demand. `releaseSlotIfUnheld(slot)` is
public, because the release queue calls it through `slot.owner`, but it is a guard:
whether an identity may go is the owner's question, re-evaluated every time from the
hold count, whether the slot is already released, whether this owner owns it,
whether a column slot is still filed on it, and then from the
`slotReleasePolicy`.

The store is carried by the store slot (`cards.store`), and only the services
read or write it. You pass the slot store service at construction, and from
then on every store it creates belongs to that collection type.

## Reserving a key nothing has written yet

`holdSlotByKey` is one of the four minting doors. Use it when you want to
watch a key whose value has not arrived:

```typescript
const reserved = cardService.holdSlotByKey(cards, 'c2');    // the identity exists; entity is undefined
const effect = effectService.createEffect(db, () => {
    render(reserved.entity);                   // undefined, then the card
}, [reserved]);

cardService.writeSlotContentByKey(cards, 'c2', { id: 'c2', title: 'Two', rank: 2 });
db.flush();

effectService.disposeEffect(effect);
reserved.unholdSlot();               // give the counted reference back
```

**Giving it back is your job.** The count alone keeps the identity alive,
so a hold you forget to give back keeps its slot for the life of the collection.
`unholdSlot` on a slot whose `holdCount` is already `0` throws by name.

For an identity somebody else resolved and handed you, the same act is
`slot.holdSlot()` / `slot.unholdSlot()`. When you only need the
identity for the turn you are in, `getSlotByKey` hands it to the
unused-slot collector instead, and the next `db.flush()` gives that hold
back for you.

## Scalar keys

`OIMSlotMapStoreService<TSlot, TKey = TOIMStoreKey>` files by one key, and
`TOIMStoreKey` is `string | number`. It is a `Map`, and it files by SameValueZero:
`NaN` finds `NaN`, `0` and `-0` are one key, `1` and `'1'` are two. `isOIMSameValueZero`
applies the same rule if you need to compare two scalar keys yourself.

## Composite keys come in two strategies, and you pick one

```typescript setup
import {
    OIMDefaults,
    OIMSlotTreeStoreService,
    createOIMSlotCollectionIndexService,
    type TOIMSlotStoreTree,
} from '@oimdb/core';

type User = { id: string; name: string };
type Group = { id: string; title: string };

declare const alice: TOIMEntitySlot<User, TOIMStoreKey>;
declare const admins: TOIMEntitySlot<Group, TOIMStoreKey>;
```

A composite key is a **chain of composite key parts**, descended with one `Map` lookup per
composite key part. One store files it, `OIMSlotTreeStoreService`, and the **descent you pass to
its constructor** decides what your key MEANS. This is a fork, not a default with
an escape hatch: you choose the walk once, statically, and nothing branches on it
at run time.

| Walk | Key | What keeps a branch |
|---|---|---|
| `OIMScalarKeyTreeWalk.INSTANCE` | `readonly TOIMStoreKey[]` — a chain of **values** | the subtree under it, and nothing else |
| `OIMCompositeKeyTreeWalk.INSTANCE` | `readonly TOIMEntitySlot[]` — a chain of **identities** | that, plus a counted hold on each composite key part |

Both keep order significant and prefixes apart: `[a]` and `[a, b]` are different
keys. Both keep each composite key part's own type, so `1` and `'1'` are two composite key parts.
Under both, the store files a **copy** of the array (`slot.key` is a slice), so
refilling the array you resolved a key from moves nothing, and a rebuilt array of
the same parts resolves to the same slot. An empty array is refused at the mint:
`OIMKeyTreeWalk: an empty key is not a key.`

### A chain of values

`['deck-1', 'red']`, `['board-1', 'card-7']`. Nothing is held, because there is
nothing to hold: nobody files `'red'`, nobody can release it, and a level's `Map`
answers for a rebuilt `'red'` exactly as it answered for the first. A branch goes
at the instant nothing is left below it.

```typescript
type TScalarChain = readonly TOIMStoreKey[];
type Tally = { deck: string; day: string; count: number };
type TTallyStore = TOIMSlotStoreTree<TOIMEntitySlot<Tally, TScalarChain>, TOIMStoreKey>;

const tallyService = createOIMSlotCollectionService<ReturnType<typeof createOIMEntityContentService<Tally, TScalarChain>>, TTallyStore>({
    slotContentService: createOIMEntityContentService<Tally, TScalarChain>(),
    slotStoreService: new OIMSlotTreeStoreService<TOIMStoreKey, TOIMEntitySlot<Tally, TScalarChain>>(
        OIMScalarKeyTreeWalk.INSTANCE,
    ),
});
const tallies = tallyService.createStoreSlot(db);

tallyService.writeSlotContentByKey(tallies, ['spades', 'mon'], { deck: 'spades', day: 'mon', count: 1 });
tallyService.getSlotByKey(tallies, ['spades', 'mon']);
```

You do **not** get the other strategy's guarantee: a name here is only a name.
A collection keyed by `[userId, cardId]` as strings has no edge into the users
collection, so removing user `u1` is invisible to these keys — the entities stay
filed at `['u1', …]`.

### A chain of identities

Each edge holds the identity it is keyed by, so deleting a user while a
chain-keyed slot is still addressed by that user leaves the user's identity in
place, and resolving that key again returns the same object. The hold is per
**edge**, not per key: two keys sharing the prefix `[alice]` hold `alice` once,
and the hold is given back when the last key through that edge goes.

Take this walk when a key part is itself an entity that can be deleted or
re-fetched and the composite slot must keep pointing at the same identity; take
the chain of values when the parts are plain names and nothing needs to outlive
anything.

**A scalar is not a valid composite key part for this walk.** It is a compile error, and
if you force it past a cast it throws a `TypeError` inside the mint (the walk calls
`part.holdSlot()`, and a string has no `owner`) with the edge already
in the tree. Use the scalar walk above, never a cast.

```typescript
type Enrollment = {
    user: TOIMEntitySlot<User, TOIMStoreKey>;
    group: TOIMEntitySlot<Group, TOIMStoreKey>;
    since: number;
};
type TChain = readonly TOIMEntitySlot[];
type TEnrollmentStore = TOIMSlotStoreTree<TOIMEntitySlot<Enrollment, TChain>, TOIMEntitySlot>;

const enrollmentService = createOIMSlotCollectionService<ReturnType<typeof createOIMEntityContentService<Enrollment, TChain>>, TEnrollmentStore>({
    slotContentService: createOIMEntityContentService<Enrollment, TChain>(),
    slotStoreService: new OIMSlotTreeStoreService<TOIMEntitySlot, TOIMEntitySlot<Enrollment, TChain>>(
        OIMCompositeKeyTreeWalk.INSTANCE,
    ),
});
const enrollments = enrollmentService.createStoreSlot(db);

enrollmentService.writeSlotContentByKey(enrollments, [alice, admins], { user: alice, group: admins, since: 2026 });
enrollmentService.getSlotByKey(enrollments, [alice, admins]);
```

### Comparing two chains

`isOIMSameSlotSequence` compares two lists of slots by reference, so it suits a chain
of identities. `isOIMSameKeySequence` compares two lists of keys, or two chains of values,
each key by SameValueZero, the way a `Map` files it. To compare two keys of a collection, ask its
collection service: `cardService.isSameKey(key, otherKey)`, which takes no store slot. A key is never
encoded into a string: the tree descends one composite key part at a time, so `['a b']` and
`['a', 'b']` are different keys.

## How a collection is keyed is the store's business

The key's shape is what `TKey` carries and what the store is built from:
`OIMSlotMapStoreService` for one value, `OIMSlotTreeStoreService` for a chain, given
`OIMScalarKeyTreeWalk.INSTANCE` for a chain of values or
`OIMCompositeKeyTreeWalk.INSTANCE` for a chain of identities. Pass the store you want as `slotStoreService`.
A single has no key: `createOIMSingleSlotService` files its one slot in `OIMSingleSlotStoreService` itself.

Each keyed one is an `IOIMSlotStoreService<TKey, TSlot, TStore>`: a stateless, Map-like service with
`createStore`, `set(store, slot)` and `delete(store, slot)` (from `IOIMSlotFilingService`; the slot carries its
key), `ownKey`, `isSameKey`, `get(store, key)`, `getSlots` and `getSlotCount`.
`ownKey(key)` is the key a new slot is minted with: the key itself for the map store, a copy of the
composite key for the tree store. To file slots your own way, implement that interface and pass it
as `slotStoreService`.

## Emptiness is a strategy

The slot's EMPTY flag (`isOIMSlotEmpty(slot)`) is settled once per write by the injected `IOIMSlotEmptinessPolicy`,
never recomputed at the read. An entity content service's default is
"the entity is `undefined`" — "the entity is `undefined`". `hasSlotContentByKey`,
the population walk below and the release policy all read that one flag.

Inject your own when "no value" means more than `undefined` — a soft delete, a
tombstone your server sends:

```typescript
type Post = { id: string; title: string; deleted: boolean };
type PostSlot = TOIMEntitySlot<Post, TOIMStoreKey>;

const softDeleted: IOIMSlotEmptinessPolicy<PostSlot> = {
    isEmpty: (slot) => slot.entity === undefined || slot.entity.deleted,
};

const postService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Post>({ slotEmptinessPolicy: softDeleted }), slotReleasePolicy: OIMSlotNeverReleasePolicy.INSTANCE });
const posts = postService.createStoreSlot(db);

postService.writeSlotContentByKey(posts, 'p1', { id: 'p1', title: 'Draft', deleted: true });
db.flush();
postService.hasSlotContentByKey(posts, 'p1');   // false
postService.getSlotCount(posts);                // 1
```

**An empty answer is a release question.** Under the default
`OIMSlotAtEmptyReleasePolicy`, an empty slot nothing holds is unfiled — at once
for a write onto a filed slot, at the next flush for a fresh mint, which the
unused-slot collector holds until then. That is why the example above names
`OIMSlotNeverReleasePolicy`: without it `getSlotCount(posts)` would be `0` after the
flush and the stored post would be unreachable. Hold the key, or pick a policy
that keeps empty slots, when an "empty" entity still has to be read.

## How long an identity stays

`slotReleasePolicy` answers one question for every slot of the collection type: once
nothing holds it and nothing references it, may it go? With none named, it is
`OIMSlotAtEmptyReleasePolicy.INSTANCE`: an identity with a value stays, an empty one goes.

The policies, when to take each, their options and how the deadlines combine are on
[releasing an identity on a clock](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).
The rule they all follow is in [The model](/docs/core/model#a-slot-goes-when-nothing-refers-to-it):
there is no release call; a slot goes when its holds, its column slots and the
policy all agree.

## Column slots

An entity or bucket collection's column slots are woken by the writes that change
their column; a computed's column slots are derived from it (see
[Computed columns](/docs/core/computed-effects#computed-columns)). Both are one class,
`OIMColumnSlot`: the entity's owner pushes a change into it, the computed's owner pulls it.
The doors are on an entity slot and on a computed's slot — `slot.getColumnSlot(columnName)`, `slot.holdColumnSlot(columnName)`,
`slot.getColumnGroupSlot(group)`, `slot.holdColumnGroupSlot(group)`, `slot.getAnyColumnSlot()`, `slot.holdAnyColumnSlot()` — and
on the service's `columnSlotService` for any slot, which takes the slot first: `holdColumnSlot(slot, columnName)` / `unholdColumnSlot(columnSlot)`,
`getColumnSlot(slot, columnName)`, `getColumnGroupSlot(slot, group)`, `holdColumnGroupSlot(slot, group)`,
`getAnyColumnSlot(slot)` and `holdAnyColumnSlot(slot)`. A single entity's are the same on its slot:
`settingsService.getSingleSlot(settings).getColumnSlot('theme')`.
With `columnNames` named the column slots sit in an array by ordinal, otherwise in a Map.
`getColumnSlot` takes no hold: a column slot it mints is held by the unused-slot collector
until the end of the next flush, like any getter's mint. An index's bucket column slots are the bucket
collection's own.

A column slot is a `TOIMColumnSlot` — a slot with `key` (the column name), `carrierSlot` and
`value`. It is what an effect subscribes to so that a write to `title` does not wake a reader
of `rank`:

```typescript
const card = cardService.holdSlotByKey(cards, 'c1');
const rank = card.holdColumnSlot('rank');
const onRank = effectService.createEffect(db, () => render(card.entity), [rank]);

effectService.disposeEffect(onRank);
rank.unholdSlot();
card.unholdSlot();
```

### What a column slot's value is

`columnSlot.value` reads the carrier's state that the column stands for:

| Column slot | `value` |
|---|---|
| an entity's column `'title'` | `entity.title` |
| an entity's any-column slot | the entity |
| an entity's column group | the fields of the group, in the group's sorted name order (`createOIMColumnGroup` sorts) |
| a bucket's column `'title'` | an array of `title` across the members, in bucket order (a Set bucket's order is insertion order) |
| a bucket's column group | one array per member, `[[m1.a, m1.b], [m2.a, m2.b]]` |
| a bucket's any-column slot | the members' entities |
| a computed's column `'top'` | `value.top` of the computed |

The value is cached, and an array value keeps its identity while its elements stay equal
one by one, so a view that compares by reference re-renders only when a field it shows moved.
A tracked read of `.value` — inside a source-tracking effect or computed — subscribes to the
column only, not to its carrier. Reading `.value` of a released column slot throws.

```typescript
import { createOIMColumnGroup } from '@oimdb/core';

const grouped = createOIMColumnGroup<keyof Card>(['title', 'rank']);
const groupedCardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card>(), columnGroups: [grouped] });
const groupedCards = groupedCardService.createStoreSlot(db);
groupedCardService.writeSlotContentByKey(groupedCards, 'c1', { id: 'c1', rank: 1, title: 'Ace' });
const groupedCard = groupedCardService.holdSlotByKey(groupedCards, 'c1');
groupedCard.holdColumnSlot('title').value;           // 'Ace'
groupedCard.holdColumnGroupSlot(grouped).value;      // [1, 'Ace'], rank before title
```

Which columns a write wakes: a put or a patch wakes the columns the writer reports as
changed; a first fill and a clear wake the columns the value has with a value
other than `undefined`; `markEntityChanged(slot)` with no names wakes every filed
column. Only a column somebody minted exists: a slot with no column slots has no
`columnSlotStore`, and a write to it asks nothing about columns; on a slot that
has some, a write costs one lookup per changed name.

**A filed column slot keeps its carrier.** While any column slot is filed on a
slot, the release guard refuses and the slot is not released. A column slot is unfiled when its
last hold and its last effect are both gone; unfiling the last column slot of a carrier drops its
`columnSlotStore`, and every unfile asks the carrier's owner whether the carrier
may go now.

### The any-column slot

`getAnyColumnSlot(slot)` / `holdAnyColumnSlot(slot)` mint a column slot that wakes on any column
write to its carrier, where `holdColumnSlot` wakes on one named column. Give it back with
`unholdColumnSlot`.

```typescript
const anyColumnCard = cardService.holdSlotByKey(cards, 'c1');
const anyColumn = anyColumnCard.holdAnyColumnSlot();
const onAnyColumn = effectService.createEffect(db, () => render(anyColumnCard.entity), [anyColumn]);

effectService.disposeEffect(onAnyColumn);
anyColumn.unholdSlot();
anyColumnCard.unholdSlot();
```

### Column groups

A column group is one column slot standing for several columns, for a view that
renders `rank` and `title` and should wake once when either changes. The group is
made with `createOIMColumnGroup` and declared on the service with the `columnGroups` option:

```typescript
import { createOIMColumnGroup } from '@oimdb/core';

const rendered = createOIMColumnGroup<keyof Card>(['rank', 'title']);
const renderedCardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card>(), columnGroups: [rendered] });
const renderedCards = renderedCardService.createStoreSlot(db);
const card = renderedCardService.holdSlotByKey(renderedCards, 'c1');
const renderedOfCard = card.holdColumnGroupSlot(rendered);
const onRendered = effectService.createEffect(db, () => render(card.entity), [renderedOfCard]);

effectService.disposeEffect(onRendered);
renderedOfCard.unholdSlot();
card.unholdSlot();
```

`createOIMColumnGroup(columnNames)` returns a frozen `TOIMColumnGroup<TColumnName>` — `{ key, columnNames }`,
the names deduplicated and sorted — and throws on an empty list (a slot that hears every column is
the any-column slot). Make it once, next to the service, and reuse that object.
`holdColumnGroupSlot` and `getColumnGroupSlot` take only a group named in `columnGroups` and throw
for any other; with `columnNames` set, a group naming a column outside them throws when the
service is constructed. A write wakes the group's slot once if it changes any of its columns and
not at all if it changes only others. A tracked read through `slot.getEntity(group)` needs no
declaration: any group from `createOIMColumnGroup` works there.

### Naming the columns up front

```typescript
const namedCardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card>(), columnNames: ['rank', 'title'] });
const namedCards = namedCardService.createStoreSlot(db);
```

With `columnNames`, each entity's column slots sit in an array by column
number (`OIMColumnSlotOrdinalStoreService`) instead of a `Map` per entity. Creating
and giving back an entity's store costs less, which is what a scrolling
view pays for every entity that enters and leaves it. `holdColumnSlot` and `columnGroups`
are typed on the named columns, and a slot for any other column throws. Without
`columnNames`, the store is `columnSlotStoreService` — a shared map-driven store by default — and any
name is accepted. The option is on every factory (entity, bucket, index), keyed or single.

The entity slot carries the names in its type, `TOIMEntitySlot<TEntity, TKey, TColumnName>`, so
`slot.getColumnSlot(name)` and `slot.holdColumnSlot(name)` take only a named column:
`createOIMEntitySlotCollectionStoreAggregate<Card, 'title'>(db, { columnNames: ['title'] })` makes
`slot.getColumnSlot('rank')` a type error. TypeScript infers no type argument once one is given, so with `Card`
written out, spell the names in the type arguments too; without them every column of `Card` is accepted.

Subscribing to columns is covered in
[Reading and subscribing](/docs/core/reading-subscribing#subscribing-to-one-column).

## A collection is not a slot to subscribe to

A collection's store slot is not a slot: it has no owner, no hold count and no effects,
so it is never held or subscribed, and no write announces it. "An entity joined or left the
collection" is its list, `OIMSlotCollectionBucketService.INSTANCE.holdBucketSlot(cards)`: a bucket slot of every
slot that holds an entity, written when an entity arrives or goes:

```typescript
const everyCard = OIMSlotCollectionBucketService.INSTANCE.holdBucketSlot(cards);
const stopEveryCard = effectService.createEffect(db, () => { /* a card joined or left */ }, [everyCard]);
```

For one part of the population — a deck, a status — use an index and subscribe to the bucket of its key
(see [Indexes](/docs/core/oimindex)). A collection-wide subscription to content would be woken by every
write to every entity, and its reader would then have to find out which one moved. A bucket is woken
only when its membership changes, and it already holds the slots in it.

## Reading the whole population

`OIMSlotCollectionBucketService.INSTANCE` has two doors to the collection's list of every slot that holds an
entity, like `getSlotByKey` and `holdSlotByKey`:

- `getBucketSlot(cards)`: the list. When nothing holds it, the unused-slot collector holds it until the
  flush and then gives it back; the next read builds it again.
- `holdBucketSlot(cards)`: `getBucketSlot` plus `holdSlot()`; held until `bucketSlot.unholdSlot()`.

Both return a `TOIMCollectionBucketSlot`, which is read-only: `getBucketMemberSlots`, `getBucketMemberSlotCount`,
`hasBucketMemberSlot`, `holdSlot`, `unholdSlot`. The list is built by walking the store once, then kept in step
on every fill and clear while it lives, so a collection nobody asks pays nothing for it.
Its column slots — `getBucketColumnSlot(cards, columnName)`, `holdBucketColumnSlot(cards, columnName)`,
`getAnyBucketColumnSlot(cards)`, `holdAnyBucketColumnSlot(cards)` on the same service — are an index bucket's
kind: their `value` is that column (or the entity) across the members, and they wake on a member's write to it
and on a member joining or leaving.
`getOIMBucketMemberSlotEntities(bucketSlot.getBucketMemberSlots())` reads the entities of the members:

```typescript
const population = OIMSlotCollectionBucketService.INSTANCE.holdBucketSlot(cards);
population.getBucketMemberSlotCount();                              // how many cards hold an entity
getOIMBucketMemberSlotEntities(population.getBucketMemberSlots());      // the cards
population.unholdSlot();

cardService.getSlotCount(cards);                                    // how many ids are filed, empty ones included
```

The order: while the list is alive, entities come in the order they got data, and one cleared and filled
again goes last. A list built afresh (the first read, or after it was given back) follows the order the
slots were created in the collection, and a read with no data creates a slot too. So after a held entity is
cleared and refilled, or a key read before its first write, the two orders differ. For a strict order, sort:
`createOIMSortedCollectionSingleSlotStoreAggregate(entitySlotCollectionStoreAggregate, { sortColumns })` sorts the whole collection
with no index (see [The order of a bucket is a derivation](/docs/core/computed-effects#the-order-of-a-bucket-is-a-derivation)).
The list does not hold its members: an entity goes by the collection's release policy even while the list is
read, and leaves the list when it is released. An entity a tracked reader shows is held by that reader's
effect, so it stays.

The list has column slots: `getBucketColumnSlot(cards, columnName)` / `holdBucketColumnSlot(cards, columnName)` and
`getAnyBucketColumnSlot(cards)` / `holdAnyBucketColumnSlot(cards)` on `OIMSlotCollectionBucketService.INSTANCE` return a
column slot that wakes when a member's write changes that column (any column). They are registered on first ask
and released with the list.

`getSlots(cards)` walks every slot the store has filed, in store order, empty ones included:

```typescript
for (const slot of cardService.getSlots(cards)) {
    if (isOIMSlotEmpty(slot)) continue;
    render(slot.entity);
}
```

An empty slot is filed only while something keeps it — a hold, a column slot,
the unused-slot collector until the next flush — or under a policy that keeps
empty slots, such as `OIMSlotNeverReleasePolicy`. See
[Emptiness is a strategy](#emptiness-is-a-strategy) for what decides `isOIMSlotEmpty(slot)`.

To have that answer maintained and subscribable instead of walked, declare an
index keyed on the entity's own id:

```typescript
const byIdService = createOIMSlotCollectionIndexService({
    entityService: cardService,
    keyOf: (card: Card) => card.id,
});
const byId = byIdService.createIndexStoreSlot(cards);

const bucket = byIdService.holdSlotByKey(byId, 'c1');   // maintained from here until the last give-back
effectService.createEffect(db, () => { /* this entity joined or left */ }, [bucket]);
```

An index's bucket carries a lifetime its consumer injects — a
`slotReleasePolicy` — so how long the answer outlives its last
reader is the consumer's to say, not the entity collection's.

## Where to next

<DocCards>
<DocCard to="/docs/core/writing" title="Writing">Every write and both writers.</DocCard>
<DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">Effects and columns.</DocCard>
<DocCard to="/docs/core/channel" title="The channel: frames and batches">How frames deliver writes.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">Slot lists you compose.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">A slot list that fills itself.</DocCard>
<DocCard to="/docs/core/object" title="Standalone records">The single entity, the keyless half of the pair.</DocCard>
</DocCards>
