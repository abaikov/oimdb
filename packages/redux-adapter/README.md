# @oimdb/redux-adapter

Bridges `@oimdb/core` entity store slots and bucket store slots into a Redux store: create a
reducer from an entity collection service and its store slot, or from an index registration,
dispatch `OIMDB_UPDATE` once per frame when something that reducer watches actually moved, and
keep going from there.

```bash
npm install @oimdb/redux-adapter @oimdb/core redux
```

## How it tracks changes

Nothing is patched or wrapped. The adapter watches the same way everything else mirrors a population
outward: effects on each entity's or bucket's own identity, made with `OIMEffectService.INSTANCE` on
the `db` it was given as `channelMap`, settled once per frame through
`OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, …)`. An entity that never
moves is never touched, and a frame that touched nothing the adapter watches dispatches nothing.
Because nothing is wrapped, a store slot that is written to from anywhere (your own code, a
projection, a hydrating persistor) is mirrored the same way.

**How arrivals are discovered.** When a store slot is first registered, the adapter walks
`entityService.getSlots(entityStoreSlot)` once and watches every entity that holds a value. From then
on a content change listener it adds with
`OIMContentChangeListenerService.INSTANCE.addContentChangeListener(entityStoreSlot, listener, undefined)`
tells it, synchronously at the write, about every slot whose content moved, and it starts watching any
entity it has not seen before. Each entity it has already seen reports itself.

## A complete example

The examples on this page share this setup:

```typescript setup
import {
    OIMDB, OIMSlotContentBucketServiceSetDriven, createOIMBucketService, createOIMEntityService,
    type TOIMBucketSlotsSetStore, type TOIMEntitySlot, type TOIMStoreKey,
} from '@oimdb/core';
import { OIMReduxAdapter } from '@oimdb/redux-adapter';

type TUser = { id: string; name: string; teamId: string };
type TUserSlot = TOIMEntitySlot<TUser>;

const db = new OIMDB();
const userService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
const users = userService.createStoreSlot(db);

const createTeamBucketService = () => createOIMBucketService<
    TUserSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TUserSlot>, OIMSlotContentBucketServiceSetDriven<TUserSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TUserSlot>() });

const adapter = new OIMReduxAdapter({ channelMap: db });
```

`channelMap` is the `db`: an `OIMDB` is an `IOIMChannelMap`, and the adapter needs nothing from it
but its `defaultChannelSlot`, the channel its effects, its frame hook and its middleware's flush run on.

```typescript
import { createStore } from 'redux';
import type { TOIMReduxDefaultCollectionState } from '@oimdb/redux-adapter';

// The entity comes from the service. `TPk` is the caller's own declaration about the
// Redux state's key type (`string`, not `string | number`) and nothing else can hold it:
// a population addressed by a scalar is addressed by `TOIMStoreKey`.
const usersReducer = adapter.createCollectionReducer<
    TUser, string, TOIMReduxDefaultCollectionState<TUser, string>
>(userService, users);
const store = createStore(usersReducer);
adapter.setStore(store);

userService.slotContentService.upsertEntities(users, [
    { id: 'u1', name: 'Alice', teamId: 'eng' },
    { id: 'u2', name: 'Bob', teamId: 'design' },
]);
db.flush();

store.getState();
// { entities: { u1: {...}, u2: {...} }, ids: ['u1', 'u2'] }
```

`userService` is the collection service `createOIMEntityService` returns: its own doors read and
mint slots (`getSlots`, `getSlotByKey`, `holdSlotByKey`), and every write goes through its
`slotContentService` (`upsertEntities`, `updateEntity`, `deleteEntities`, …).

When no custom mapper is given, `createCollectionReducer` uses an RTK-Entity-Adapter-style default mapper
(`entities` + `ids`). A collection mapper is `(entityService, entityStoreSlot, updatedKeys, currentState)`.
The default reads through the service's own doors,
`entityService.getSlots(entityStoreSlot)` and `entityService.getSlotByKey(entityStoreSlot, pk)`, not the write surface.
The incremental path uses `getSlotByKey` and never `holdSlotByKey`. A hold is a
counted reference that the mapper would have to give back, while a read's mint goes to the
unused-slot collector and is given back at the next `flush()`. A key that reached that
loop may have just been removed, and the mint it costs lasts only until the end of the turn.

`createKeyedIndexReducer` and `createGlobalIndexReducer` do the equivalent for an index
addressed by a key and for one with a single bucket over the whole population. Both take a
small registration object instead of a bare index, because the adapter needs the
entity service and store slot the entities belong to: a raw entity pk has to be turned back into a slot.
Their mappers are `(keyedIndex, updatedKeys, currentState)` and `(globalIndex, currentState)`.

```typescript
import type {
    TOIMReduxDefaultGlobalIndexState, TOIMReduxDefaultIndexState,
    TOIMReduxGlobalIndex, TOIMReduxKeyedIndex,
} from '@oimdb/redux-adapter';

const byTeamService = createTeamBucketService();
const byTeam = byTeamService.createStoreSlot(db);

// The global index is ONE bucket held under a fixed key, in a bucket store slot
// of its own.
const everyUserService = createTeamBucketService();
const everyUserStoreSlot = everyUserService.createStoreSlot(db);
const everyUser = everyUserService.holdSlotByKey(everyUserStoreSlot, 'all');

// THE BUCKET'S SLOTS ARE PUSHED IN. A write to a user moves the value and files no
// bucket, so whoever writes the entity also says which team bucket it is in and
// which entities make up the whole-population bucket.
//
// Every id is resolved with a HOLD, and the hold is given back AFTER the write:
// minting by key is the only way to name an entity whose value has not arrived, and
// the holds the write leaves behind are what keep whatever joined.
function saveUser(user: TUser, everyone: readonly TUser[]): void {
    userService.slotContentService.upsertEntity(users, user);

    const team = everyone.filter(u => u.teamId === user.teamId)
        .map(u => userService.holdSlotByKey(users, u.id));
    const teamBucket = byTeamService.holdSlotByKey(byTeam, user.teamId);
    byTeamService.slotContentService.writeBucketMemberSlots(teamBucket, team);
    teamBucket.owner.unholdSlot(teamBucket);
    for (const one of team) one.owner.unholdSlot(one);

    const all = everyone.map(u => userService.holdSlotByKey(users, u.id));
    everyUserService.slotContentService.writeBucketMemberSlots(everyUser, all);
    for (const one of all) one.owner.unholdSlot(one);
}

const keyedIndex: TOIMReduxKeyedIndex<string, string, TUser> = {
    bucketService: byTeamService, bucketStoreSlot: byTeam, entityService: userService, entityStoreSlot: users,
};
const globalIndex: TOIMReduxGlobalIndex<string, TUser> = {
    bucketService: everyUserService, bucketSlot: everyUser, entityService: userService, entityStoreSlot: users,
};

// The state type is named for the same reason `TPk` is: it appears nowhere in the
// arguments, so nothing else can infer it.
const byTeamReducer = adapter.createKeyedIndexReducer<
    string, string, TOIMReduxDefaultIndexState<string, string>, TUser
>(keyedIndex);
const everyUserReducer = adapter.createGlobalIndexReducer<
    string, TOIMReduxDefaultGlobalIndexState<string>, TUser
>(globalIndex);
```

A bucket collection is **built by the caller**, with `createOIMBucketService(db, options)`.
Its `slotContentService` decides how the slots are held: `OIMSlotContentBucketServiceSetDriven`
in a set, `OIMSlotContentBucketServiceArrayDriven` (the default) at positions the caller places,
`OIMSlotContentBucketServiceSortedArrayDriven` in a sorter's order. A `bucketSlotStoreService`
option fixes a non-scalar address type. A bucket's slots are always written with
`bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, slots)`, so a bucket
collection has nothing left to derive.

**An auto-index cannot be registered here, and the types say so.** The keyed and global
registrations are synced back from Redux: a child reducer's `ids` are written into the
registered buckets. An `OIMIndexService` files its buckets itself, from the entities' keys,
and hands out a `slotContentService` that only reads (`getBucketMemberSlots`,
`getBucketMemberSlotCount`, `hasBucketMemberSlot`, and on an array bucket
`getBucketMemberSlotAt` / `getBucketMemberSlotPosition`). A sync-back write into it would move
a member without moving its index key and break the index, so passing one where a bucket
collection is asked for does not type-check.

**A registration carries the bucket store slot, never the raw store inside it.** The store slot
is the instance and carries its store; only the service reads that store, through
`getSlotByKey`, `holdSlotByKey` and `getSlots`, each handed the store slot. The adapter never
touches `bucketStoreSlot.store`, so no registration can name a store its service does not answer for.

**The Global registration names the bucket slot apart from its service, and that split comes from the engine.** The call that
writes a bucket is `bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, slots)`, which is handed the bucket it is about
and looks nothing up. So the writer (`bucketService`) and the identity (`bucketSlot`)
are named separately.

`everyUser` above mirrors the whole population **into** Redux and nothing more, as long
as `saveUser` keeps re-stating it. That is now the application's job and nobody else's.
Sync-back is the other direction: a child reducer whose state carries `ids` hands that
list to `writeBucketMemberSlots`. Nothing refuses it, because every bucket takes its slots from
whoever is holding it. The two directions are the same call, so pointing both at one
bucket means the last writer wins. Give Redux its own bucket when Redux is the one
deciding who is in it.

All registration types carry an **entity** parameter, and it cannot be widened: the entity
collection service is invariant in the entity it holds, so no collection over `object` is
satisfied by a real caller's population. `TIndexKey` and `TPk` are phantoms (what the *Redux*
state is keyed by and lists), carried so that `TOIMReduxKeyedIndex<'red' | 'blue', string, TUser>`
is not silently accepted where `<'green', string, TUser>` was asked for.

The adapter only ever asks the bucket collection for `holdSlotByKey`, `getSlotByKey` and `getSlots` on the
bucket store slot. What decides a bucket's slots is not this adapter's business, so every bucket collection
registers the same way.

**A bucket is watched while it holds something, and let go when it empties.** An empty
bucket is not watched at all, and a watched one that empties is unsubscribed. A bucket
that nothing holds is released by its owner's `releaseSlotIfUnheld`, so a subscription that
outlived its bucket would be watching an identity the engine has let go.

`adapter.createMiddleware()` flushes the channel after every dispatched action
(`OIMChannelService.INSTANCE.flush(db.defaultChannelSlot)`, the same thing `db.flush()` does), so a write
that a child reducer made back into the engine (see `TOIMReduxCollectionReducerChildOptions`) is
processed and projections re-run, instead of waiting for a frame of its own. `adapter.setStore(store)` also dispatches immediately if anything moved before the
store existed. Redux's creation order forces that gap, and without this the state
accumulated in between would wait for a frame that might never come.

**That flush drains the WHOLE pending frame, and everything it drained is reported.**
A frame is armed by whoever writes first, so a socket callback's `upsertEntity` with no
explicit flush is drained and reported by the next action the application dispatches.
The cost is one extra `OIMDB_UPDATE` per action that wrote back. It is redundant only for the
store slot whose own child wrote; every other reducer over that runtime needs it.

### HAZARD: the once-per-frame `OIMDB_UPDATE` may only READ the runtime

`OIMDB_UPDATE` is dispatched from an after-each-frame handler, and **the end of the frame is not
the end of the flush.** `OIMChannelService.flush` raises the channel slot's `isFlushing` before the
frame and lowers it only in its `finally`, so the after-each-frame phase is still inside the flush,
and `OIMChannelService.assertNotFlushing` refuses every write door for the whole of it:

```
OIMChannelService: writes are refused for the whole of a flush — onBeforeFlush and every
after-each-frame handler included, not only the frame body. Write after flush() returns.
```

One configuration writes on that path: a collection reducer built with `linkedIndexes`
reaches `OIMReduxLinkedIndexesUpdater.updateLinkedIndexesForEntities` from its `OIMDB_UPDATE` handling, and
the `writeBucketMemberSlots` there is refused. The refusal goes to the channel's error policy (logged
by default, thrown out of `flush()` under `OIMErrorPolicyThrowAtOnce`), Redux keeps the
slice's previous value, and the change is **not** just late:
`updatedKeys` is cleared before the linked-index block runs, so no later frame recovers it.
A reducer with no `linkedIndexes` is unaffected, and the sync-back write paths
(`slotContentService.upsertEntities`, `syncIndexEntities`) are not on the `OIMDB_UPDATE` path at all.
`tests/what-a-dispatch-after-a-frame-is-allowed-to-write.test.ts` records the whole
outcome. Do not configure `linkedIndexes` on a collection reducer
whose channel is flushed by this adapter's middleware.

The nested flush that the middleware runs from inside that dispatch is harmless, and it is also
not a deferral: `OIMChannelService.flush` returns at `if (channelSlot.isFlushing) return;` having done
nothing, and one flush spends exactly one frame however many handlers ask for another.

## Composite primary keys

`@oimdb/core` also supports populations addressed by a **chain** of identities
(`OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue()`) or of values (`OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()`), so
the collection's key is `readonly TOIMEntitySlot[]` instead of `TOIMStoreKey`. This adapter
cannot mirror such a population directly, and that is deliberate: every reducer factory here is typed
`TPk extends TOIMStoreKey`, and `TOIMStoreKey` is `string | number`. A chain of identities is a
combination of identities by design. Rebuilt from the same segments, it resolves to the
same entity with nothing compared, which is exactly what makes it *not* a string. Redux
state, on the other hand, is keyed by plain strings (`entities[pk]`, action payloads
serialized through the store).

The way across is a scalar-keyed store slot of your own, written beside the composite one:

```typescript
import type {
    OIMSlotCollectionService, OIMSlotContentEntityService, TOIMSlotStoreTree, TOIMStoreSlot,
} from '@oimdb/core';
import type { TOIMReduxDefaultCollectionState } from '@oimdb/redux-adapter';

type TProgress = { userId: string; cardId: string; box: number };
type TProgressKey = readonly TOIMEntitySlot[];
type TProgressSlot = TOIMEntitySlot<TProgress, TProgressKey>;
type TProgressStore = TOIMSlotStoreTree<TProgressSlot, TOIMEntitySlot>;
type TFlatProgress = { id: string; box: number };
type TFlatState = TOIMReduxDefaultCollectionState<TFlatProgress, string>;

// `progress` is addressed by
// [userService.holdSlotByKey(users, userId), cardService.holdSlotByKey(cards, cardId)] — no scalar key of its own.
declare const progressService: OIMSlotCollectionService<
    TProgressKey, TProgressSlot, TProgressStore, OIMSlotContentEntityService<TProgress, TProgressKey, TProgressStore>
>;
declare const progress: TOIMStoreSlot<TProgressStore, TProgressSlot, Partial<TProgress>>;

const flatService = createOIMEntityService<TFlatProgress>(db, { keyOf: item => item.id });
const flat = flatService.createStoreSlot(db);

function saveProgress(item: TProgress): void {
    progressService.slotContentService.upsertEntity(progress, item);
    flatService.slotContentService.upsertEntity(flat, { id: `${item.userId}:${item.cardId}`, box: item.box });
}

adapter.createCollectionReducer<TFlatProgress, string, TFlatState>(flatService, flat);
```

Both writes land in the same batch, so the Redux-facing store slot is never a frame
behind.

## One key type per mirrored population

**Both default mappers throw when two addresses of the engine land on one property name
of the Redux state.** They throw at the write that would lose one of them, because nothing after that
write can tell it was lost. `@oimdb/core` files entities and buckets in `Map`s, where `1` and
`'1'` are two addresses; `entities` is a plain object, where they are one property name.

`oimDefaultCollectionMapper` refuses two entities whose pks share a name, and
`oimDefaultKeyedIndexMapper` refuses two buckets whose keys do. Without the refusal, each would lose this:

- **Collection.** `ids` lists both, but `entities` can hold only one, so `ids.length` and
  `Object.keys(entities).length` disagree and `entities[pk]` for one of the two ids hands
  back the *other* entity. The damage reaches back into the engine too: sync-back decides what to
  remove by asking `slot.key in state.entities`, and since one name answers for both entities, a child
  reducer that deletes that single entry removes **both** entities from the store slot.
- **Keyed index.** Only one entry can exist, the state stops naming the other bucket, and
  the sync-back then finds that bucket missing from what Redux lists and empties it.
  Every frame, the slots of a live bucket are destroyed.

A population addressed by one key type cannot collide: over strings the round trip is the
identity function, and `String()` is injective over the numbers a `Map` keeps apart. So the
refusal costs a single-typed application nothing but a lookup per key written. In practice it
can happen when the address is `TOIMStoreKey` and a server sends an id sometimes as
`7` and sometimes as `"7"`. Address the population with one key type, or pass your own
mapper whose state shape keeps the two apart (an entry that carries its raw key, a `Map`, a
prefix per type).

## Reference

`OIMReduxLinkedIndexesUpdater<TEntity>` keeps a bucket store slot in step with one array field of
an entity, described by `TOIMReduxLinkedIndex<TEntity, TLinkedEntity>`. Its fields
are `bucketService` and `bucketStoreSlot`, `linkedEntityService` and `linkedEntityStoreSlot`, and
`fieldName`. Its constructor takes one **required** argument, `keyOf: (entity: TEntity) =>
TOIMStoreKey`, and its two methods are `updateLinkedIndexesForEntities(linkedIndexes,
updatedEntities)` and `removeLinkedIndexesByKeys(linkedIndexes, removedPks)`. Each writes a
bucket with `bucketService.slotContentService.writeBucketMemberSlots(bucketService.getSlotByKey(bucketStoreSlot, key), slots)`.

The first takes **entities, not keys**, and keys are what it must not take: the caller
has the keys of a plain Redux record, which are always strings, even for a numerically keyed
population. A bucket addressed by one of those is a string bucket beside the numeric
bucket the engine filed the entities in, and a deck with a numeric id would get a second
parallel bucket per Redux frame while its real one was never written. An entity carries its
own key; `keyOf` turns it back into the value the bucket collection files by, so no key of this
package's making crosses into the engine. It is the same `keyOf` that the child-reducer options
declare, defaulted to `.id`.

The child-reducer extractors take the same arguments as the mappers, after the two states:
`extractEntities(prevState, nextState, entityService, entityStoreSlot, keyOf)`,
`extractIndexState(prevState, nextState, keyedIndex)`,
`extractGlobalIndexState(prevState, nextState, globalIndex)`.

`oimDiffEntityKeys(oldEntities: object, newEntities: object)` returns
`TOIMReduxEntityKeysDiff<string>`. The keys are **strings** on purpose: a plain object
files `1` and `'1'` at one and the same place, so a result typed by the caller's key would
be a claim that the runtime cannot keep. A consumer that believed it would feed a stringified key to
a `Map`-backed store of `@oimdb/core`, where `1` and `'1'` are two different addresses.

## Full reference

The full API — index mappers, the child-reducer option types
(`TOIMReduxCollectionReducerChildOptions`, `TOIMReduxIndexReducerChildOptions`,
`TOIMReduxGlobalIndexReducerChildOptions`) — is in **`llms.txt`**, which ships inside this
package: read it beside this README in the installed package, or
[on GitHub](https://github.com/abaikov/oimdb/blob/master/llms.txt).
