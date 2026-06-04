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

**Reentrancy** — updates triggered inside a subscriber are collected into the next internal batch. `queue.flush()` is a full drain: work enqueued during a flush runs within the same call.

**Key-scoped subscriptions** — there is no "subscribe to everything". Delivery cost is proportional to the subscriber sets for changed keys only.
