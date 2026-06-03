---
sidebar_position: 1
---

# Core Model

OIMDB's current app-level model is:

- a shared `OIMEventQueue`
- a collection model created with `createOIMCollectionContext`
- relations that live next to the collection
- selectors for reactive reads

Collections remain the source of truth for entities. Indexes and ordered lists keep canonical collection slots, but they are not stored inside the collection.

## Collection Model

```typescript
import {
  createOIMCollectionContext,
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

const users = createOIMCollectionContext<User, string>(queue, {
  selectPk: (user) => user.id,
});
```

The model facade contains:

```typescript
type TOIMCollectionContext<TEntity, TPk> = {
  queue: OIMEventQueue;
  collection: OIMReactiveCollection<TEntity, TPk>;
  relations: OIMCollectionRelations<TEntity, TPk>;
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

## Low-Level Primitives

The DX model is only a small facade. You can still use the lower-level classes directly when you need explicit ownership:

- `OIMReactiveCollection`
- `OIMReactiveCollectionIndexManualSetBased`
- `OIMReactiveCollectionIndexManualArrayBased`
- `OIMCollectionRelations`
- `OIMCollectionSelectors`

Prefer the facade for application schemas, and use direct constructors for advanced integration boundaries.
