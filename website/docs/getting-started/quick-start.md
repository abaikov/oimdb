---
sidebar_position: 2
---

# Quick Start

This guide walks through the core mental model: a shared event queue, a collection model, relations, and selectors.

## 1. Create an Event Queue

All reactive components share one queue. The scheduler controls when subscribers run:

```typescript
import { OIMEventQueue, OIMEventQueueSchedulerFactory } from '@oimdb/core';

const queue = new OIMEventQueue({
  scheduler: OIMEventQueueSchedulerFactory.createMicrotask(),
});
```

Common schedulers:

| Scheduler | Use case |
|-----------|----------|
| `createMicrotask()` | Default — fast, same-tick delivery |
| `createTimeout(0)` | Batch many writes before notifying |
| `createAnimationFrame()` | UI-friendly, aligned with paint |
| `createImmediate()` | Synchronous — useful in tests |

## 2. Create a Collection Model

The DX model keeps the core pieces together without storing indexes inside the collection:

```typescript
import { createOIMCollectionContext } from '@oimdb/core';

type User = {
  id: string;
  name: string;
  email: string;
  teamId: string;
};

const users = createOIMCollectionContext<User, string>(queue, {
  selectPk: (user) => user.id,
});
```

Writes return **canonical slots** — stable object references that indexes can hold:

```typescript
const slot = users.collection.upsertOne({
  id: 'user1',
  name: 'John',
  email: 'john@example.com',
  teamId: 'team-a',
});

// Updating keeps the same slot object
const updatedSlot = users.collection.upsertOne({
  id: 'user1',
  name: 'John Doe',
  email: 'john@example.com',
  teamId: 'team-a',
});

console.log(slot === updatedSlot); // true
```

## 3. Subscribe to Changes

Subscriptions are key-scoped — you only pay for keys you watch:

```typescript
users.collection.updateEventEmitter.subscribeOnKey('user1', () => {
  console.log('user1 changed');
});

users.collection.updateEventEmitter.subscribeOnKeys(['user1', 'user2'], () => {
  console.log('user1 or user2 changed');
});
```

After mutations, flush the queue (or wait for the scheduler):

```typescript
users.collection.upsertOne({
  id: 'user1',
  name: 'Jane',
  email: 'jane@example.com',
  teamId: 'team-a',
});
await queue.flush();
```

## 4. Add a Relation and Selector

Derived indexes maintain membership from entity data. Selectors give you reactive reads:

```typescript
const usersByTeam = users.relations.derivedSetIndex((user) => user.teamId);
const teamUsers = users.select.entitiesBySetIndexKey(usersByTeam, 'team-a');

teamUsers.watch((value) => {
  console.log(value);
});
```

## 5. Process Events

Multiple writes to the same key coalesce into a single notification per flush:

```typescript
users.collection.upsertOne({
  id: 'user1',
  name: 'A',
  email: 'a@example.com',
  teamId: 'team-a',
});
users.collection.upsertOne({
  id: 'user1',
  name: 'B',
  email: 'b@example.com',
  teamId: 'team-a',
});
users.collection.upsertOne({
  id: 'user1',
  name: 'C',
  email: 'c@example.com',
  teamId: 'team-a',
});

await queue.flush();
// subscribeOnKey('user1') fires once
```

## What's Next

- [Architecture Overview](/docs/architecture/overview) — layers, slots, event semantics
- [Core Model](/docs/core/model) — collection model and slot ownership
- [Relations and Selectors](/docs/core/relations-selectors) — derived indexes and reactive reads
- [Performance Guide](/docs/guides/performance) — benchmarks and tuning
- [Packages](/docs/packages/overview) — integration packages (React, Redux, async)
