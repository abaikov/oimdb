---
sidebar_position: 1
---

# OIMDB

A high-performance, event-driven in-memory database designed specifically for frontend applications. OIMDB provides reactive collections, intelligent indexing, and configurable event processing for building fast, predictable state management solutions.

## Packages

OIMDB is organized as a monorepo with separate npm packages:

| Package | Description |
|---------|-------------|
| [`@oimdb/core`](/docs/packages/overview#oimdbcore) | Reactive collections, indexes, event queue, selectors |
| [`@oimdb/react`](/docs/packages/overview#oimdbreact) | React hooks and context helpers |
| [`@oimdb/redux-adapter`](/docs/packages/overview#oimdbredux-adapter) | Two-way Redux synchronization |
| [`@oimdb/async`](/docs/packages/overview#oimdbasync) | Async collections and indexes |
| [`@oimdb/persist`](/docs/packages/overview#oimdbpersist) | Storage-specific persistence resources for OIMDB primitives |
| [`@oimdb/snapshot-manager`](/docs/packages/overview#oimdbsnapshot-manager) | Snapshot persistence utilities |

## Key Benefits

- **Performance first** — Map-based storage with O(1) lookups
- **Reactive architecture** — Key-scoped subscriptions with intelligent coalescing
- **Type safety** — Full TypeScript support with advanced generics
- **Configurable** — Multiple scheduler options for different use cases
- **Modular** — Use only what you need, extend what you want

## Quick Example

```typescript
import {
  createOIMCollectionContext,
  OIMEventQueue,
  OIMEventQueueSchedulerFactory,
} from '@oimdb/core';

interface User {
  id: string;
  name: string;
  email: string;
  teamId: string;
}

const queue = new OIMEventQueue({
  scheduler: OIMEventQueueSchedulerFactory.createMicrotask(),
});

const users = createOIMCollectionContext<User, string>(queue, {
  selectPk: (user) => user.id,
});
const usersByTeam = users.relations.derivedSetIndex((user) => user.teamId);
const teamUsers = users.select.entitiesBySetIndexKey(usersByTeam, 'team1');

users.collection.updateEventEmitter.subscribeOnKey('user1', () => {
  console.log('User1 updated!');
});

const userSlot = users.collection.upsertOne({
  id: 'user1',
  name: 'John',
  email: 'john@example.com',
  teamId: 'team1',
});

const updatedUserSlot = users.collection.upsertOne({
  id: 'user1',
  name: 'John Doe',
  email: 'john@example.com',
  teamId: 'team1',
});

console.log(userSlot === updatedUserSlot); // true
teamUsers.watch((value) => console.log(value));
// Only one notification fires due to intelligent coalescing
```

## Next Steps

- [Installation](/docs/getting-started/installation) — install the packages you need
- [Quick Start](/docs/getting-started/quick-start) — build your first reactive schema
- [Core Model](/docs/core/model) — understand collections, slots, relations, and selectors
- [Relations and Selectors](/docs/core/relations-selectors) — derived indexes, manual relations, and selector DX
- [Architecture](/docs/architecture/overview) — design principles and component structure
- [Performance Guide](/docs/guides/performance) — benchmarks and optimization strategies
