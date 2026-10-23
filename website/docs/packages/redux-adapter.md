---
sidebar_position: 4
description: How @oimdb/redux-adapter mirrors entity store slots and buckets into Redux reducers, maps state shapes, syncs both ways and handles composite keys.
---

# Redux Adapter

`@oimdb/redux-adapter` mirrors OIMDB entity store slots and bucket store slots into
Redux reducers. It uses the same watch-the-bucket-and-its-entities pattern that
[`@oimdb/persist`](/docs/packages/persist) uses to mirror onto disk, aimed
at a Redux store instead. OIMDB stays the source of truth, and Redux reads a
derived snapshot. Use it for gradual migration or a hybrid app that keeps some
state in Redux.

<InShort>

- The adapter mirrors entity store slots and buckets into Redux reducers.
- OIMDB stays the source of truth, and Redux reads a derived snapshot.
- A child reducer lets existing Redux actions write back into OIMDB.
- It is not the way a new view reads OIMDB.

</InShort>

## When to use it, and when not

**Use it** when part of the application already reads from a Redux store
(selectors, `connect`, Redux DevTools, middleware that inspects state) and you
want OIMDB data visible there without rewriting those readers. A child reducer
also lets existing Redux actions write back into OIMDB, so the migration can go
one slice at a time.

**Do not use it** as the way a new view reads OIMDB. Every mirrored change costs
a Redux action, a mapper run and a new state object, and a selector then has to
find the entity again by key, which is exactly the lookup an identity-addressed slot
removes. A React view reads the slot directly through
[`@oimdb/react`](/docs/packages/react), and an Exodra view through
[`@oimdb/exodra`](/docs/packages/exodra). Mirror into Redux only what a Redux
reader needs.

**Why it is a mirror and not a second store.** OIMDB stays the one source of
truth and Redux gets a projection of it. Two stores that both accept writes would
need a merge rule for every field. A projection needs none, and a write-back from
a child reducer is an ordinary OIMDB write that the next frame projects again.

```bash
npm install @oimdb/redux-adapter @oimdb/core redux
```

## How it works

The adapter takes the `OIMDB` the store slots were created on, as `channelMap`: an `OIMDB` is an
`IOIMChannelMap`, and its `defaultChannelSlot` is the channel the adapter's effects
(`OIMEffectService.INSTANCE`), its frame hook and its middleware's flush run on. A reducer is
registered with a collection service and the store slot it reads: the service is one per type,
and the store slot is the one instance it mirrors.

```ts setup
import {
  OIMDB, OIMKeyTreeWalkComposite, OIMSlotStoreServiceTreeDriven, createOIMBucketService, createOIMEntityService,
  type TOIMStoreKey, type TOIMEntitySlot, type TOIMEntityColumnName, type TOIMSlotStoreTree,
} from '@oimdb/core';
import { OIMReduxAdapter } from '@oimdb/redux-adapter';
import type {
  TOIMReduxDefaultCollectionState, TOIMReduxDefaultIndexState,
  TOIMReduxDefaultGlobalIndexState, TOIMReduxGlobalIndex, TOIMReduxLinkedIndex,
} from '@oimdb/redux-adapter';
import { createStore, combineReducers, applyMiddleware } from 'redux';

type TUser = { id: string; name: string; teamId: string; role?: string };
type UsersState = TOIMReduxDefaultCollectionState<TUser, string>;
type TCard = { id: string; title: string };
type TDeck = { id: string; cardIds: string[] };
type TProgress = { userId: string; cardId: string; box: number };
type TFlatProgress = { id: string; box: number };
type TFlatState = TOIMReduxDefaultCollectionState<TFlatProgress, string>;

const uiReducer = (state: { open: boolean } = { open: false }): { open: boolean } => state;

const db = new OIMDB();

const userService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
const users = userService.createStoreSlot(db);
const byTeamService = createOIMBucketService<TOIMEntitySlot<TUser>>(db);
const byTeam = byTeamService.createStoreSlot(db);

const adapter = new OIMReduxAdapter({ channelMap: db });

const usersReducer = adapter.createCollectionReducer<
  TUser, string, TOIMReduxDefaultCollectionState<TUser, string>
>(userService, users);

const byTeamReducer = adapter.createKeyedIndexReducer<
  string, string, TOIMReduxDefaultIndexState<string, string>, TUser
>({
  bucketService: byTeamService,
  bucketStoreSlot: byTeam,
  entityService: userService,
  entityStoreSlot: users,
});

const store = createStore(
  combineReducers({ users: usersReducer, byTeam: byTeamReducer, ui: uiReducer }),
  applyMiddleware(adapter.createMiddleware()),
);

adapter.setStore(store); // bind so the adapter can dispatch OIMDB_UPDATE

const cardService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
const cards = cardService.createStoreSlot(db);
const cardsByDeckService = createOIMBucketService<TOIMEntitySlot<TCard>>(db);
const cardsByDeck = cardsByDeckService.createStoreSlot(db);
type TProgressKey = readonly TOIMEntitySlot[];
type TProgressSlot = TOIMEntitySlot<TProgress, TProgressKey>;
const progressService = createOIMEntityService<
  TProgress, TOIMEntityColumnName<TProgress>, TProgressKey, TOIMSlotStoreTree<TProgressSlot, TOIMEntitySlot>
>(db, {
  entitySlotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TProgressSlot>(new OIMKeyTreeWalkComposite()),
  keyOf: item => [userService.holdSlotByKey(users, item.userId), cardService.holdSlotByKey(cards, item.cardId)],
});
const progress = progressService.createStoreSlot(db);
```

`userService` is the collection service `createOIMEntityService` returns. Its own doors read and
mint slots (`getSlots`, `getSlotByKey`, `holdSlotByKey`); every write goes through its
`slotContentService` (`upsertEntity`, `updateEntity`, `deleteEntities`, …). A bucket collection
from `createOIMBucketService` is the same shape: its `slotContentService` holds the bucket's
slots, and `writeBucketMemberSlots` and the other bucket doors are on it.

`TOIMReduxKeyedIndex`, `TOIMReduxGlobalIndex` and `TOIMReduxLinkedIndex` all
carry an **entity** parameter, and it cannot be widened: the entity collection service
is invariant in what it holds, so there is no collection over `object` a real caller's
population satisfies.
`TIndexKey`/`TPk` are phantoms describing the *Redux* side, so that a
registration keyed by `'red' | 'blue'` is not silently accepted where one keyed
by `'green'` was asked for.

The adapter watches with ordinary effects and a content-change listener on each registered store
slot, so a store slot written from anywhere (your own code, a hydrating persistor) is mirrored the
same way. After each frame in which anything registered moved, it dispatches one `OIMDB_UPDATE`
action (`EOIMReduxReducerActionType.UPDATE`); reducers then read the current OIMDB state through
their mapper and return the new Redux slice. A frame that touched nothing registered dispatches
nothing.

```typescript
userService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', teamId: 'team1' });
db.flush();

store.getState().users; // { entities: { u1: {...} }, ids: ['u1'] }
```

`setStore` dispatches at once if anything moved before the store existed, since reducers must
exist before the store does.

## Default state shapes

- **Collection** → `{ entities: Record<TPk, TEntity>, ids: TPk[] }` (RTK Entity
  Adapter shape). Built from the whole store slot the first time, then updated only for the
  keys that changed.
- **Keyed index**: a bucket store slot whose buckets are filed by a scalar →
  `{ entities: Record<TIndexKey, { id, ids: TPk[] }> }`, one entry per bucket
  that currently holds something.
- **Keyless index**: one bucket of a bucket store slot, held under a fixed key,
  with no key in the Redux state → `{ ids: TPk[] }`, which is the one bucket's
  slots in order.

A keyless index names the bucket service and the bucket slot separately, because what writes a bucket is
`bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, slots)`, which is handed the bucket it is about
and looks nothing up. So the writer and the identity are named separately: one
bucket held under a fixed key, in a bucket store slot of its own:

```ts setup
const recentService = createOIMBucketService<TOIMEntitySlot<TUser>>(db);
const recentStoreSlot = recentService.createStoreSlot(db);
const recent = recentService.holdSlotByKey(recentStoreSlot, 'recent');
```

A void-keyed single bucket does not fit: `TOIMReduxGlobalIndex` takes a bucket
service keyed by `TOIMStoreKey` and one of its slots. A bucket held under a fixed
key in a store slot of its own types as it is.

```typescript
const globalIndex: TOIMReduxGlobalIndex<string, TUser> =
  { bucketService: recentService, bucketSlot: recent, entityService: userService, entityStoreSlot: users };

const recentReducer = adapter.createGlobalIndexReducer<
  string, TOIMReduxDefaultGlobalIndexState<string>, TUser
>(globalIndex);
// store.getState().recent -> { ids: [...] }
```

In a keyed index, a bucket is watched while it holds something and let go of when it empties,
so the adapter does not keep emptied buckets alive. The bucket of a keyless index is watched for
the adapter's whole life, since the caller holds it.

Your application fills that bucket. A `userService.slotContentService.upsertEntity(users, user)` puts nothing in
`recent`; `recentService.slotContentService.writeBucketMemberSlots(recent, slots)` does, and whatever list you
hand it is what Redux mirrors. Every id is resolved with a hold, because minting by
key is the only way to name an entity whose value has not arrived. The hold is
given back after the write, because the holds that the write itself leaves behind
are what keep whatever joined:

```typescript
function saveUser(user: TUser, everyone: readonly TUser[]): void {
  userService.slotContentService.upsertEntity(users, user);
  const held = everyone.map(u => userService.holdSlotByKey(users, u.id));
  recentService.slotContentService.writeBucketMemberSlots(recent, held);
  for (const one of held) one.owner.unholdSlot(one);
}
```

The reducer above is a read-only mirror: it projects the bucket into
`{ ids }` and never writes back. Sync-back is the other direction. A child
reducer whose state carries `ids` hands that list to
`bucketService.slotContentService.writeBucketMemberSlots`. Since every bucket's slots are the caller's, no
bucket collection refuses the write, so the two directions can meet on one
bucket, and the last writer wins. Give Redux its own bucket when Redux is the
one deciding who is in it.

That is also why an **auto-index cannot be registered** as a keyed, keyless or linked
index. An `OIMIndexService` files its buckets itself from the entities' keys, and its
`slotContentService` only reads (`getBucketMemberSlots`, `getBucketMemberSlotCount`,
`hasBucketMemberSlot`, and on an array bucket `getBucketMemberSlotAt` /
`getBucketMemberSlotPosition`). A sync-back write into one would move a member without
moving its index key, so passing an index where a bucket collection is asked for does not
type-check.

## Custom mapper

Pass your own mapper as the third argument (after the child options) to
override the default shape entirely. A mapper is handed the registration, and
reads through the entity service and the bucket service, each handed its store
slot. The service owns the identities and the store slot carries the store, so
`getSlots(storeSlot)` iterates the identities themselves, and a bucket's members are
read with `bucketService.slotContentService.getBucketMemberSlots(bucketSlot)`:

```text
(entityService, entityStoreSlot, updatedKeys, currentState) => TState    // collection
(keyedIndex, updatedKeys, currentState) => TState                        // keyed index
(globalIndex, currentState) => TState                                    // keyless index
```

Those are `TOIMReduxCollectionMapper`, `TOIMReduxIndexMapper` and
`TOIMReduxGlobalIndexMapper`. `oimDefaultCollectionMapper`,
`oimDefaultKeyedIndexMapper` and `oimDefaultGlobalIndexMapper` are exported if you
want to build on top of one. A mapper is passed per reducer, as the last argument
of its `create…Reducer` call; a reducer given none uses the built-in default.

## One key type per mirrored population

Both default mappers throw when two addresses of the engine land on one
property name of the Redux state. They throw at the write that would lose one of the two,
because nothing after that write can tell it was lost. `@oimdb/core` files
entities and buckets in `Map`s, where `1` and `'1'` are two addresses, but `entities`
is a plain object, where they are one property name.

`oimDefaultCollectionMapper` refuses two entities whose pks share a name, and
`oimDefaultKeyedIndexMapper` refuses two buckets whose keys do. Without the
refusal, this is what is lost:

- **Collection.** `ids` lists both and `entities` can hold only one, so
  `ids.length` and `Object.keys(entities).length` disagree and `entities[pk]`
  for one of the two ids hands back the other entity. It reaches back into the
  engine too: sync-back decides what to remove by asking
  `slot.key in state.entities`, and one name answers for both entities, so a child
  reducer deleting that single entry removes both from the store slot.
- **Keyed index.** Only one entry can exist, the state stops naming the other
  bucket, and the sync-back then finds that bucket missing from what Redux lists
  and empties it. Every frame destroys the slots of a live bucket.

A population addressed by one key type cannot collide: over strings the round
trip is the identity function, and `String()` is injective over the numbers a
`Map` keeps apart. The refusal therefore costs a single-typed application
nothing but a lookup per key written. It is reachable in practice when the
address type is `TOIMStoreKey` and a server sends an id sometimes as `7` and
sometimes as `"7"`.

Address the population with one key type, or pass a mapper of your own whose
state shape keeps the two apart, such as an entry that carries its raw key, a `Map`,
or a prefix per type.

## Two-way sync: a child reducer

A child reducer handles your own actions and can write back into OIMDB. The
middleware flushes the channel after every action
(`OIMChannelService.INSTANCE.flush(db.defaultChannelSlot)`, which is what `db.flush()` does), so writes a child reducer
made settle (derivations run, ordered buckets re-sorted, subscribers told)
instead of waiting for a frame of their own:

```typescript
const roleReducer = adapter.createCollectionReducer<TUser, string, UsersState>(userService, users, {
  reducer: (state, action) => {
    if (action.type === 'users/setRole') {
      const { payload } = action as { type: string; payload: { id: string; role: string } };
      const userSlot = userService.findSlotByKey(users, payload.id);
      if (userSlot !== undefined) userService.slotContentService.updateEntity(userSlot, { role: payload.role });
    }
    return state;
  },
  keyOf: (entity) => entity.id,
});
```

A child reducer can also declare `linkedIndexes`: keyed indexes kept in step
with one array field of the entity (`deck.cardIds` → the bucket under
`deck.id`). A `TOIMReduxLinkedIndex` names three things: the bucket service and
its store slot, the entity service and store slot the **entities** belong to (a raw pk cannot be resolved to an
identity without knowing whose) and the field holding them:

```typescript
const linkedIndexes: ReadonlyArray<TOIMReduxLinkedIndex<TDeck, TCard>> = [
  {
    bucketService: cardsByDeckService,
    bucketStoreSlot: cardsByDeck,
    linkedEntityService: cardService,
    linkedEntityStoreSlot: cards,
    fieldName: 'cardIds',
  },
];
```

:::danger[A linked index on a reducer this adapter flushes is currently refused]

`OIMDB_UPDATE` is dispatched from inside the flush, where every write is refused. A reducer with
`linkedIndexes` handling it tries to write the linked buckets, the write throws, the throw goes to
the channel's error policy (logged by default), and the Redux slice keeps its previous value; a
later frame does not recover it. Driving `OIMReduxLinkedIndexesUpdater` yourself, outside a flush,
works.

:::

`OIMReduxLinkedIndexesUpdater<TEntity>` is exported for anyone driving that
directly. Its constructor takes one **required** argument,
`keyOf: (entity: TEntity) => TOIMStoreKey`, and its two methods are
`updateLinkedIndexesForEntities(linkedIndexes, updatedEntities)` and
`removeLinkedIndexesByKeys(linkedIndexes, removedPks)`. A write that changes nothing in a bucket
wakes nobody.

The update method takes entities, not Redux record keys: those keys are strings even for a
numerically keyed population, and `'1'` would name a different bucket than `1`. `keyOf` reads the
real key off each entity; it is the same `keyOf` the child-reducer options declare, defaulted to `.id`.

### What each child option does

A child reducer runs on every action except `OIMDB_UPDATE`. When it returns a
state object that is not the one it was given, the adapter writes that state
back into OIMDB, through the option below if you supplied it and otherwise through
the default sync-back for the default state shape. The returned state is what
Redux keeps.

| Reducer factory | Child options type | Fields |
|---|---|---|
| `createCollectionReducer` | `TOIMReduxCollectionReducerChildOptions` | `reducer`; `extractEntities?(prevState, nextState, entityService, entityStoreSlot, keyOf)`; `keyOf?` (default reads `.id`, and throws if the entity has none); `linkedIndexes?` |
| `createKeyedIndexReducer` | `TOIMReduxIndexReducerChildOptions` | `reducer`; `extractIndexState?(prevState, nextState, keyedIndex)` |
| `createGlobalIndexReducer` | `TOIMReduxGlobalIndexReducerChildOptions` | `reducer`; `extractGlobalIndexState?(prevState, nextState, globalIndex)` |

The default sync-backs, read off `OIMReduxReducerFactory`:

- **Collection.** Diffs the live store slot against `nextState.entities`, calls
  `entityService.slotContentService.upsertEntities(entityStoreSlot, …)` with what was added or changed (by reference), and
  `entityService.slotContentService.deleteEntities(entityStoreSlot, …)` with every live entity slot whose key is no longer in
  `nextState.entities`. It runs only when the state has both `entities` and `ids`.
- **Keyed index.** For every entry of `nextState.entities`, writes the bucket
  under `entry.id` with the entities named by `entry.ids`; every bucket the state no
  longer lists is written empty.
- **Keyless index.** Writes the one bucket with the entities named by
  `nextState.ids`, in that order.

Every key is resolved with a hold, and the hold is given back after the write,
for the same reason as in `saveUser` above.

`extractEntities` and `linkedIndexes` cannot be combined.
`createCollectionReducer` throws at construction if both are given. A custom
extractor does its own writing, so which entities moved is not something the
adapter can know afterwards, and a linked index would be maintained from a guess.
Maintain the linked buckets inside the extractor, or drop the extractor.

A write-back is not echoed: while a child's state is being written back, an `OIMDB_UPDATE`
reaching the same reducer returns the state unchanged. An extractor that throws does not leave
the reducer deaf; the throw is not caught.

### When a reducer builds its first state

A collection reducer builds from its store slot on Redux's own init action
(`@@redux/…`) or on `OIMDB_UPDATE`, and otherwise returns `undefined` for an
`undefined` state, which is the behaviour Redux Toolkit's `combineReducers` checks for. A
keyed or keyless index reducer builds on whatever action arrives first.

## Diff helper

`oimDiffEntityKeys` is exported because the sync-back is built from it, and a
custom extractor usually needs the same step. To compare two lists of keys in order,
use `oimSameKeySequence` from `@oimdb/core`.

```typescript
import { oimDiffEntityKeys } from '@oimdb/redux-adapter';

const before = { u1: { id: 'u1' }, u2: { id: 'u2' } };
const after = { u1: before.u1, u3: { id: 'u3' } };
const diff = oimDiffEntityKeys(before, after);
// diff.added: {'u3'}, diff.removed: {'u2'}, diff.updated: {}, diff.all: {'u2','u3'}
```

- `oimDiffEntityKeys(oldEntities, newEntities)` returns a
  `TOIMReduxEntityKeysDiff<string>` with `added`, `updated` (present in both
  with a different reference), `removed` and `all`. **It reports strings**, because
  that is what a plain record's keys are. Do not hand those strings to the engine
  as keys: for a numerically keyed population `'1'` names a different address
  than `1`. Turn them back into entities and read the key off the entity with
  `keyOf`, which is what the adapter itself does.

## Action and state types

- `EOIMReduxReducerActionType.UPDATE` is `'OIMDB_UPDATE'`, and
  `TOIMReduxUpdateAction` is the action's type. The adapter dispatches it once per
  frame that moved anything a registered reducer watches, and once from
  `setStore` if something moved before the store existed. Match on it in your own
  middleware if you need to tell OIMDB-originated updates apart.
- `TOIMReduxDefaultCollectionState`, `TOIMReduxDefaultIndexState` and
  `TOIMReduxDefaultGlobalIndexState` are the three default shapes listed under
  [Default state shapes](#default-state-shapes).
- `TOIMReduxKeyedIndex`, `TOIMReduxGlobalIndex` and `TOIMReduxLinkedIndex` are the
  registrations; `TOIMReduxAdapterOptions` is `{ channelMap: IOIMChannelMap }`, which you fill with the `db`.

## API

| Method | Description |
|---|---|
| `new OIMReduxAdapter({ channelMap: db })` | Create the adapter over `db.defaultChannelSlot` |
| `.createCollectionReducer(entityService, entityStoreSlot, child?, mapper?)` | Reducer backed by an entity store slot of a collection from `createOIMEntityService` |
| `.createKeyedIndexReducer({ bucketService, bucketStoreSlot, entityService, entityStoreSlot }, child?, mapper?)` | Reducer backed by a key-addressed bucket store slot |
| `.createGlobalIndexReducer({ bucketService, bucketSlot, entityService, entityStoreSlot }, child?, mapper?)` | Reducer backed by one bucket slot held under a fixed key |
| `.createMiddleware()` | Redux middleware — flushes the channel after every action |
| `.setStore(store)` | Bind the Redux store (call after `createStore`) |
| `.dispose()` | Stop watching, drop every disposer and clear all three registries; idempotent and terminal |

### The middleware's flush drains the whole frame, and reports all of it

The middleware's flush drains the whole pending frame, and every change it drains is
reported. Whoever writes first arms a frame: a socket callback running
`cardService.slotContentService.upsertEntity(cards, { id: 'c9', title: 'Nine' })` with no explicit flush leaves one pending, and the
next action your application dispatches, whatever it is, drains it and reports it.

The cost is one extra `OIMDB_UPDATE` per action whose child reducer
wrote back, re-running the mapper over a runtime that agrees with the store. The
result is an equal state object with a new identity, so one redundant re-render.
That is redundant only for the store slot whose own child did the writing. For a keyed
index over that store slot, a keyless index, or a store slot fed by a derivation,
that dispatch is the only way the change reaches Redux at all.

The `OIMDB_UPDATE` dispatch comes back through the middleware from inside the flush; that nested
flush does nothing, so there is no loop. `OIMDB_UPDATE` may only read the runtime; see the
linked-index warning above.

## Composite primary keys

A [composite-keyed](/docs/core/collections#composite-keys-come-in-two-strategies-and-you-pick-one)
population is addressed by a chain (`readonly TOIMEntitySlot[]` or
`readonly TOIMStoreKey[]`, depending on which store it was given) and not by a
`TOIMStoreKey`, while every reducer factory here is typed `TPk extends TOIMStoreKey`. So
neither strategy is a direct fit. A chain of identities is a combination of
identities: rebuilt from the same composite key parts, it resolves to the same
entity with nothing compared, and it has no string form, while Redux state is
keyed by plain strings.

Nothing in `@oimdb/core` writes one store slot from another. The way across is a
scalar-keyed store slot of your own, written beside the composite one. Both
writes land in the same batch, so the Redux-facing store slot is never a frame
behind:

```typescript
// `progress` is addressed by
// [userService.holdSlotByKey(users, userId), cardService.holdSlotByKey(cards, cardId)] — no scalar key of its own.
const flatService = createOIMEntityService<TFlatProgress>(db, { keyOf: item => item.id });
const flat = flatService.createStoreSlot(db);

function saveProgress(item: TProgress): void {
  progressService.slotContentService.upsertEntity(progress, item);
  flatService.slotContentService.upsertEntity(flat, { id: `${item.userId}:${item.cardId}`, box: item.box });
}

const flatReducer = adapter.createCollectionReducer<TFlatProgress, string, TFlatState>(flatService, flat);
```

## Export reference

**Classes:** `OIMReduxAdapter`, `OIMReduxLinkedIndexesUpdater`.

**Enum:** `EOIMReduxReducerActionType`.

**Functions:** `oimDefaultCollectionMapper`, `oimDefaultKeyedIndexMapper`,
`oimDefaultGlobalIndexMapper`, `oimDiffEntityKeys`.

**Types:** `TOIMReduxUpdateAction`, `TOIMReduxAdapterOptions`,
`TOIMReduxCollectionMapper`, `TOIMReduxIndexMapper`, `TOIMReduxGlobalIndexMapper`,
`TOIMReduxKeyedIndex`, `TOIMReduxGlobalIndex`, `TOIMReduxLinkedIndex`,
`TOIMReduxDefaultCollectionState`, `TOIMReduxDefaultIndexState`,
`TOIMReduxDefaultGlobalIndexState`, `TOIMReduxCollectionReducerChildOptions`,
`TOIMReduxIndexReducerChildOptions`, `TOIMReduxGlobalIndexReducerChildOptions`,
`TOIMReduxEntityKeysDiff`.

## See also

<DocCards>
<DocCard to="/docs/packages/persist" title="Persist">The identical mirroring pattern, aimed at storage instead of a Redux store.</DocCard>
</DocCards>
