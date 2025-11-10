# @oimdb/core

Core in-memory data library providing reactive collections, intelligent indexing, and configurable event processing. This package offers the foundational building blocks for building high-performance, event-driven in-memory databases with type-safe operations and automatic change notifications.

## 🚀 Installation

```bash
npm install @oimdb/core
```

## 📦 What's Included

This package exports all the core classes, interfaces, and types needed to build reactive in-memory database solutions:

### Core Classes
- **OIMReactiveCollection**: Reactive entity storage with automatic change notifications
- **OIMRICollection**: Reactive collection with integrated indexing capabilities
- **OIMReactiveIndexManual**: Reactive index with manual key-to-entity mapping
- **OIMEventQueue**: Configurable event processing queue with scheduler integration
- **OIMCollection**: Base collection with CRUD operations and event emission

### Event System
- **OIMUpdateEventEmitter**: Key-specific event subscriptions with coalescing
- **OIMUpdateEventCoalescer**: Intelligent event batching and deduplication
- **OIMEventEmitter**: Generic type-safe event emitter
- **Schedulers**: Multiple event processing strategies (microtask, timeout, animationFrame, immediate)

### Storage & Indexing
- **OIMCollectionStoreMapDriven**: Map-based storage backend
- **OIMIndexManual**: Manual index management with custom comparison logic
- **OIMMap2Keys**: Two-key mapping utilities for complex indexing

### Abstract Classes & Interfaces
- **OIMCollectionStore**: Storage backend interface
- **OIMEventQueueScheduler**: Event processing scheduler interface
- **OIMIndex**: Base index interface
- **OIMReactiveIndex**: Reactive index interface

### Types & Enums
- **TOIM\***: Generic types for collections, indices, events, and schedulers
- **EOIM\***: Enums for event types and scheduler types
- **IOIM\***: Interfaces for event handlers and scheduler events

## 🔧 Basic Usage

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

// CRUD operations
users.upsertOne({ id: 'user1', name: 'John Doe', email: 'john@example.com' });
users.upsertMany([
    { id: 'user2', name: 'Jane Smith', email: 'jane@example.com' },
    { id: 'user3', name: 'Bob Wilson', email: 'bob@example.com' }
]);

// Query operations
const user = users.getOneByPk('user1');
const multipleUsers = users.getManyByPks(['user1', 'user2']);
```

### Creating a Reactive Index

```typescript
import { OIMReactiveIndexManual, OIMEventQueue } from '@oimdb/core';

// Create reactive index for user roles
const queue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});

const userRoleIndex = new OIMReactiveIndexManual<string, string>(queue);

// Subscribe to specific index key changes
userRoleIndex.updateEventEmitter.subscribeOnKey('admin', (pks) => {
    console.log('Admin users changed:', pks);
});

// Build the index manually
userRoleIndex.setPks('admin', ['user1']);
userRoleIndex.setPks('user', ['user2', 'user3']);

// Add more users to existing roles
userRoleIndex.addPks('admin', ['user2']);

// Query the index
const adminUsers = userRoleIndex.index.getPksByKey('admin'); // ['user1', 'user2']
const regularUsers = userRoleIndex.index.getPksByKey('user'); // ['user2', 'user3']

// Remove users from roles
userRoleIndex.removePks('admin', ['user1']);
```

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

### Reactive Collection with Indexes (OIMRICollection)

```typescript
import { 
    OIMRICollection, 
    OIMReactiveIndexManual, 
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

// Create indexes
const teamIndex = new OIMReactiveIndexManual<string, string>(queue);
const roleIndex = new OIMReactiveIndexManual<string, string>(queue);

// Create collection with indexes
const users = new OIMRICollection(queue, {
    collectionOpts: {
        selectPk: (user: User) => user.id
    },
    indexes: {
        byTeam: teamIndex,
        byRole: roleIndex
    }
});

// Subscribe to index changes
users.indexes.byTeam.updateEventEmitter.subscribeOnKey('engineering', (pks) => {
    console.log('Engineering team changed:', pks);
});

// Add users and update indexes
users.upsertMany([
    { id: 'u1', name: 'John', email: 'john@test.com', teamId: 'engineering', role: 'admin' },
    { id: 'u2', name: 'Jane', email: 'jane@test.com', teamId: 'engineering', role: 'user' }
]);

// Update indexes manually
users.indexes.byTeam.setPks('engineering', ['u1', 'u2']);
users.indexes.byRole.setPks('admin', ['u1']);
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

// Access the underlying coalescer directly
users.coalescer.emitter.on('upsert', (coalescedUpdates) => {
    console.log('Raw coalesced updates:', coalescedUpdates);
});
```

## 🔄 Reactive Architecture

### Event-Driven Updates

OIMDB core uses a reactive architecture where changes automatically trigger notifications to subscribers:

```typescript
// Collection updates trigger events through the event queue
collection.upsertOne(entity) → coalescer → event queue → subscribers

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

### Scheduler Types

Choose the right scheduler for your use case:

- **`microtask`**: Most common - executes before next browser render
- **`timeout`**: Configurable delay for custom batching strategies  
- **`animationFrame`**: Syncs with browser rendering (60fps)
- **`immediate`**: Fastest execution using platform-specific APIs

### Reactive Collection Hierarchy

```
OIMCollection (base)
├── OIMReactiveCollection (adds event emitter + coalescing)
└── OIMRICollection (reactive collection + indexes)

OIMIndex (base)
├── OIMIndexManual (manual index management)
└── OIMReactiveIndexManual (reactive index with event emitter)
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

## 🔗 Integration Patterns

### With React (@oimdb/react)

The core library integrates seamlessly with React through dedicated hooks:

```typescript
import { useSelectEntitiesByPks, selectEntityByPk } from '@oimdb/react';

// React hooks automatically subscribe to reactive collections
const user = selectEntityByPk(users, 'user1');
const teamUsers = useSelectEntitiesByPks(users, userIds);
```

### With Redux (@oimdb/redux-adapter)

Migrate from Redux to OIMDB gradually or use both systems side-by-side with automatic two-way synchronization:

```typescript
import { OIMDBReducerFactory } from '@oimdb/redux-adapter';
import { createStore, combineReducers } from 'redux';

// Create Redux reducer from OIMDB collection
const factory = new OIMDBReducerFactory(queue);
const usersReducer = factory.createCollectionReducer(users);

// Use in existing Redux store
const store = createStore(
    combineReducers({
        users: usersReducer, // OIMDB-backed reducer
        ui: uiReducer,       // Existing Redux reducer
    })
);

// OIMDB changes automatically sync to Redux
// Redux actions can sync back to OIMDB with child reducers
```

**Key Benefits:**
- **🔄 Gradual Migration**: Migrate one collection at a time without breaking changes
- **🔄 Two-Way Sync**: Automatic synchronization between OIMDB and Redux
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
- `coalescer: OIMUpdateEventCoalescerCollection<TPk>` - Event coalescing

**Methods:**
- `upsertOne(entity: TEntity): void` - Insert or update single entity
- `upsertMany(entities: TEntity[]): void` - Insert or update multiple entities
- `removeOne(entity: TEntity): void` - Remove single entity
- `removeMany(entities: TEntity[]): void` - Remove multiple entities
- `getOneByPk(pk: TPk): TEntity | undefined` - Get entity by primary key
- `getManyByPks(pks: readonly TPk[]): Map<TPk, TEntity | undefined>` - Get multiple entities

#### `OIMRICollection<TEntity, TPk, TIndexName, TIndexKey, TIndex, TReactiveIndex, TReactiveIndexMap>`
Reactive collection with integrated indexing capabilities.

**Constructor:**
```typescript
new OIMRICollection(queue: OIMEventQueue, opts: {
    collectionOpts?: TOIMCollectionOptions<TEntity, TPk>;
    indexes: TReactiveIndexMap;
})
```

**Properties:**
- `indexes: TReactiveIndexMap` - Named reactive indexes preserving index-to-name mapping
- *(inherits all OIMReactiveCollection properties)*

#### `OIMReactiveIndexManual<TKey, TPk>`
Reactive index with manual key-to-entity mapping and change notifications.

**Constructor:**
```typescript
new OIMReactiveIndexManual(queue: OIMEventQueue, opts?: {
    index?: OIMIndexManual<TKey, TPk>
})
```

**Properties:**
- `index: OIMIndexManual<TKey, TPk>` - Underlying index
- `updateEventEmitter: OIMUpdateEventEmitter<TKey>` - Key-specific subscriptions

**Methods:**
- `setPks(key: TKey, pks: readonly TPk[]): void` - Set primary keys for index key
- `addPks(key: TKey, pks: readonly TPk[]): void` - Add primary keys to index key
- `removePks(key: TKey, pks: readonly TPk[]): void` - Remove primary keys from index key
- `clear(key?: TKey): void` - Clear all keys or specific key

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
