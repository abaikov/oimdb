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
import {
    OIMDB,
    OIMEffectService,
    OIMSlotReleasePolicyNever,
    OIMSlotStoreServiceMapDriven,
    createOIMEntityService,
    createOIMSlotCollectionService,
    createOIMSlotContentEntityService,
    oimIsSlotEmpty,
    type IOIMSlotEmptiness,
    type TOIMEntitySlot,
    type TOIMStoreKey,
} from '@oimdb/core';

type Card = { id: string; title: string; rank: number };

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
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
| many entities of one type, each with its own key, and readers who must be woken | `createOIMEntityService(db, { keyOf })`, or the base layer by hand, then `createStoreSlot(db)` per collection | — |
| one record with no key — settings, a session | `createOIMSingleEntityService(db)`, its `createStoreSlot(db)` and an `upsertEntity` | a collection would make you invent a key and a store for one value — see [Standalone records](/docs/core/object) |
| a value computed from entities | a computed — see [Computed and effects](/docs/core/computed-effects) | an entity is written by you; a computed is written only by its derive |
| "which entities belong to group X" | an index or a bucket collection — see [Indexes](/docs/core/oimindex) and [Buckets](/docs/core/indexes) | a collection keeps no membership list of its own |

The entity collection is built around one rule: a key is resolved to an
identity once, and everything after that works through the identity. An effect,
a column subscription, an index bucket and a composite key all hold the slot
object, never the key. So a write never has to look up a subscriber, and the
same key always resolves to the same object for as long as anything refers to it.

## Building one

`createOIMEntityService(db, options)` is the convenience door. Its options are `keyOf` (required),
`entitySlotStoreService` (a Map store when left out; a tree store for a composite key),
`entityWriter`, `slotEmptiness`, `slotReleasePolicy`, and `columnSlotStoreService` or `columnNames`. Each
optional one falls back to the `OIMDB`'s value, then to the `OIMDefaults` entry.

```typescript
const archiveService = createOIMEntityService<Card>(db, {
    keyOf: (card) => card.id,
    slotReleasePolicy: OIMSlotReleasePolicyNever.INSTANCE,
});
const archive = archiveService.createStoreSlot(db);
```

The base layer it wraps is two calls:

```typescript
const baseCardService = createOIMSlotCollectionService({
    slotContentService: createOIMSlotContentEntityService<Card>(db, {
        keyOf: (card) => card.id,
        slotStoreService: new OIMSlotStoreServiceMapDriven<TOIMEntitySlot<Card, TOIMStoreKey>>(),
    }),
});
const baseCards = baseCardService.createStoreSlot(db);
```

Build from the base layer when the key is not a single scalar (a chain, see below) or when you need
a store of your own. Every option is a strategy picked once at construction, so nothing on the write
path branches on it:

| Option of `createOIMSlotContentEntityService` | Default when left out | What it decides |
|---|---|---|
| `keyOf` | required for a key; left out for a single | how a key comes out of an entity |
| `slotStoreService` | a Map store; required for any other store, and for a single (`OIMSlotStoreServiceSingleSlotDriven.INSTANCE`) | how identities are filed in a store slot |
| `entityWriter` | the db's, then `OIMDefaults.ENTITY_WRITER.getValue()` | how a write lands on the stored object — see [The two writers](/docs/core/writing#the-two-writers) |
| `columnSlotStoreService` | `OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue()` | where column slots live — see [Column slots](#column-slots) |
| `columnNames` | none | the column names, filed in an ordinal store — see [Naming the columns up front](#naming-the-columns-up-front) |
| `slotEmptiness` | `OIMDefaults.ENTITY_SLOT_EMPTINESS.getValue()` | what counts as "no value" — see [Emptiness is a strategy](#emptiness-is-a-strategy) |
| `slotReleasePolicy` | the db's, then `OIMSlotReleasePolicyAtEmpty.INSTANCE` | how long an identity stays filed — see [How long an identity stays](#how-long-an-identity-stays) |

Two more strategies are the db's, for every collection of it: `slotStamp` (an `IOIMSlotStamp` whose
`stamp(slot)` runs each time emptiness is settled) and `indexKeysService` (how per-index keys are kept on
each slot — see [the content-change hook](/docs/core/oimindex#the-content-change-hook-and-indexkeys)).

The `OIMDefaults` entries are `OIMDefaultValue`s: the first `getValue()` mints the
shared instance and closes the matching `setValue`, which throws by name if you try
to replace the default afterwards. Replace a default at startup or not at all.

## Name the entity

`TEntity` types the whole surface: `upsertEntity` refuses anything that is not a card,
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
cardService.findSlotByKey(cards, pk)                     // the slot or undefined; never mints
cardService.hasSlotContentByKey(cards, pk)               // false for a key nothing filed or an empty slot; never mints
cardService.getSlots(cards)                              // IterableIterator<TOIMEntitySlot>
cardService.getSlotCount(cards)                          // number
cardService.isSameKey(key, otherKey)                     // what the store means by one key
slot.owner.unholdSlot(slot)                              // give one hold back; the owner then asks whether it may go
```

The writes are the content service's, `cardService.slotContentService`:

```typescript signature
const cardContentService = cardService.slotContentService;
cardContentService.upsertEntity(cards, entity, changed?)      // mints if there is none; always returns the slot
cardContentService.insertEntity(cards, pk, entity, changed?)  // the same under a key you name
cardContentService.findEntityByKey(cards, key)                // the entity or undefined; never mints
cardContentService.updateEntity(slot, patch)                  // a door handed a slot takes no store slot
```

A door that works on one slot it is handed (`updateEntity`, `writeEntity`,
`updateEntityColumn`, `deleteEntityColumns`, `markEntityChanged`, `deleteEntity`) takes no store slot:
the slot carries the store slot it is filed in. There are no by-key write doors.

`hasSlotContentByKey` is the key question that files nothing: it looks the key
up, and answers from `oimIsSlotEmpty(slot)` when there is a slot. Use it for "is there a
value" where a mint would be wasted work.

`upsertEntity` and `insertEntity` are **total**: the slot comes back whatever the write changed. Their
optional last argument is a caller-owned array that they append the slot to
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
const effect = effectService.createEffect(db, [reserved], [], () => {
    render(reserved.entity);                   // undefined, then the card
});

cardService.slotContentService.upsertEntity(cards, { id: 'c2', title: 'Two', rank: 2 });
db.flush();

effectService.disposeEffect(effect);
reserved.owner.unholdSlot(reserved);               // give the counted reference back
```

**Giving it back is your job.** The count alone keeps the identity alive,
so a hold you forget to give back keeps its slot for the life of the collection.
`unholdSlot` on a slot whose `holdCount` is already `0` throws by name.

For an identity somebody else resolved and handed you, the same act is
`slot.owner.holdSlot(slot)` / `slot.owner.unholdSlot(slot)`. When you only need the
identity for the turn you are in, `getSlotByKey` hands it to the
unused-slot collector instead, and the next `db.flush()` gives that hold
back for you.

## Scalar keys

`OIMSlotStoreServiceMapDriven<TSlot, TKey = TOIMStoreKey>` files by one key, and
`TOIMStoreKey` is `string | number`. It is a `Map`, and it files by SameValueZero:
`NaN` finds `NaN`, `0` and `-0` are one key, `1` and `'1'` are two. `oimSameValueZeroGuard`
applies the same rule if you need to compare two scalar keys yourself.

## Composite keys come in two strategies, and you pick one

```typescript setup
import {
    OIMDefaults,
    OIMSlotStoreServiceTreeDriven,
    createOIMIndexService,
    type TOIMSlotStoreTree,
} from '@oimdb/core';

type User = { id: string; name: string };
type Group = { id: string; title: string };

declare const alice: TOIMEntitySlot<User, TOIMStoreKey>;
declare const admins: TOIMEntitySlot<Group, TOIMStoreKey>;
```

A composite key is a **chain of composite key parts**, descended with one `Map` lookup per
composite key part. One store files it, `OIMSlotStoreServiceTreeDriven`, and the **descent you pass to
its constructor** decides what your key MEANS. This is a fork, not a default with
an escape hatch: you choose the walk once, statically, and nothing branches on it
at run time.

| Walk | Key | What keeps a branch |
|---|---|---|
| `OIMDefaults.KEY_TREE_WALK_SCALAR` | `readonly TOIMStoreKey[]` — a chain of **values** | the subtree under it, and nothing else |
| `OIMDefaults.KEY_TREE_WALK_COMPOSITE` | `readonly TOIMEntitySlot[]` — a chain of **identities** | that, plus a counted hold on each composite key part |

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

const tallyService = createOIMSlotCollectionService({
    slotContentService: createOIMSlotContentEntityService<Tally, keyof Tally, TScalarChain, TTallyStore>(db, {
        slotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMStoreKey, TOIMEntitySlot<Tally, TScalarChain>>(
            OIMDefaults.KEY_TREE_WALK_SCALAR.getValue(),
        ),
        keyOf: (t) => [t.deck, t.day],   // the two names, in order
    }),
});
const tallies = tallyService.createStoreSlot(db);

tallyService.slotContentService.upsertEntity(tallies, { deck: 'spades', day: 'mon', count: 1 });
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
`part.owner.holdSlot(part)`, and a string has no `owner`) with the edge already
in the tree. Use the scalar walk above, never a cast.

```typescript
type Enrollment = {
    user: TOIMEntitySlot<User, TOIMStoreKey>;
    group: TOIMEntitySlot<Group, TOIMStoreKey>;
    since: number;
};
type TChain = readonly TOIMEntitySlot[];
type TEnrollmentStore = TOIMSlotStoreTree<TOIMEntitySlot<Enrollment, TChain>, TOIMEntitySlot>;

const enrollmentService = createOIMSlotCollectionService({
    slotContentService: createOIMSlotContentEntityService<Enrollment, keyof Enrollment, TChain, TEnrollmentStore>(db, {
        slotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TOIMEntitySlot<Enrollment, TChain>>(
            OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue(),
        ),
        keyOf: (e) => [e.user, e.group], // the two identities, in order
    }),
});
const enrollments = enrollmentService.createStoreSlot(db);

enrollmentService.slotContentService.upsertEntity(enrollments, { user: alice, group: admins, since: 2026 });
enrollmentService.getSlotByKey(enrollments, [alice, admins]);
```

### Comparing two chains

`oimSameSlotSequence` compares two lists of slots by reference, so it suits a chain
of identities. `oimSameKeySequence` compares two lists of keys, or two chains of values,
each key by SameValueZero, the way a `Map` files it. To compare two keys of a collection, ask its
collection service: `cardService.isSameKey(key, otherKey)`, which takes no store slot. A key is never
encoded into a string: the tree descends one composite key part at a time, so `['a b']` and
`['a', 'b']` are different keys.

## How a collection is keyed is the store's business

The key's shape is what `TKey` carries and what the store is built from:
`OIMSlotStoreServiceMapDriven` for one value, `OIMSlotStoreServiceTreeDriven` for a chain, given
`OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()` for a chain of values or
`OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue()` for a chain of identities, and
`OIMSlotStoreServiceSingleSlotDriven.INSTANCE` for no key. Pass the store you want.

Each is an `IOIMSlotStoreService<TKey, TSlot, TStore>`: a stateless service with
`createStore`, `ownKey`, `isSameKey`, `get`, `set`, `remove`, `getSlots` and `getSlotCount`.
`ownKey(key)` is the key a new slot is minted with: the key itself for the map store, a copy of the
composite key for the tree store. To file slots your own way, implement that interface and pass it
as `slotStoreService`.

## Emptiness is a strategy

The slot's EMPTY flag (`oimIsSlotEmpty(slot)`) is settled once per write by the injected `IOIMSlotEmptiness`,
never recomputed at the read. An entity content service's default is
`OIMDefaults.ENTITY_SLOT_EMPTINESS.getValue()` — "the entity is `undefined`". `hasSlotContentByKey`,
the population walk below and the release policy all read that one flag.

Inject your own when "no value" means more than `undefined` — a soft delete, a
tombstone your server sends:

```typescript
type Post = { id: string; title: string; deleted: boolean };
type PostSlot = TOIMEntitySlot<Post, TOIMStoreKey>;

const softDeleted: IOIMSlotEmptiness<PostSlot> = {
    isEmpty: (slot) => slot.entity === undefined || slot.entity.deleted,
};

const postService = createOIMEntityService<Post>(db, {
    keyOf: (post) => post.id,
    slotEmptiness: softDeleted,
    slotReleasePolicy: OIMSlotReleasePolicyNever.INSTANCE,
});
const posts = postService.createStoreSlot(db);

postService.slotContentService.upsertEntity(posts, { id: 'p1', title: 'Draft', deleted: true });
db.flush();
postService.hasSlotContentByKey(posts, 'p1');   // false
postService.getSlotCount(posts);                // 1
```

**An empty answer is a release question.** Under the default
`OIMSlotReleasePolicyAtEmpty`, an empty slot nothing holds is unfiled — at once
for a write onto a filed slot, at the next flush for a fresh mint, which the
unused-slot collector holds until then. That is why the example above names
`OIMSlotReleasePolicyNever`: without it `getSlotCount(posts)` would be `0` after the
flush and the stored post would be unreachable. Hold the key, or pick a policy
that keeps empty slots, when an "empty" entity still has to be read.

## How long an identity stays

`slotReleasePolicy` answers one question for every slot of the collection type: once
nothing holds it and nothing references it, may it go? With none named, it is
`OIMSlotReleasePolicyAtEmpty.INSTANCE`: an identity with a value stays, an empty one goes.

The policies, when to take each, their options and how the deadlines combine are on
[releasing an identity on a clock](/docs/core/lifecycle#releasing-an-identity-on-a-clock--opt-in-and-off-it-costs-nothing).
The rule they all follow is in [The model](/docs/core/model#a-slot-goes-when-nothing-refers-to-it):
there is no release call; a slot goes when its holds, its column slots and the
policy all agree.

## Column slots

An entity or bucket collection's column slots are woken by the writes that change
their column; a computed's column slots are derived from it (see
[Computed columns](/docs/core/computed-effects#computed-columns)).
The doors are on the collection service:
`holdColumn(slot, columnName)` / `unholdColumn(columnSlot)`, `getColumn(slot, columnName)`,
`getColumnGroup(names)`, `holdColumnGroup(slot, group)`, `getAnyColumn(slot)` and `holdAnyColumn(slot)`;
a single entity's take its slot as well: `settingsService.getColumn(settingsService.getSingleSlot(settings), 'theme')`.
With `columnNames` named the column slots sit in an array by ordinal, otherwise in a Map.
`getColumn` takes no hold: a column slot it mints is held by the unused-slot collector
until the end of the next flush, like any getter's mint. An index's bucket column slots are the bucket
collection's own.

A column slot is a `TOIMColumnSlot` — a slot with `key` (the column name) and
`carrierSlot`. It holds no value; it is what an effect subscribes to so that a
write to `title` does not wake a reader of `rank`:

```typescript
const card = cardService.holdSlotByKey(cards, 'c1');
const rank = cardService.holdColumn(card, 'rank');
const onRank = effectService.createEffect(db, [rank], [], () => render(card.entity));

effectService.disposeEffect(onRank);
cardService.unholdColumn(rank);
card.owner.unholdSlot(card);
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

`getAnyColumn(slot)` / `holdAnyColumn(slot)` mint a column slot that wakes on any column
write to its carrier, where `holdColumn` wakes on one named column. Give it back with
`unholdColumn`.

```typescript
const anyColumnCard = cardService.holdSlotByKey(cards, 'c1');
const anyColumn = cardService.holdAnyColumn(anyColumnCard);
const onAnyColumn = effectService.createEffect(db, [anyColumn], [], () => render(anyColumnCard.entity));

effectService.disposeEffect(onAnyColumn);
cardService.unholdColumn(anyColumn);
anyColumnCard.owner.unholdSlot(anyColumnCard);
```

### Column groups

A column group is one column slot standing for several columns, for a view that
renders `rank` and `title` and should wake once when either changes:

```typescript
const rendered = cardService.getColumnGroup(['rank', 'title']);
const card = cardService.holdSlotByKey(cards, 'c1');
const renderedOfCard = cardService.holdColumnGroup(card, rendered);
const onRendered = effectService.createEffect(db, [renderedOfCard], [], () => render(card.entity));

effectService.disposeEffect(onRendered);
cardService.unholdColumn(renderedOfCard);
card.owner.unholdSlot(card);
```

`getColumnGroup` returns a frozen `TOIMColumnGroup` — `{ key, columnNames }`, the names
deduplicated and sorted. Get it once per view and reuse that object for every entity:
a group the store already knows by that object is filed without re-checking its key. A write
wakes the group's slot once if it changes any of its columns and not at all if
it changes only others.

### Naming the columns up front

```typescript
const namedCardService = createOIMEntityService<Card, 'rank' | 'title'>(db, {
    keyOf: (card) => card.id,
    columnNames: ['rank', 'title'],
});
const namedCards = namedCardService.createStoreSlot(db);
```

With `columnNames`, each entity's column slots sit in an array by column
number (`OIMColumnSlotStoreServiceOrdinalDriven`) instead of a `Map` per entity. Creating
and giving back an entity's store costs less, which is what a scrolling
view pays for every entity that enters and leaves it. `holdColumn` and `getColumnGroup`
are typed on the named columns, and a slot for any other column throws. Without
`columnNames`, the store is `columnSlotStoreService` — the shared map-driven
`OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue()` by default — and any
name is accepted. The option is on every factory (entity, bucket, index), keyed or single.

Subscribing to columns is covered in
[Reading and subscribing](/docs/core/reading-subscribing#subscribing-to-one-column).

## A collection is not a slot to subscribe to

A collection's store slot is not a slot: it has no owner, no hold count and no effects,
so it is never held or subscribed, and no write announces it. "Something in this population changed" is an index over the
collection and a subscription to its bucket, whose door is written when an entity
joins it or leaves it — or a content-change listener on the store slot
(`OIMContentChangeListenerService.INSTANCE.addContentChangeListener`, see
[the content-change hook](/docs/core/oimindex#the-content-change-hook-and-indexkeys)):

```typescript
const cardsByConstantService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (_card: Card) => 'all',
});
const cardsByConstant = cardsByConstantService.createIndexStoreSlot(cards);
const everyCard = cardsByConstantService.holdSlotByKey(cardsByConstant, 'all');
effectService.createEffect(db, [everyCard], [], () => { /* a card joined or left */ });
```

The reason: a collection-wide subscription would have to be woken by every write to
every entity, and its reader would then have to find out which one moved. A
bucket is woken only when its membership changes, and it already holds the
slots in it.

## Reading the whole population

A collection keeps no bucket of "every entity that holds a value". To read the
population, walk `getSlots(cards)` — every slot it has filed, in store order — and skip the
ones that hold nothing:

```typescript
cardService.getSlotCount(cards);                  // how many ids are filed, empty ones included

for (const slot of cardService.getSlots(cards)) {
    if (oimIsSlotEmpty(slot)) continue;
    render(slot.entity);
}
```

An empty slot is filed only while something keeps it — a hold, a column slot,
the unused-slot collector until the next flush — or under a policy that keeps
empty slots, such as `OIMSlotReleasePolicyNever`. See
[Emptiness is a strategy](#emptiness-is-a-strategy) for what decides `oimIsSlotEmpty(slot)`.

To have that answer maintained and subscribable instead of walked, declare an
index keyed on the entity's own id:

```typescript
const byIdService = createOIMIndexService(db, {
    entityService: cardService,
    keyOf: (card: Card) => card.id,
});
const byId = byIdService.createIndexStoreSlot(cards);

const bucket = byIdService.holdSlotByKey(byId, 'c1');   // maintained from here until the last give-back
effectService.createEffect(db, [bucket], [], () => { /* this entity joined or left */ });
```

An index's bucket carries a lifetime its consumer injects — a
`slotReleasePolicy` — so how long the answer outlives its last
reader is the consumer's to say, not the entity collection's.

## Where to next

<DocCards>
<DocCard to="/docs/core/writing" title="Writing">Every write and both writers.</DocCard>
<DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">Effects and columns.</DocCard>
<DocCard to="/docs/core/channel" title="The channel: frames and subframes">How frames deliver writes.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">Slot lists you compose.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">A slot list that fills itself.</DocCard>
<DocCard to="/docs/core/object" title="Standalone records">The single entity, the keyless half of the pair.</DocCard>
</DocCards>
