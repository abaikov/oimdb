---
sidebar_position: 1
---

# Core Model

OIMDB's current app-level model is:

- a shared `OIMEventQueue`
- a collection model created with `createOIMCollectionKit`
- indexes that live next to the collection
- selectors for reactive reads

Collections remain the source of truth for entities. Indexes and ordered lists keep canonical collection slots, but they are not stored inside the collection.

## Collection Model

```typescript
import {
  createOIMCollectionKit,
  OIMEventQueue,
  OIMEventQueueSchedulerFactory,
} from '@oimdb/core';

type User = {
  id: string;
  name: string;
  teamId: string;
};

const queue = new OIMEventQueue({
  scheduler: OIMEventQueueSchedulerFactory.createMicrotask(),
});

const users = createOIMCollectionKit<User, string>(queue, {
  selectPk: (user) => user.id,
});
```

The model facade contains:

```typescript
type TOIMCollectionKit<TEntity, TPk> = {
  queue: OIMEventQueue;
  collection: OIMReactiveCollection<TEntity, TPk>;
  indexFactory: OIMCollectionIndexFactory<TEntity, TPk>;
  select: OIMCollectionSelectors<TEntity, TPk>;
};
```

## Slot-Returning Writes

Collection writes return canonical slots. Updating an entity keeps the same slot object and updates `slot.item`.

```typescript
const firstSlot = users.collection.upsertOne({
  id: 'u1',
  name: 'Alice',
  teamId: 'team1',
});

const updatedSlot = users.collection.upsertOneByPk('u1', {
  name: 'Alicia',
});

console.log(firstSlot === updatedSlot); // true
```

This is what lets collection-bound indexes store stable slot references while still exposing PK projections such as `getPksByKey`.

## Event Semantics

**Batching & coalescing** — multiple writes to the same key coalesce into a single notification per `queue.flush()`. Delivery is driven by updated key sets, not by every write.

**Reentrancy** — writing to a store from a subscription callback *during* `queue.flush()` throws (`updates during queue.flush() are not allowed`). Effects and computeds run at `AFTER_FLUSH`, when the queue is no longer flushing; writes made there are allowed and batched into the **next** flush.

**Single-pass flush** — `queue.flush()` runs each currently-pending task once (buffer swap, no re-drain loop). Tasks enqueued *during* a flush land in a fresh buffer and run on the next flush (scheduled tick or next manual `flush()`), not within the same call.

**Key-scoped subscriptions** — there is no "subscribe to everything". Delivery cost is proportional to the subscriber sets for changed keys only.

## Missing entities: the holes policy

A pk can point at nothing — an entity was never upserted, or was removed while some index or caller
still holds its pk. OIMDB has one rule for that across the whole library:

> **Reads are length-aligned and surface the gap as `undefined`. Dropping it is always a separate,
> explicitly named call.**

A missing entity is a real state of the store, not noise. Hiding it turns a torn state into a list
that is quietly one item short — the kind of bug that shows up far from its cause.

```ts
collection.getManyByPks(['u1', 'gone', 'u2']);
// → [User, undefined, User]     length-aligned, the gap is visible

collection.getManyByPksCompact(['u1', 'gone', 'u2']);
// → [User, User]                filtered, SHORTER than the input — deliberate
```

The same contract holds everywhere entities come back as a list:

| Read | Shape |
| --- | --- |
| `collection.getManyByPks(pks)` | `(TEntity \| undefined)[]` |
| `collection.getManyByPksCompact(pks)` | `TEntity[]`, may be shorter |
| `index.getEntitiesByKey(key)` | `(TEntity \| undefined)[]` |
| `globalIndex.getEntities()` | `(TEntity \| undefined)[]` |
| every selector returning a list | `readonly (TEntity \| undefined)[]` |
| `stream.getEntitiesByKey(key)` | `(TEntity \| undefined)[]` |

### When holes cannot happen

A **derived** index is dense by construction: every pk in it was put there by an entity that exists,
and removal maintains it. Reading through one, the `| undefined` is spurious — but it is still the
honest type, because the store cannot know where your pks came from.

A **manual** index (`arrayBasedIndex`, `composite*Index`, anything written with `setPks`) holds pks
you wrote by hand. There a gap is entirely possible, and compacting it away is how a torn state
becomes invisible.

So: compact when the pks are dense and you know it; otherwise keep the alignment and handle the gap.
`@oimdb/exodra` mirrors this exactly — the default index read keeps holes, `.compact(key)` filters,
and `.unsafeDense(key)` only changes the type while checking nothing, named so the assertion is
visibly yours.

## Composite primary key

A collection's PK is usually a primitive (`string`/`number`). It can instead be a **composite key path** — an arbitrary-length tuple of primitive segments, e.g. `[userId, projectId]`. Pass a trie-backed store:

```typescript
import { OIMReactiveCollection, OIMCollectionStoreTrieDriven } from '@oimdb/core';

const memberships = new OIMReactiveCollection<Membership, readonly (string | number)[]>(
  queue,
  {
    selectPk: (m) => [m.userId, m.projectId],
    store: new OIMCollectionStoreTrieDriven<Membership>(),
  }
);

memberships.getOneByPk([1, 10]);       // matched by content — a fresh array is fine
memberships.subscribeOnKey([1, 10], render);
memberships.removeOneByPk([1, 10]);
```

Key paths are matched **by content** (a freshly built `[1, 10]` resolves to the same entity as one stored earlier); the store interns each logical PK to one canonical `slot.pk` reference. Primitive-PK collections keep the native-`Map` store (`OIMCollectionStoreMapDriven`) untouched — no cost.

Indexes work over a composite-PK collection too — `indexFactory.setBasedIndex()` indexes composite PKs, matching them by content in `setPks`/`addPks`/`removePks`.

**Serialization** (Redux, persist, snapshots) keys by a string, so a composite PK there needs an `IOIMPkCodec` (`OIMPkCodecKeyPath` is the ready one). `@oimdb/persist` and `@oimdb/snapshot-manager` store the PK as a value and need no codec; `@oimdb/redux-adapter` keys state by string and takes the codec (see its docs).
