# @oimdb/core

Core in-memory data library providing reactive collections, intelligent indexing, and configurable event processing.

📖 **[Full documentation](https://abaikov.github.io/oimdb/)**

## For AI Assistants

If you are an AI assistant working on a project that uses OIMDB, read the full API reference before writing any code. It covers all packages, key concepts, code patterns, and naming conventions — the API has specific patterns that are easy to get wrong without context.

The file ships with this package. Read it at:

```
node_modules/@oimdb/core/llms.txt
```

Or fetch from CDN if working without local files:

```
https://cdn.jsdelivr.net/npm/@oimdb/core/llms.txt
```

If the project has `@oimdb/devtools` installed, also look for `debug.ts` or `*.debug.ts` files — they register the app's specific collections, indexes, and computeds by name and describe their relations. This is the fastest way to understand the specific data model you're working with.

**Cursor users:** Cursor does not index `node_modules`, so it will not find this README automatically. Add a `.cursor/rules/oimdb.mdc` file to your project:

```
Read node_modules/@oimdb/core/llms.txt before writing any OIMDB code.
```

## 🚀 Installation

```bash
npm install @oimdb/core
```

## 📦 What's Included

This package exports all the core classes, interfaces, and types needed to build reactive in-memory database solutions:

### Core Classes
- **OIMReactiveCollection**: Reactive entity storage with automatic change notifications
- **OIMCollectionRelations**: Helper for creating collection-bound indexes and ordered lists next to a collection
- **OIMReactiveIndexManualSetBased**: Reactive index with Set-based storage (efficient for incremental updates)
- **OIMReactiveIndexManualArrayBased**: Reactive index with Array-based storage (efficient for full replacements)
- **OIMReactiveCollectionIndexManualSetBased**: Collection-bound Set-based index with safe PK-oriented writes
- **OIMReactiveCollectionIndexManualArrayBased**: Collection-bound Array-based index with safe PK-oriented writes
- **OIMOrderedListCommandStream**: Slot-first ordered per-key lists with incremental commands for imperative consumers
- **OIMCollectionOrderedListCommandStream**: Collection-bound ordered lists with PK writes and slot/entity command payloads
- **OIMEventQueue**: Configurable event processing queue with scheduler integration
- **OIMCollection**: Base collection with CRUD operations and event emission

### Event System
- **OIMUpdateEventEmitter**: Key-based subscriptions with batching/deduplication (no buffering if there are no subscribers)
- **OIMEventEmitter**: Generic type-safe event emitter
- **Schedulers**: Multiple event processing strategies (microtask, timeout, animationFrame, immediate)

### Reactive Primitives
- **OIMEffect**: Reactive effects that run when dependencies change
- **OIMComputed**: Derived values that recompute when dependencies change
- **OIMSelector**: Value watchers that deliver updates only when values actually change
  - `OIMCollectionByPkSelector`: Watch single entity from collection
  - `OIMCollectionByPksSelector`: Watch multiple entities from collection
  - `OIMObjectValueByKeySelector`: Watch single key from reactive object
  - `OIMEntitiesByIndexKey*Selector`: Watch entities by index key

### Storage & Indexing
- **OIMCollectionStoreMapDriven**: Map-based storage backend
- **OIMIndexManualSetBased**: Set-based manual index (stores slots, projects to `Set<TPk>`)
- **OIMIndexManualArrayBased**: Array-based manual index (stores slots, projects to `TPk[]`)
- **OIMIndexManualOrderedArrayBased**: Slot-first manual ordered Array-based index with `pushSlot`, `insertSlotAt`, `removeAt`, `move`, and `resetSlots`
- **OIMIndexStoreMapDrivenSetBased**: Set-based slot index storage backend
- **OIMIndexStoreMapDrivenArrayBased**: Array-based slot index storage backend
- **OIMMap2Keys**: Two-key mapping utilities for complex indexing

### Abstract Classes & Interfaces
- **OIMCollectionStore**: Storage backend interface
- **OIMEventQueueScheduler**: Event processing scheduler interface
- **OIMIndexSetBased**: Base Set-based index interface (slot-backed, projects to `Set<TPk>`)
- **OIMIndexArrayBased**: Base Array-based index interface (slot-backed, projects to `TPk[]`)
- **OIMReactiveIndexSetBased**: Reactive Set-based index interface
- **OIMReactiveIndexArrayBased**: Reactive Array-based index interface

### Types & Enums
- **TOIM\***: Generic types for collections, indices, events, and schedulers
- **EOIM\***: Enums for event types and scheduler types
- **IOIM\***: Interfaces for event handlers and scheduler events

## 🔧 Basic Usage

### DX Collection Model

Use the `dx` factories when you want a concise entrypoint without changing the underlying model. The collection still owns entities, and relations still live next to it.

```typescript
import {
    createOIMCollectionContext,
    OIMEventQueue,
    OIMEventQueueSchedulerFactory
} from '@oimdb/core';

type User = {
    id: string;
    name: string;
    teamId: string;
};

const queue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});
const users = createOIMCollectionContext<User, string>(queue, {
    selectPk: user => user.id,
});

const usersByTeam = users.indexFactory.derivedSetIndex(user => user.teamId);
const teamUsers = users.select.entitiesBySetIndexKey(usersByTeam, 'team1');

users.collection.upsertMany([
    { id: 'u1', name: 'Alice', teamId: 'team1' },
    { id: 'u2', name: 'Bob', teamId: 'team1' },
]);

teamUsers.watch(value => {
    console.log(value); // Alice, Bob
});
```

### Creating a Reactive Collection

```typescript
import { 
    OIMReactiveCollection, 
    OIMEventQueue,
    OIMEventQueueSchedulerFactory
} from '@oimdb/core';

interface User {
    id: string;
    name: string;
    email: string;
}

// Create event queue with microtask scheduler
const queue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});

// Create reactive collection
const users = new OIMReactiveCollection<User, string>(queue, {
    selectPk: (user) => user.id
});

// Subscribe to key-specific updates
users.updateEventEmitter.subscribeOnKey('user1', () => {
    console.log('User1 changed!');
});

// Subscribe to multiple keys
users.updateEventEmitter.subscribeOnKeys(['user1', 'user2'], () => {
    console.log('Users changed!');
});

// CRUD operations return canonical slots.
const user1Slot = users.upsertOne({
    id: 'user1',
    name: 'John Doe',
    email: 'john@example.com'
});
const otherSlots = users.upsertMany([
    { id: 'user2', name: 'Jane Smith', email: 'jane@example.com' },
    { id: 'user3', name: 'Bob Wilson', email: 'bob@example.com' }
]);

// Updating an entity keeps the same slot object and updates slot.item.
const updatedUser1Slot = users.upsertOne({
    id: 'user1',
    name: 'John Smith',
    email: 'john@example.com'
});
console.log(user1Slot === updatedUser1Slot); // true

// Query operations
const user = users.getOneByPk('user1');
const multipleUsers = users.getManyByPks(['user1', 'user2']);
const userSlot = users.getSlotByPk('user1');
```

### Creating a Reactive Index

OIMDB provides two types of indexes optimized for different use cases:

Indexes are slot-backed internally and expose PK projections through `getPksByKey` (`Set<TPk>` for SetBased, `TPk[]` for ArrayBased). Raw indexes can be used as standalone PK/slot structures. When an index belongs to a collection, prefer `OIMReactiveCollectionIndexManual*`; it binds the collection at construction time so PK writes resolve canonical collection slots without a later lifecycle setter.

For most app-level entity relations, start with `createOIMCollectionContext(...).indexFactory.derivedSetIndex(...)` or `.derivedArrayIndex(...)`. The manual indexes below are the advanced path for externally maintained memberships such as search results, permissions, or server-provided order.

#### SetBased Indexes (for incremental updates)

```typescript
import {
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualSetBased,
    OIMEventQueue
} from '@oimdb/core';

type User = { id: string; role: string };

// Create Set-based reactive index for user roles
const queue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});

const users = new OIMReactiveCollection<User, string>(queue, {
    selectPk: (user) => user.id
});
const userRoleIndex =
    new OIMReactiveCollectionIndexManualSetBased<string, string, User>(
        queue,
        { collection: users }
    );

// Subscribe to specific index key changes
userRoleIndex.updateEventEmitter.subscribeOnKey('admin', () => {
    console.log('Admin users changed:', userRoleIndex.getPksByKey('admin')); // Set<string>
});

// Build the index manually
userRoleIndex.setPks('admin', ['user1']);
userRoleIndex.setPks('user', ['user2', 'user3']);

// Add more users to existing roles (efficient for Set-based)
userRoleIndex.addPks('admin', ['user2']);

// Query the index - returns Set
const adminUsers = userRoleIndex.index.getPksByKey('admin'); // Set(['user1', 'user2'])
const regularUsers = userRoleIndex.index.getPksByKey('user'); // Set(['user2', 'user3'])

// Remove users from roles (efficient for Set-based)
userRoleIndex.removePks('admin', ['user1']);
```

#### ArrayBased Indexes (for full replacements)

```typescript
import {
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualArrayBased,
    OIMEventQueue
} from '@oimdb/core';

type Card = { id: string; deckId: string };

// Create Array-based reactive index for deck cards
const queue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});

const cards = new OIMReactiveCollection<Card, string>(queue, {
    selectPk: (card) => card.id
});
const cardsByDeckIndex =
    new OIMReactiveCollectionIndexManualArrayBased<string, string, Card>(
        queue,
        { collection: cards }
    );

// Subscribe to specific index key changes
cardsByDeckIndex.updateEventEmitter.subscribeOnKey('deck1', () => {
    console.log('Deck cards changed:', cardsByDeckIndex.getPksByKey('deck1')); // string[]
});

// Build the index manually - set full array
cardsByDeckIndex.setPks('deck1', ['card1', 'card2', 'card3']);

// Query the index - returns Array
const deckCards = cardsByDeckIndex.index.getPksByKey('deck1'); // ['card1', 'card2', 'card3']

// For Array-based indexes, prefer setPks for updates (addPks/removePks are available but less efficient)
cardsByDeckIndex.setPks('deck1', ['card1', 'card2', 'card4']); // Full replacement (recommended)
// cardsByDeckIndex.addPks('deck1', ['card5']); // Works but less efficient than SetBased
```

**When to use which:**
- **SetBased**: Use when you frequently add/remove individual items (`addPks`/`removePks` are efficient) and order doesn't matter
- **ArrayBased**: Use when you typically replace the entire array (`setPks` is more efficient, no diff computation needed) or when you need to preserve element order/sorting

#### Ordered List Command Streams

Use `OIMCollectionOrderedListCommandStream` when you need an ordered list per key, PK-oriented writes, canonical collection slots, and incremental commands for an imperative renderer or external store. Use `OIMOrderedListCommandStream` directly only when you already manage slots yourself.

```typescript
import {
    OIMEventQueue,
    OIMReactiveCollection,
    OIMCollectionOrderedListCommandStream
} from '@oimdb/core';

type Card = { id: string; title: string };

const queue = new OIMEventQueue();
const cards = new OIMReactiveCollection<Card, string>(queue, {
    selectPk: card => card.id,
});
const cardsByDeck = new OIMCollectionOrderedListCommandStream<
    string,
    string,
    Card
>(queue, { collection: cards });

cards.upsertMany([
    { id: 'card1', title: 'Intro' },
    { id: 'card2', title: 'Details' },
    { id: 'card3', title: 'Summary' },
]);

cardsByDeck.commandsEventEmitter.subscribeOnKey('deck1', () => {
    const commands = cardsByDeck.consumeCommands('deck1');

    for (const command of commands) {
        switch (command.type) {
            case 'insert':
                // Insert command.pk / command.slot.item at command.index
                break;
            case 'remove':
                // Remove command.pk from command.index
                break;
            case 'move':
                // Move command.pk from command.fromIndex to command.toIndex
                break;
            case 'set':
                // Replace the whole list with command.pks or command.slots
                break;
        }
    }
});

cardsByDeck.set('deck1', ['card1', 'card2']);
cardsByDeck.move('deck1', 1, 0);
cardsByDeck.push('deck1', 'card3');

queue.flush(); // Delivers one batched command notification for deck1

console.log(cardsByDeck.getPksByKey('deck1')); // ['card2', 'card1', 'card3']
console.log(cardsByDeck.getEntitiesByKey('deck1')); // [{ id: 'card2', ... }, ...]
```

If you mutate `cardsByDeck.index` directly, the stream cannot know the exact operation and emits a `set` command so consumers can resync.

### Event Queue and Schedulers

```typescript
import { 
    OIMEventQueue,
    OIMEventQueueSchedulerFactory,
    TOIMSchedulerType
} from '@oimdb/core';

// Create event queues with different schedulers
const microtaskQueue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.create('microtask')
});

const timeoutQueue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.create('timeout', { delay: 100 })
});

const animationFrameQueue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.create('animationFrame')
});

const immediateQueue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.create('immediate')
});

// Manual queue operations
const manualQueue = new OIMEventQueue(); // No scheduler

manualQueue.enqueue(() => console.log('Task 1'));
manualQueue.enqueue(() => console.log('Task 2'));

// Manually flush when ready
manualQueue.flush();

// Queue introspection
console.log('Queue length:', manualQueue.length);
console.log('Is empty:', manualQueue.isEmpty);
```

## 🏗️ Advanced Usage

### Collections with Bound Indexes

```typescript
import { 
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualSetBased,
    OIMReactiveCollectionIndexManualArrayBased,
    OIMEventQueue,
    OIMEventQueueSchedulerFactory
} from '@oimdb/core';

interface User {
    id: string;
    name: string;
    email: string;
    teamId: string;
    role: 'admin' | 'user';
}

// Create event queue
const queue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});

// Collections own entities.
const users = new OIMReactiveCollection<User, string>(queue, {
    selectPk: (user: User) => user.id
});

// Indexes live next to collections and bind to them at construction time.
const indexes = {
    usersByTeam: new OIMReactiveCollectionIndexManualSetBased<
        string,
        string,
        User
    >(queue, { collection: users }),
    usersByRole: new OIMReactiveCollectionIndexManualArrayBased<
        string,
        string,
        User
    >(queue, { collection: users })
};

// Subscribe to index changes
indexes.usersByTeam.updateEventEmitter.subscribeOnKey('engineering', () => {
    console.log('Engineering team changed:', indexes.usersByTeam.getPksByKey('engineering'));
});

// Add users and update indexes
users.upsertMany([
    { id: 'u1', name: 'John', email: 'john@test.com', teamId: 'engineering', role: 'admin' },
    { id: 'u2', name: 'Jane', email: 'jane@test.com', teamId: 'engineering', role: 'user' }
]);

// Update indexes manually
indexes.usersByTeam.setPks('engineering', ['u1', 'u2']);
indexes.usersByRole.setPks('admin', ['u1']);
```

### Collection Relations Helper

Use `createOIMCollectionRelations` when you want the same clean model with less constructor noise. It does not store indexes inside the collection; it only keeps the shared `queue + collection` binding for related structures that live next to the collection.

```typescript
import {
    createOIMCollectionRelations,
    OIMReactiveCollection,
    OIMEventQueue
} from '@oimdb/core';

type User = {
    id: string;
    name: string;
    teamId: string;
};

type Card = {
    id: string;
    deckId: string;
    position: number;
};

const queue = new OIMEventQueue();
const users = new OIMReactiveCollection<User, string>(queue, {
    selectPk: user => user.id,
});
const userRelations = createOIMCollectionRelations(queue, users);
const cards = new OIMReactiveCollection<Card, string>(queue, {
    selectPk: card => card.id,
});
const cardRelations = createOIMCollectionRelations(queue, cards);

// Derived indexes update themselves from collection writes.
const usersByTeam = userRelations.derivedSetIndex(user => user.teamId);
const cardsByDeck = cardRelations.derivedArrayIndex(
    card => card.deckId,
    { orderBy: card => card.position }
);

// Manual relations are still available when membership comes from outside.
const searchResults = userRelations.arrayBasedIndex<string>();
const orderedUsers = userRelations.orderedList<string>();

users.upsertMany([
    { id: 'u1', name: 'Alice', teamId: 'team1' },
    { id: 'u2', name: 'Bob', teamId: 'team1' },
]);
cards.upsertMany([
    { id: 'c1', deckId: 'deck1', position: 2 },
    { id: 'c2', deckId: 'deck1', position: 1 },
]);

searchResults.setPks('query:alice', ['u1']);
orderedUsers.set('visible', ['u1', 'u2']);
queue.flush();

console.log(usersByTeam.getEntitiesByKey('team1')); // Alice, Bob
console.log(cardsByDeck.getPksByKey('deck1')); // ['c2', 'c1']
console.log(orderedUsers.getPksByKey('visible')); // ['u1', 'u2']
```

### Custom Entity Updater

```typescript
import { 
    TOIMEntityUpdater, 
    OIMReactiveCollection, 
    OIMEventQueue 
} from '@oimdb/core';

// Custom deep merge updater
const deepMergeUpdater: TOIMEntityUpdater<User> = (newEntity, oldEntity) => {
    const result = { ...oldEntity };
    
    for (const [key, value] of Object.entries(newEntity)) {
        if (value !== undefined) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = deepMergeUpdater(value, result[key] || {});
            } else {
                result[key] = value;
            }
        }
    }
    
    return result;
};

// Use custom updater with reactive collection
const queue = new OIMEventQueue();
const users = new OIMReactiveCollection<User, string>(queue, {
    selectPk: (user) => user.id,
    updateEntity: deepMergeUpdater
});

// Now updates will use deep merge logic
users.upsertOne({ id: 'user1', name: 'John' });
users.upsertOne({ id: 'user1', email: 'john@example.com' }); // Merges with existing
```

### Event Coalescing and Update Subscriptions

```typescript
import { 
    OIMReactiveCollection, 
    OIMEventQueue,
    OIMEventQueueSchedulerFactory 
} from '@oimdb/core';

// Create collection with microtask scheduler for coalescing
const queue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});

const users = new OIMReactiveCollection<User, string>(queue);

// Subscribe to coalesced updates for specific keys
users.updateEventEmitter.subscribeOnKey('user1', () => {
    console.log('User1 updated (coalesced)');
});

// Multiple rapid updates to same key will be coalesced
users.upsertOne({ id: 'user1', name: 'John' });
users.upsertOne({ id: 'user1', name: 'John Doe' });
users.upsertOne({ id: 'user1', email: 'john@example.com' });

// Only one notification will fire (in next microtask)

// (No separate "coalescer" object exists: batching/deduplication is handled inside OIMUpdateEventEmitter.)
```

## 🔄 Reactive Architecture

### Event-Driven Updates

OIMDB core uses a reactive architecture where changes automatically trigger notifications to subscribers:

```typescript
// Collection updates trigger events through the event queue
collection.upsertOne(entity) → updateEventEmitter → event queue → subscribers

// Key-specific subscriptions only notify when relevant data changes
updateEventEmitter.subscribeOnKey('user1', callback) // Only fires for user1 changes
```

### Event Coalescing

Multiple rapid changes to the same entity are automatically coalesced:

```typescript
// These three updates...
users.upsertOne({ id: 'user1', name: 'John' });
users.upsertOne({ id: 'user1', email: 'john@test.com' });
users.upsertOne({ id: 'user1', role: 'admin' });

// ...result in only one notification with the final state
// This prevents unnecessary re-renders and improves performance
```

### Effects, Computed, and the Event Lifecycle

OIMDB uses a single-pass flush boundary: `queue.flush()` executes the current batch of pending work.

Effects and computed values are scheduled through `OIMComputativeRuntime`, which is backed by the same queue. This keeps the public API simple and avoids a multi-phase flush model.

#### What is an Effect?

`OIMEffect` is the base reactive primitive: it subscribes to dependencies and calls `run()` when those dependencies change. It coalesces multiple invalidations during the same flush into a single run.

**Basic example with reactive object:**

```typescript
import {
  OIMEffect,
  OIMComputativeRuntime,
  OIMEventQueue,
  OIMReactiveObject,
  OIMEffectDependencyKeyedObject,
} from '@oimdb/core';

type TKey = 'a';

const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const obj = new OIMReactiveObject<TKey, number>(queue);

const effect = new OIMEffect(runtime, {
  deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
  run: () => {
    console.log('obj.a changed');
  },
});

obj.setProperty('a', 1);
queue.flush();

effect.destroy();
obj.destroy();
queue.destroy();
```

**Effect with collection dependency:**

```typescript
import {
  OIMEffect,
  OIMComputativeRuntime,
  OIMEventQueue,
  OIMReactiveCollection,
  OIMEffectDependencyKeyedCollection,
} from '@oimdb/core';

interface User {
  id: string;
  name: string;
}

const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const users = new OIMReactiveCollection<User, string>(queue, {
  selectPk: (u) => u.id,
});

const effect = new OIMEffect(runtime, {
  deps: [new OIMEffectDependencyKeyedCollection(users, 'user1')],
  run: () => {
    const user = users.getOneByPk('user1');
    console.log('User1 changed:', user);
  },
});

users.upsertOne({ id: 'user1', name: 'John' });
queue.flush();

effect.destroy();
users.destroy();
queue.destroy();
```

**Effect with index dependency:**

```typescript
import {
  OIMEffect,
  OIMComputativeRuntime,
  OIMEventQueue,
  OIMReactiveCollection,
  OIMReactiveCollectionIndexManualSetBased,
  OIMEffectDependencyKeyedIndex,
} from '@oimdb/core';

interface User {
  id: string;
  name: string;
}

const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const users = new OIMReactiveCollection<User, string>(queue, {
  selectPk: (u) => u.id,
});
const roleIndex = new OIMReactiveCollectionIndexManualSetBased<string, string, User>(
  queue,
  { collection: users }
);

const effect = new OIMEffect(runtime, {
  deps: [new OIMEffectDependencyKeyedIndex(roleIndex, 'admin')],
  run: () => {
    const adminPks = roleIndex.getPksByKey('admin');
    console.log('Admin users changed:', Array.from(adminPks));
  },
});

users.upsertMany([
  { id: 'user1', name: 'Alice' },
  { id: 'user2', name: 'Bob' },
]);
roleIndex.setPks('admin', ['user1', 'user2']);
queue.flush();

effect.destroy();
roleIndex.destroy();
users.destroy();
queue.destroy();
```

**Effect with multiple dependencies:**

```typescript
import {
  OIMEffect,
  OIMComputativeRuntime,
  OIMEventQueue,
  OIMReactiveObject,
  OIMReactiveCollection,
  OIMEffectDependencyKeyedObject,
  OIMEffectDependencyKeyedCollection,
} from '@oimdb/core';

const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const settings = new OIMReactiveObject<'theme' | 'lang', string>(queue);
const users = new OIMReactiveCollection<User, string>(queue, {
  selectPk: (u) => u.id,
});

const effect = new OIMEffect(runtime, {
  deps: [
    new OIMEffectDependencyKeyedObject(settings, ['theme', 'lang']),
    new OIMEffectDependencyKeyedCollection(users, 'currentUser'),
  ],
  run: () => {
    const theme = settings.get('theme');
    const user = users.getOneByPk('currentUser');
    console.log('Settings or user changed:', { theme, user });
  },
});

settings.setProperty('theme', 'dark');
users.upsertOne({ id: 'currentUser', name: 'John' });
queue.flush(); // Effect runs once, even though multiple deps changed

effect.destroy();
settings.destroy();
users.destroy();
queue.destroy();
```

#### What is a Computed?

`OIMComputed<T>` is built on top of `OIMEffect`: it recomputes a derived value and emits `update` when the value changes.

**Basic example:**

```typescript
import {
  OIMComputed,
  OIMEventQueue,
  OIMComputativeRuntime,
  OIMReactiveObject,
  OIMEffectDependencyKeyedObject,
} from '@oimdb/core';

type TKey = 'a';
const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const obj = new OIMReactiveObject<TKey, number>(queue);

const doubled = new OIMComputed<number>(runtime, {
  compute: () => (obj.get('a') ?? 0) * 2,
  deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
});

obj.setProperty('a', 10);
queue.flush(); // run scheduled work

console.log(doubled.get()); // 20

// If you also subscribe to computed updates, delivery happens in the same drain flush:
let calls = 0;
doubled.updateEventEmitter.subscribeOnKey('value', () => {
  calls++;
});
obj.setProperty('a', 11);
queue.flush(); // run scheduled work
console.log(calls); // 1

doubled.destroy();
obj.destroy();
queue.destroy();
```

**Computed with collection and index dependencies:**

```typescript
import {
  OIMComputed,
  OIMEventQueue,
  OIMComputativeRuntime,
  OIMReactiveCollection,
  OIMReactiveCollectionIndexManualSetBased,
  OIMEffectDependencyKeyedCollection,
  OIMEffectDependencyKeyedIndex,
} from '@oimdb/core';

interface User {
  id: string;
  name: string;
  role: string;
}

const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const users = new OIMReactiveCollection<User, string>(queue, {
  selectPk: (u) => u.id,
});
const roleIndex = new OIMReactiveCollectionIndexManualSetBased<string, string, User>(
  queue,
  { collection: users }
);

// Computed that counts admin users
const adminCount = new OIMComputed<number>(runtime, {
  compute: () => {
    const adminPks = roleIndex.getPksByKey('admin');
    return adminPks.size;
  },
  deps: [new OIMEffectDependencyKeyedIndex(roleIndex, 'admin')],
});

// Computed that gets admin user names
const adminNames = new OIMComputed<string[]>(runtime, {
  compute: () => {
    const adminPks = Array.from(roleIndex.getPksByKey('admin'));
    return adminPks
      .map((pk) => users.getOneByPk(pk)?.name)
      .filter((name): name is string => name !== undefined);
  },
  deps: [
    new OIMEffectDependencyKeyedIndex(roleIndex, 'admin'),
    new OIMEffectDependencyKeyedCollection(users, Array.from(roleIndex.getPksByKey('admin'))),
  ],
});

users.upsertMany([
  { id: 'u1', name: 'Alice', role: 'admin' },
  { id: 'u2', name: 'Bob', role: 'user' },
]);
roleIndex.setPks('admin', ['u1']);
queue.flush();

console.log(adminCount.get()); // 1
console.log(adminNames.get()); // ['Alice']

adminNames.destroy();
adminCount.destroy();
roleIndex.destroy();
users.destroy();
queue.destroy();
```

#### Computed-to-Computed dependencies

For computed-to-computed dependencies you can use `OIMEffectDependencyComputed`.

```typescript
import {
  OIMComputed,
  OIMEffect,
  OIMComputativeRuntime,
  OIMEffectDependencyComputed,
  OIMEventQueue,
  OIMReactiveObject,
  OIMEffectDependencyKeyedObject,
} from '@oimdb/core';

type TKey = 'a';
const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const obj = new OIMReactiveObject<TKey, number>(queue);

const A = new OIMComputed<number>(runtime, {
  compute: () => (obj.get('a') ?? 0) + 1,
  deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
});

const B = new OIMComputed<number>(runtime, {
  compute: () => A.get() * 2,
  deps: [new OIMEffectDependencyComputed({ emitter: A.emitter, updateEventEmitter: A.updateEventEmitter })],
});

const effect = new OIMEffect(runtime, {
  deps: [new OIMEffectDependencyComputed({ emitter: B.emitter, updateEventEmitter: B.updateEventEmitter })],
  run: () => console.log('B changed'),
});

obj.setProperty('a', 1);
queue.flush(); // run scheduled work

effect.destroy();
B.destroy();
A.destroy();
obj.destroy();
queue.destroy();
```

#### What are Selectors?

Selectors provide a convenient way to watch and react to changes in collections, objects, and indexes. They automatically handle subscription management and deliver updates only when values actually change.

**Collection selector:**

```typescript
import {
  OIMCollectionByPkSelector,
  OIMCollectionByPksSelector,
  OIMComputativeRuntime,
  OIMEventQueue,
  OIMReactiveCollection,
} from '@oimdb/core';

interface User {
  id: string;
  name: string;
}

const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const users = new OIMReactiveCollection<User, string>(queue, {
  selectPk: (u) => u.id,
});

// Watch a single user
const userSelector = new OIMCollectionByPkSelector(runtime, users, 'user1');
const unwatch = userSelector.watch((user) => {
  console.log('User1 changed:', user);
});

users.upsertOne({ id: 'user1', name: 'John' });
queue.flush(); // Callback fires with { id: 'user1', name: 'John' }

// Watch multiple users
const usersSelector = new OIMCollectionByPksSelector(runtime, users, ['user1', 'user2']);
usersSelector.watch((users) => {
  console.log('Users changed:', users);
});

users.upsertMany([
  { id: 'user1', name: 'John Doe' },
  { id: 'user2', name: 'Jane Smith' },
]);
queue.flush(); // Callback fires with array of users

unwatch(); // Stop watching
usersSelector.watch(() => {}); // Get unsubscribe function
users.destroy();
queue.destroy();
```

**Selector with index (entities by index key):**

```typescript
import {
  OIMEntitiesByIndexKeySetBasedSelector,
  OIMComputativeRuntime,
  OIMEventQueue,
  OIMReactiveCollection,
  OIMReactiveCollectionIndexManualSetBased,
} from '@oimdb/core';

const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const users = new OIMReactiveCollection<User, string>(queue, {
  selectPk: (u) => u.id,
});
const roleIndex = new OIMReactiveCollectionIndexManualSetBased<string, string, User>(
  queue,
  { collection: users }
);

// Watch all admin users
const adminUsersSelector = new OIMEntitiesByIndexKeySetBasedSelector(
  runtime,
  users,
  roleIndex,
  'admin'
);

adminUsersSelector.watch((adminUsers) => {
  console.log('Admin users:', adminUsers.map((u) => u?.name));
});

users.upsertMany([
  { id: 'u1', name: 'Alice', role: 'admin' },
  { id: 'u2', name: 'Bob', role: 'admin' },
]);
roleIndex.setPks('admin', ['u1', 'u2']);
queue.flush(); // Callback fires with [Alice, Bob]

// When index changes, selector automatically resubscribes to new entities
roleIndex.setPks('admin', ['u1']);
queue.flush(); // Callback fires with [Alice]

adminUsersSelector.watch(() => {}); // Get unsubscribe function
roleIndex.destroy();
users.destroy();
queue.destroy();
```

**Object selector:**

```typescript
import {
  OIMObjectValueByKeySelector,
  OIMObjectValuesByKeysSelector,
  OIMComputativeRuntime,
  OIMEventQueue,
  OIMReactiveObject,
} from '@oimdb/core';

const queue = new OIMEventQueue();
const runtime = new OIMComputativeRuntime(queue);
const settings = new OIMReactiveObject<'theme' | 'lang', string>(queue);

// Watch single key
const themeSelector = new OIMObjectValueByKeySelector(runtime, settings, 'theme');
themeSelector.watch((theme) => {
  console.log('Theme changed:', theme);
});

// Watch multiple keys
const settingsSelector = new OIMObjectValuesByKeysSelector(runtime, settings, ['theme', 'lang']);
settingsSelector.watch((values) => {
  console.log('Settings changed:', values); // [theme, lang]
});

settings.setProperty('theme', 'dark');
queue.flush();

settings.destroy();
queue.destroy();
```

**Key differences: Effects vs Selectors:**

- **Effects** (`OIMEffect`): Run side effects when dependencies change. Use for logging, API calls, UI updates.
- **Selectors** (`OIMSelector`): Watch and deliver values only when they actually change. Use for reactive data access with automatic change detection.
- **Computed** (`OIMComputed`): Derive values from dependencies. Use for calculated/transformed data.

#### Gotchas (read this once)

- **Avoid cycles**: if A depends on B and B depends on A (directly or indirectly), you can get endless invalidation/recompute. Keep your dependency graph acyclic.
- **Keep `compute()` pure**: treat `compute()` as a pure function over current state. Doing writes inside `compute()` will create hard-to-debug re-entrancy.
- **Keep effects safe**: if you need to write to stores or trigger IO, do it from `OIMEffect`, but avoid creating endless update loops.
- **Always `destroy()`**: effects/computed/selectors subscribe to dependencies; if you create them dynamically, call `destroy()` or use the unsubscribe function to unsubscribe and free memory.
- **Selectors deliver only on change**: Selectors use equality checks (`areEqual`) to avoid delivering the same value multiple times. Override `areEqual` in custom selectors if needed.

### Scheduler Types

Choose the right scheduler for your use case:

- **`microtask`**: Most common - executes before next browser render
- **`timeout`**: Configurable delay for custom batching strategies  
- **`animationFrame`**: Syncs with browser rendering (60fps)
- **`immediate`**: Fastest execution using platform-specific APIs

### Reactive Collection Hierarchy

```
OIMCollection (base; upserts return canonical slots)
└── OIMReactiveCollection (adds updateEventEmitter wired to the queue)

OIMIndexSetBased (base for Set-based)
├── OIMIndexManualSetBased (manual Set-based index)
├── OIMReactiveIndexManualSetBased (reactive Set-based index with event emitter)
└── OIMReactiveCollectionIndexManualSetBased (collection-bound reactive Set-based index)

OIMIndexArrayBased (base for Array-based)
├── OIMIndexManualArrayBased (manual Array-based index)
├── OIMIndexManualOrderedArrayBased (slot-first manual ordered Array-based index)
├── OIMCollectionIndexManualOrderedArrayBased (collection-bound ordered Array-based index)
├── OIMReactiveIndexManualArrayBased (reactive Array-based index with event emitter)
└── OIMReactiveCollectionIndexManualArrayBased (collection-bound reactive Array-based index)

OIMOrderedListCommandStream (slot-first ordered-list command stream)
OIMCollectionOrderedListCommandStream (collection-bound ordered-list command stream)
```

## ⚡ Performance Characteristics

- **Collections**: O(1) primary key lookups using Map-based storage
- **Reactive Collections**: O(1) lookups + efficient event coalescing
- **Indices**: O(1) index lookups with lazy evaluation
- **Event System**: Smart coalescing prevents redundant notifications
- **Memory**: Efficient key-based subscriptions, no global listeners
- **Schedulers**: Configurable timing for optimal batching:
  - **Microtask**: ~1-5ms delay, ideal for UI updates
  - **Immediate**: <1ms, fastest execution  
  - **Timeout**: Custom delay for batching strategies
  - **AnimationFrame**: 16ms, synced with 60fps rendering

### Index Performance

**SetBased Indexes** (`OIMReactiveCollectionIndexManualSetBased`):
- **Storage**: Set of canonical entity slots
- **PK projection**: `getPksByKey` returns `Set<TPk>` for efficient membership checks
- **Entity reads**: selectors/hooks read `slot.item` directly, avoiding per-item collection lookups
- **Best for**: Frequent incremental updates using `addPks`/`removePks`
- **Performance**: O(1) add/remove operations, O(n) for `setPks` (requires Set creation)
- **Use case**: When you need to frequently add/remove individual items

**ArrayBased Indexes** (`OIMReactiveCollectionIndexManualArrayBased`):
- **Storage**: Array of canonical entity slots
- **PK projection**: `getPksByKey` returns `TPk[]` for direct array access
- **Entity reads**: selectors/hooks read `slot.item` directly, preserving array order
- **Best for**: Full array replacements using `setPks`
- **Performance**: O(1) `setPks` operation (direct assignment, no diff computation)
- **Use case**: When you typically replace the entire array (e.g., deck cards, ordered lists) or when you need to preserve element order/sorting
- **Note**: While `addPks`/`removePks` are available, they are less efficient (O(n)) than for SetBased indexes. For ArrayBased indexes, prefer `setPks` for better performance.

## 🔗 Integration Patterns

### With React (@oimdb/react)

```bash
npm install @oimdb/react
```

Create your collections outside React, wire them up once, then use hooks inside components:

```typescript
import { createOIMCollectionContext, OIMEventQueue } from '@oimdb/core';
import {
    OIMCollectionsProvider,
    useOIMCollectionsContext,
    useSelectEntityByPk,
    useSelectEntitiesByIndexKeySetBased,
} from '@oimdb/react';

// --- store.ts (created once, outside React) ---
const queue = new OIMEventQueue();
const { collection: users, indexFactory } =
    createOIMCollectionContext<User, string>(queue, { selectPk: (u) => u.id });
const byTeam = indexFactory.derivedSetIndex((u) => [u.teamId]);
export const collections = { users };
export { byTeam };

// --- App.tsx ---
function App() {
    return (
        <OIMCollectionsProvider collections={collections}>
            <TeamList teamId="team1" />
        </OIMCollectionsProvider>
    );
}

// --- TeamList.tsx ---
type AppCollections = typeof collections;

function TeamList({ teamId }: { teamId: string }) {
    const { users } = useOIMCollectionsContext<AppCollections>();
    const members = useSelectEntitiesByIndexKeySetBased(users, byTeam, teamId);
    return (
        <ul>
            {members?.map((u) => u && <li key={u.id}>{u.name}</li>)}
        </ul>
    );
}

function UserCard({ userId }: { userId: string }) {
    const { users } = useOIMCollectionsContext<AppCollections>();
    const user = useSelectEntityByPk(users, userId);
    return <span>{user?.name}</span>;
}
```

All hooks use `useSyncExternalStore` internally and re-render only when the specific data they watch actually changes.

### With Redux (@oimdb/redux-adapter)

Migrate from Redux to OIMDB gradually or use both systems side-by-side with automatic two-way synchronization:

```typescript
import { OIMDBAdapter } from '@oimdb/redux-adapter';
import { createStore, combineReducers, applyMiddleware } from 'redux';

// Create Redux adapter
const adapter = new OIMDBAdapter(queue);

// Create Redux reducer from OIMDB collection
const usersReducer = adapter.createCollectionReducer(users);

// Create middleware for automatic flushing
const middleware = adapter.createMiddleware();

// Use in existing Redux store
const store = createStore(
    combineReducers({
        users: usersReducer, // OIMDB-backed reducer
        ui: uiReducer,       // Existing Redux reducer
    }),
    applyMiddleware(middleware)
);

adapter.setStore(store);

// OIMDB changes automatically sync to Redux
// Redux actions automatically sync back to OIMDB with child reducers
// Middleware automatically flushes queue after each action - no manual flush needed!
```

**Key Benefits:**
- **🔄 Gradual Migration**: Migrate one collection at a time without breaking changes
- **🔄 Two-Way Sync**: Automatic synchronization between OIMDB and Redux
- **⚡ Automatic Flushing**: Middleware automatically processes events after Redux actions
- **📦 Production Ready**: Battle-tested adapter optimized for large datasets
- **🎯 Flexible**: Works with any Redux state structure via custom mappers

[📖 See @oimdb/redux-adapter documentation](../redux-adapter/README.md) for complete migration guide and examples.

### Standalone Usage

Use core classes directly for maximum control:

```typescript
// Manual subscription management
const unsubscribe = users.updateEventEmitter.subscribeOnKey('user1', () => {
    // Handle user1 changes
});

// Clean up when done
unsubscribe();
```

## 📚 API Reference

### DX Factories

#### `createOIMReactiveCollection<TEntity, TPk>(queue, opts?)`
Creates an `OIMReactiveCollection<TEntity, TPk>` with less constructor noise.

#### `createOIMCollectionContext<TEntity, TPk>(queue, opts?)`
Creates a small facade:

```typescript
type TOIMCollectionContext<TEntity, TPk> = {
    queue: OIMEventQueue;
    collection: OIMReactiveCollection<TEntity, TPk>;
    relations: OIMCollectionRelations<TEntity, TPk>;
    select: OIMCollectionSelectors<TEntity, TPk>;
};
```

This is a DX entrypoint only: indexes and lists are still created as separate relation objects, not stored inside the collection.

#### `OIMCollectionSelectors<TEntity, TPk>`
DX facade for reactive read selectors backed by one `OIMComputativeRuntime`.

**Methods:**
- `byPk(pk)` - Create `OIMCollectionByPkSelector<TEntity, TPk>`
- `byPks(pks)` - Create `OIMCollectionByPksSelector<TEntity, TPk>`
- `entitiesBySetIndexKey(index, key)` - Create an entity selector for a Set-based reactive index key
- `entitiesByArrayIndexKey(index, key)` - Create an entity selector for an Array-based reactive index key

### Core Classes

#### `OIMReactiveCollection<TEntity, TPk>`
Reactive collection with automatic change notifications and event coalescing.

**Constructor:**
```typescript
new OIMReactiveCollection(queue: OIMEventQueue, opts?: TOIMCollectionOptions<TEntity, TPk>)
```

**Properties:**
- `collection: OIMCollection<TEntity, TPk>` - Underlying collection
- `updateEventEmitter: OIMUpdateEventEmitter<TPk>` - Key-specific subscriptions
- Event batching/deduplication is handled internally by `OIMUpdateEventEmitter`

**Methods:**
- `upsertOne(entity: TEntity): TOIMEntitySlot<TEntity, TPk>` - Insert or update single entity and return its canonical slot
- `upsertOneByPk(pk: TPk, entity: Partial<TEntity>): TOIMEntitySlot<TEntity, TPk>` - Insert or update by primary key and return its canonical slot
- `upsertMany(entities: TEntity[]): TOIMEntitySlot<TEntity, TPk>[]` - Insert or update multiple entities and return canonical slots
- `removeOne(entity: TEntity): void` - Remove single entity
- `removeMany(entities: TEntity[]): void` - Remove multiple entities
- `getOneByPk(pk: TPk): TEntity | undefined` - Get entity by primary key
- `getManyByPks(pks: readonly TPk[]): TEntity[]` - Get existing entities for primary keys
- `getSlotByPk(pk: TPk): OIMEntitySlot<TEntity, TPk> | undefined` - Get the canonical slot for a primary key
- `getSlotsByPks(pks: readonly TPk[]): OIMEntitySlot<TEntity, TPk>[]` - Get existing canonical slots for primary keys

#### `OIMCollectionRelations<TEntity, TPk>`
Factory helper for collection-bound relations. It keeps `queue + collection` together for construction only; created indexes/lists still live next to the collection, not inside it.

**Constructor:**
```typescript
new OIMCollectionRelations(queue: OIMEventQueue, collection: OIMReactiveCollection<TEntity, TPk>)
```

**Factory:**
```typescript
createOIMCollectionRelations(queue, collection)
```

**Methods:**
- `setBasedIndex<TKey>()` - Create `OIMReactiveCollectionIndexManualSetBased<TKey, TPk, TEntity>`
- `derivedSetIndex<TKey>(selectIndexKeys)` - Create `OIMDerivedCollectionIndexSetBased<TKey, TPk, TEntity>`
- `arrayBasedIndex<TKey>()` - Create `OIMReactiveCollectionIndexManualArrayBased<TKey, TPk, TEntity>`
- `derivedArrayIndex<TKey>(selectIndexKeys, { orderBy?, compareEntities? })` - Create `OIMDerivedCollectionIndexArrayBased<TKey, TPk, TEntity>`
- `orderedIndex<TKey>()` - Create `OIMCollectionIndexManualOrderedArrayBased<TKey, TPk, TEntity>`
- `orderedList<TKey>()` - Create `OIMCollectionOrderedListCommandStream<TKey, TPk, TEntity>`

#### `OIMReactiveIndexManualSetBased<TKey, TPk>`
Reactive Set-based index with manual slot writes and change notifications. Use this as a raw slot-first primitive; use `OIMReactiveCollectionIndexManualSetBased` for PK-oriented writes.

**Constructor:**
```typescript
new OIMReactiveIndexManualSetBased(queue: OIMEventQueue, opts?: {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TKey, TPk>;
    }
})
```

**Properties:**
- `index: OIMIndexManualSetBased<TKey, TPk>` - Underlying Set-based index
- `updateEventEmitter: OIMUpdateEventEmitter<TKey>` - Key-specific subscriptions

**Methods:**
- `setSlots(key: TKey, slots: Iterable<TOIMAnyEntitySlot<TPk>>): void` - Set canonical slots directly
- `clear(key?: TKey): void` - Clear all keys or specific key

**Query:**
- `index.getPksByKey(key: TKey): Set<TPk>` - Returns Set projection of primary keys
- `index.getSlotsByKey(key: TKey): ReadonlySet<TOIMAnyEntitySlot<TPk>>` - Returns stored slots for fast entity reads

#### `OIMReactiveCollectionIndexManualSetBased<TKey, TPk, TEntity>`
Collection-bound Set-based index. Use this when `setPks`/`addPks`/`removePks` should resolve PKs to canonical slots from a collection.

**Constructor:**
```typescript
new OIMReactiveCollectionIndexManualSetBased(queue: OIMEventQueue, opts: {
    collection: OIMReactiveCollection<TEntity, TPk>;
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TKey, TPk>;
    };
} | {
    resolveSlot: TOIMEntitySlotResolver<TPk>;
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TKey, TPk>;
    };
})
```

Pass exactly one binding: `collection` for normal collection-bound indexes, or `resolveSlot` for custom slot resolution.

**Methods:**
- `setPks(key: TKey, pks: readonly TPk[]): void` - Set primary keys for index key
- `addPks(key: TKey, pks: readonly TPk[]): void` - Add primary keys to index key
- `removePks(key: TKey, pks: readonly TPk[]): void` - Remove primary keys from index key
- `setSlots(key: TKey, slots: Iterable<TOIMAnyEntitySlot<TPk>>): void` - Set canonical slots directly
- `clear(key?: TKey): void` - Clear all keys or specific key

#### `OIMDerivedCollectionIndexSetBased<TKey, TPk, TEntity>`
Collection-bound Set-based index that derives membership from collection entities. Use this when index keys come from entity fields and should stay in sync automatically.

**Constructor:**
```typescript
new OIMDerivedCollectionIndexSetBased(queue, collection, {
    selectIndexKeys: (entity: TEntity) => TKey | readonly TKey[] | undefined | null;
    buildInitial?: boolean; // defaults to true
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TKey, TPk>;
    };
})
```

**Methods:**
- `rebuildFromCollection(): void` - Rebuild all derived membership from current collection slots
- all read/subscription methods from `OIMReactiveCollectionIndexManualSetBased`

#### `OIMReactiveIndexManualArrayBased<TKey, TPk>`
Reactive Array-based index with manual slot writes and change notifications. Use this as a raw slot-first primitive; use `OIMReactiveCollectionIndexManualArrayBased` for PK-oriented writes.

**Constructor:**
```typescript
new OIMReactiveIndexManualArrayBased(queue: OIMEventQueue, opts?: {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TKey, TPk>;
    }
})
```

**Properties:**
- `index: OIMIndexManualArrayBased<TKey, TPk>` - Underlying Array-based index
- `updateEventEmitter: OIMUpdateEventEmitter<TKey>` - Key-specific subscriptions

**Methods:**
- `setSlots(key: TKey, slots: TOIMAnyEntitySlot<TPk>[]): void` - Set canonical slots directly
- `clear(key?: TKey): void` - Clear all keys or specific key

**Query:**
- `index.getPksByKey(key: TKey): TPk[]` - Returns Array projection of primary keys
- `index.getSlotsByKey(key: TKey): readonly TOIMAnyEntitySlot<TPk>[]` - Returns stored slots for fast entity reads

**Note**: While `addPks`/`removePks` are available, they require array operations (Set creation, filtering) making them O(n) compared to O(1) for SetBased indexes. For ArrayBased indexes, prefer `setPks` for better performance when replacing the entire array.

#### `OIMDerivedCollectionIndexArrayBased<TKey, TPk, TEntity>`
Collection-bound Array-based index that derives ordered membership from collection entities. Use this for UI lists where entities define both grouping and order.

**Constructor:**
```typescript
new OIMDerivedCollectionIndexArrayBased(queue, collection, {
    selectIndexKeys: (entity: TEntity) => TKey | readonly TKey[] | undefined | null;
    buildInitial?: boolean; // defaults to true
    orderBy?: (entity: TEntity) => string | number | bigint | boolean;
    compareEntities?: (a: TEntity, b: TEntity) => number;
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TKey, TPk>;
    };
})
```

`compareEntities` takes priority over `orderBy`. Without either option, arrays keep collection slot iteration order.

**Methods:**
- `rebuildFromCollection(): void` - Rebuild all derived ordered membership from current collection slots
- all read/subscription methods from `OIMReactiveCollectionIndexManualArrayBased`

#### `OIMReactiveCollectionIndexManualArrayBased<TKey, TPk, TEntity>`
Collection-bound Array-based index. Use this when ordered PK arrays should resolve to canonical slots from a collection.

**Constructor:**
```typescript
new OIMReactiveCollectionIndexManualArrayBased(queue: OIMEventQueue, opts: {
    collection: OIMReactiveCollection<TEntity, TPk>;
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TKey, TPk>;
    };
} | {
    resolveSlot: TOIMEntitySlotResolver<TPk>;
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TKey, TPk>;
    };
})
```

Pass exactly one binding: `collection` for normal collection-bound indexes, or `resolveSlot` for custom slot resolution.

**Methods:**
- `setPks(key: TKey, pks: readonly TPk[]): void` - Set primary keys for index key
- `addPks(key: TKey, pks: readonly TPk[]): void` - Add primary keys to index key
- `removePks(key: TKey, pks: readonly TPk[]): void` - Remove primary keys from index key
- `setSlots(key: TKey, slots: TOIMAnyEntitySlot<TPk>[]): void` - Set canonical slots directly
- `clear(key?: TKey): void` - Clear all keys or specific key

#### `OIMIndexManualOrderedArrayBased<TKey, TPk>`
Slot-first manual ordered Array-based index with direct list operations and update events. Use this when you need low-level ordered storage without a command stream.

**Constructor:**
```typescript
new OIMIndexManualOrderedArrayBased<TKey, TPk>()
```

**Methods:**
- `pushSlot(key: TKey, slot: TOIMAnyEntitySlot<TPk>): number` - Append a slot and return its inserted index
- `insertSlotAt(key: TKey, index: number, slot: TOIMAnyEntitySlot<TPk>): number` - Insert a slot at an index, clamped to the list bounds
- `removeAt(key: TKey, index: number): TOIMAnyEntitySlot<TPk> | undefined` - Remove and return the slot at an index
- `move(key: TKey, fromIndex: number, toIndex: number): TOIMAnyEntitySlot<TPk> | undefined` - Move a slot within the list
- `resetSlots(key: TKey, slots: readonly TOIMAnyEntitySlot<TPk>[]): void` - Replace the whole ordered slot list for a key
- `clear(key?: TKey): void` - Clear all keys or a specific key

**Query:**
- `getPksByKey(key: TKey): TPk[]` - Returns the ordered primary-key array
- `getSlotsByKey(key: TKey): readonly TOIMAnyEntitySlot<TPk>[]` - Returns the stored ordered slots
- `getEntitiesByKey<TEntity>(key: TKey): TEntity[]` - Returns existing entities from stored slots

#### `OIMCollectionIndexManualOrderedArrayBased<TKey, TPk, TEntity>`
Collection-bound ordered Array-based index. Use this when ordered PK writes should resolve to canonical slots from a collection.

**Methods:**
- `push(key: TKey, pk: TPk): number` - Append a PK as its canonical slot
- `insertAt(key: TKey, index: number, pk: TPk): number` - Insert a PK as its canonical slot
- `reset(key: TKey, pks: readonly TPk[]): void` - Replace the whole ordered list from PKs
- `getEntitiesByKey(key: TKey): TEntity[]` - Returns entities from canonical slots

#### `OIMOrderedListCommandStream<TKey, TPk, TEntity>`
Slot-first ordered per-key list with a command stream for imperative consumers. It stores data in an `OIMIndexManualOrderedArrayBased` and emits `TOIMOrderedListCommand` batches through `commandsEventEmitter`.

**Constructor:**
```typescript
new OIMOrderedListCommandStream(
    queue: OIMEventQueue,
    index?: OIMIndexManualOrderedArrayBased<TKey, TPk>
)
```

**Properties:**
- `index: OIMIndexManualOrderedArrayBased<TKey, TPk>` - Underlying ordered index and source of truth
- `commandsEventEmitter: OIMUpdateEventEmitter<TKey>` - Key-specific command notifications delivered after queue flush

**Methods:**
- `setSlots(key: TKey, slots: readonly TOIMEntitySlot<TEntity, TPk>[]): void` - Replace the whole ordered list and emit a `set` command
- `pushSlot(key: TKey, slot: TOIMEntitySlot<TEntity, TPk>): void` - Append a slot and emit an `insert` command
- `insertSlotAt(key: TKey, index: number, slot: TOIMEntitySlot<TEntity, TPk>): void` - Insert a slot and emit an `insert` command
- `removeAt(key: TKey, index: number): void` - Remove by index and emit a `remove` command
- `move(key: TKey, fromIndex: number, toIndex: number): void` - Move within the list and emit a `move` command
- `consumeCommands(key: TKey): TOIMOrderedListCommand<TPk, TEntity>[]` - Read buffered commands for a key inside the notification handler
- `getBufferedCommands(key: TKey): readonly TOIMOrderedListCommand<TPk, TEntity>[]` - Peek at buffered commands without clearing them
- `getPksByKey(key: TKey): readonly TPk[]` - Read the current ordered list
- `getSlotsByKey(key: TKey): readonly TOIMEntitySlot<TEntity, TPk>[]` - Read current ordered slots
- `getEntitiesByKey(key: TKey): TEntity[]` - Read current ordered entities
- `clear(key?: TKey): void` - Clear all keys or a specific key
- `destroy(): void` - Dispose subscriptions and clear state

#### `OIMCollectionOrderedListCommandStream<TKey, TPk, TEntity>`
Collection-bound ordered-list command stream. Public writes use PKs, commands include both `pk`/`pks` and canonical `slot`/`slots`.

**Methods:**
- `set(key: TKey, pks: readonly TPk[]): void` - Replace the whole ordered list from PKs
- `push(key: TKey, pk: TPk): void` - Append a PK
- `insertAt(key: TKey, index: number, pk: TPk): void` - Insert a PK
- all read/command methods from `OIMOrderedListCommandStream`

#### `OIMEventQueue`
Event processing queue with configurable scheduling.

**Constructor:**
```typescript
new OIMEventQueue(options?: TOIMEventQueueOptions)
```

**Properties:**
- `length: number` - Number of queued functions
- `isEmpty: boolean` - Whether queue is empty

**Methods:**
- `enqueue(fn: () => void): void` - Add function to queue
- `flush(): void` - Execute all queued functions
- `clear(): void` - Clear queue without executing
- `destroy(): void` - Clean up scheduler subscriptions

### Schedulers

#### `OIMEventQueueSchedulerFactory`
Factory for creating different scheduler types:

```typescript
import { TOIMSchedulerType } from '@oimdb/core';

// Available scheduler types
type TOIMSchedulerType = 'immediate' | 'microtask' | 'timeout' | 'animationFrame';
```

**Static Methods:**
- `create(type: 'microtask'): OIMEventQueueSchedulerMicrotask`
- `create(type: 'animationFrame'): OIMEventQueueSchedulerAnimationFrame`
- `create(type: 'timeout', options?: { delay: number }): OIMEventQueueSchedulerTimeout`
- `create(type: 'immediate'): OIMEventQueueSchedulerImmediate`
- `createMicrotask(): OIMEventQueueSchedulerMicrotask`
- `createAnimationFrame(): OIMEventQueueSchedulerAnimationFrame`
- `createTimeout(delay?: number): OIMEventQueueSchedulerTimeout`
- `createImmediate(): OIMEventQueueSchedulerImmediate`

### Types

#### `TOIMCollectionOptions<TEntity, TPk>`
Collection configuration options:
- `selectPk?: TOIMPkSelector<TEntity, TPk>` - Primary key selector function
- `store?: OIMCollectionStore<TEntity, TPk>` - Storage backend
- `updateEntity?: TOIMEntityUpdater<TEntity>` - Entity update strategy

#### `TOIMEntityUpdater<TEntity>`
Entity update function signature:
```typescript
(newEntity: TEntity, oldEntity: TEntity) => TEntity
```

#### `TOIMSchedulerType`
Available scheduler types:
```typescript
'microtask' | 'animationFrame' | 'timeout' | 'immediate'
```

#### `TOIMEventQueueOptions`
Event queue configuration:
- `scheduler?: OIMEventQueueScheduler` - Optional scheduler for automatic flushing

## 🧪 Testing

```typescript
import { 
    OIMReactiveCollection, 
    OIMEventQueue, 
    OIMEventQueueSchedulerFactory 
} from '@oimdb/core';

describe('OIMReactiveCollection', () => {
    let users: OIMReactiveCollection<User, string>;
    let queue: OIMEventQueue;
    
    beforeEach(() => {
        queue = new OIMEventQueue({
            scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
        });
        
        users = new OIMReactiveCollection(queue, {
            selectPk: (user) => user.id
        });
    });
    
    it('should upsert and retrieve entities', () => {
        const user = { id: 'user1', name: 'John', email: 'john@example.com' };
        users.upsertOne(user);
        
        expect(users.getOneByPk('user1')).toEqual(user);
    });
    
    it('should notify subscribers of changes', (done) => {
        users.updateEventEmitter.subscribeOnKey('user1', () => {
            done(); // Test passes when callback is called
        });
        
        users.upsertOne({ id: 'user1', name: 'John' });
        queue.flush(); // Trigger immediate flush for testing
    });
});
```

## 🤝 Contributing

This package is part of the OIMDB ecosystem. See the main project repository for contribution guidelines.

## 📄 License

MIT License - see LICENSE file for details.
