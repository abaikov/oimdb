# OIMDB API Reference

Complete API documentation for the OIMDB library.

## Table of Contents

- [DX Layer](#dx-layer)
- [Core Layer](#core-layer)
- [Types](#types)
- [Advanced Patterns](#advanced-patterns)

## DX Layer

The DX (Developer Experience) layer provides a simplified, high-level API that handles common patterns automatically.

### `createDb(options?)`

Creates a new database instance with shared event processing.

```typescript
import { createDb } from 'oimdb/dx';

const db = createDb({
    scheduler: 'microtask' // 'microtask' | 'immediate' | 'timeout' | 'animationFrame'
});
```

**Options:**
- `scheduler`: Event processing strategy
  - `'microtask'` (default): Fastest, processes in same tick
  - `'immediate'`: Instant processing, good for testing
  - `'timeout'`: Batched processing, performance optimized
  - `'animationFrame'`: Smooth UI updates, React-friendly

**Returns:** Database instance with methods for creating collections, indexes, and managing events.

### Collections

#### `db.createCollection<TEntity, TPk>()`

Creates a new collection for storing entities.

```typescript
interface User {
    id: string;
    name: string;
    email: string;
}

const users = db.createCollection<User>();
```

**Returns:** Collection instance with simplified API.

#### Collection Methods

##### CRUD Operations

```typescript
// Insert/Update single entity
users.upsert({ id: 'user1', name: 'John', email: 'john@example.com' });

// Insert/Update multiple entities
users.upsertMany([
    { id: 'user1', name: 'John', email: 'john@example.com' },
    { id: 'user2', name: 'Jane', email: 'jane@example.com' }
]);

// Remove single entity
users.remove({ id: 'user1' });

// Remove multiple entities
users.removeMany([
    { id: 'user1' },
    { id: 'user2' }
]);
```

##### Subscriptions

```typescript
// Subscribe to single entity updates
const unsubscribe = users.subscribe('user1', () => {
    console.log('User 1 updated');
});

// Subscribe to multiple entity updates
users.subscribeMany(['user1', 'user2'], () => {
    console.log('User 1 or 2 updated');
});

// Unsubscribe
unsubscribe();
```

##### Advanced Access

```typescript
// Access underlying components
const { collection, eventEmitter, coalescer, queue } = users.advanced;

// Direct collection access
const entity = users.advanced.collection.get('user1');

// Event emitter access
users.advanced.eventEmitter.subscribeOnKey('user1', handler);

// Queue access
users.advanced.eventQueue.flush();
```

##### Cleanup

```typescript
// Clean up collection resources
users.destroy();
```

### Indexes

#### `db.createIndex<TIndexKey, TPk>(options?)`

Creates a new index for fast lookups.

```typescript
const userByEmail = db.createIndex<string, string>({
    comparison: 'element-wise' // 'element-wise' | 'set-based' | 'always-update'
});
```

**Options:**
- `comparison`: Comparison strategy for determining changes
  - `'element-wise'` (default): Compares arrays element by element
  - `'set-based'`: Treats arrays as sets, order doesn't matter
  - `'always-update'`: Always considers changes as updates
  - Custom function: `(oldPks: TPk[], newPks: TPk[]) => boolean`

**Returns:** Index instance with methods for managing key-value mappings.

#### Index Methods

##### Basic Operations

```typescript
// Set PKs for a key
userByEmail.set('john@example.com', ['user1']);

// Add PKs to existing key
userByEmail.add('john@example.com', ['user2']);

// Remove PKs from key
userByEmail.remove('john@example.com', ['user1']);

// Clear all PKs for a key
userByEmail.clear('john@example.com');

// Clear all indexes
userByEmail.clear();
```

##### Queries

```typescript
// Get PKs for a key
const userIds = userByEmail.get('john@example.com'); // ['user1', 'user2']

// Check if key exists
const hasKey = userByEmail.has('john@example.com'); // true

// Get all index keys
const allKeys = userByEmail.keys(); // ['john@example.com', 'jane@example.com']
```

##### Subscriptions

```typescript
// Subscribe to index updates
userByEmail.subscribe('john@example.com', () => {
    console.log('Index updated for john@example.com');
});

// Subscribe to multiple keys
userByEmail.subscribeMany(['john@example.com', 'jane@example.com'], () => {
    console.log('Index updated for either email');
});
```

##### Advanced Access

```typescript
// Access underlying components
const { index, eventEmitter, coalescer, queue } = userByEmail.advanced;

// Direct index access
const pks = userByEmail.advanced.index.getPks('john@example.com');

// Metrics
const metrics = userByEmail.advanced.index.getMetrics();
console.log(`Total keys: ${metrics.totalKeys}`);
console.log(`Total PKs: ${metrics.totalPks}`);
```

##### Cleanup

```typescript
// Clean up index resources
userByEmail.destroy();
```

### Database Management

#### Event Processing

```typescript
// Manually flush all pending events
db.flushUpdatesNotifications();
```

#### Metrics

```typescript
const metrics = db.getMetrics();
console.log(`Queue length: ${metrics.queueLength}`);
console.log(`Scheduler: ${metrics.scheduler}`);
```

#### Cleanup

```typescript
// Clean up all database resources
db.destroy();
```

## Core Layer

The core layer provides direct access to all components for maximum flexibility and customization.

### Collections

#### `OIMCollection<TEntity, TPk>`

Base collection class for entity management.

```typescript
import { OIMCollection } from 'oimdb';

const collection = new OIMCollection<User>({
    selectPk: new OIMPkSelectorFactory<User>().createIdSelector(),
    store: new OIMCollectionStoreMapDriven<User>(),
    updateEntity: new OIMEntityUpdaterFactory<User>().createMergeEntityUpdater()
});
```

**Constructor Options:**
- `selectPk`: Function to extract primary key from entity
- `store`: Storage implementation for entities
- `updateEntity`: Function to update existing entities

#### Collection Methods

```typescript
// CRUD operations
collection.upsertOne(user);
collection.upsertMany(users);
collection.removeOne(user);
collection.removeMany(users);

// Queries
const entity = collection.get('user1');
const entities = collection.getMany(['user1', 'user2']);
const allEntities = collection.getAll();

// Metrics
const metrics = collection.getMetrics();
console.log(`Total entities: ${metrics.totalEntities}`);
```

### Event System

#### `OIMUpdateEventEmitter<TPk>`

Manages event subscriptions and notifications.

```typescript
import { OIMUpdateEventEmitter, OIMUpdateEventCoalescerCollection } from 'oimdb';

const coalescer = new OIMUpdateEventCoalescerCollection(collection.emitter);
const emitter = new OIMUpdateEventEmitter({ coalescer, queue });

// Subscriptions
emitter.subscribeOnKey('user1', handler);
emitter.subscribeOnKeys(['user1', 'user2'], handler);

// Unsubscribe
emitter.unsubscribeFromKey('user1', handler);
emitter.unsubscribeFromKeys(['user1', 'user2'], handler);

// Metrics
const metrics = emitter.getMetrics();
console.log(`Total keys: ${metrics.totalKeys}`);
console.log(`Total handlers: ${metrics.totalHandlers}`);
```

#### `OIMUpdateEventCoalescerCollection<TPk>`

Coalesces multiple updates to the same entity into single notifications.

```typescript
const coalescer = new OIMUpdateEventCoalescerCollection(collection.emitter);

// Add updated keys
coalescer.addUpdatedKeys(['user1', 'user2']);

// Get all updated keys
const updatedKeys = coalescer.getUpdatedKeys();

// Clear updated keys
coalescer.clearUpdatedKeys();
```

### Event Queue

#### `OIMEventQueue`

Manages event processing with configurable scheduling.

```typescript
import { OIMEventQueue, OIMEventQueueSchedulerFactory } from 'oimdb';

const scheduler = OIMEventQueueSchedulerFactory.createMicrotask();
const queue = new OIMEventQueue({ scheduler });

// Manual processing
queue.flush();

// Metrics
const metrics = queue.getMetrics();
console.log(`Queue length: ${metrics.queueLength}`);
console.log(`Scheduler: ${metrics.scheduler}`);
```

#### Schedulers

```typescript
// Microtask - fastest, same tick processing
const microtaskScheduler = OIMEventQueueSchedulerFactory.createMicrotask();

// Immediate - instant processing, good for testing
const immediateScheduler = OIMEventQueueSchedulerFactory.createImmediate();

// Timeout - batched processing, performance optimized
const timeoutScheduler = OIMEventQueueSchedulerFactory.createTimeout(100); // 100ms delay

// AnimationFrame - smooth UI updates, React-friendly
const animationFrameScheduler = OIMEventQueueSchedulerFactory.createAnimationFrame();
```

### Indexes

#### `OIMIndexManual<TIndexKey, TPk>`

Manual index implementation with full control.

```typescript
import { OIMIndexManual, OIMIndexComparatorFactory } from 'oimdb';

const index = new OIMIndexManual<string, number>({
    comparePks: OIMIndexComparatorFactory.createElementWiseComparator<number>()
});
```

#### Index Methods

```typescript
// Basic operations
index.setPks('key1', [1, 2, 3]);
index.addPks('key1', [4, 5]);
index.removePks('key1', [1]);
index.clear('key1');

// Queries
const pks = index.getPks('key1');
const hasKey = index.hasKey('key1');
const keys = index.getKeys();

// Metrics
const metrics = index.getMetrics();
console.log(`Total keys: ${metrics.totalKeys}`);
console.log(`Total PKs: ${metrics.totalPks}`);
```

#### Index Comparators

```typescript
import { OIMIndexComparatorFactory } from 'oimdb';

// Element-wise comparison (default)
const elementWise = OIMIndexComparatorFactory.createElementWiseComparator<number>();

// Set-based comparison
const setBased = OIMIndexComparatorFactory.createSetBasedComparator<number>();

// Shallow comparison
const shallow = OIMIndexComparatorFactory.createShallowComparator<number>();

// Always update (no comparison)
const alwaysUpdate = OIMIndexComparatorFactory.createAlwaysUpdateComparator<number>();

// Custom comparator
const customComparator: TOIMIndexComparator<number> = (oldPks, newPks) => {
    // Return true if no change, false if changed
    return JSON.stringify(oldPks) === JSON.stringify(newPks);
};
```

## Types

### Core Types

```typescript
// Primary key type
type TOIMPk = string | number;

// Entity type
type TOIMEntity = { id: TOIMPk };

// Event handler
type TOIMEventHandler<TData = void> = (data: TData) => void;

// Index comparator
type TOIMIndexComparator<TPk> = (oldPks: readonly TPk[], newPks: readonly TPk[]) => boolean;

// Scheduler type
type TOIMSchedulerType = 'microtask' | 'immediate' | 'timeout' | 'animationFrame';
```

### Collection Options

```typescript
interface TOIMCollectionOptions<TEntity, TPk> {
    selectPk: TOIMPkSelector<TEntity, TPk>;
    store: OIMCollectionStore<TEntity, TPk>;
    updateEntity: TOIMEntityUpdater<TEntity>;
}

interface TOIMPkSelector<TEntity, TPk> {
    selectPk(entity: TEntity): TPk;
}

interface OIMCollectionStore<TEntity, TPk> {
    get(pk: TPk): TEntity | undefined;
    set(pk: TPk, entity: TEntity): void;
    delete(pk: TPk): boolean;
    clear(): void;
    size(): number;
    keys(): TPk[];
    values(): TEntity[];
    entries(): [TPk, TEntity][];
}

type TOIMEntityUpdater<TEntity> = (oldEntity: TEntity, newEntity: TEntity) => TEntity;
```

### Index Options

```typescript
interface TOIMIndexOptions<TPk> {
    comparePks?: TOIMIndexComparator<TPk>;
}
```

### Event Options

```typescript
interface TOIMUpdateEventEmitterOptions<TPk> {
    coalescer: OIMUpdateEventCoalescer<TPk>;
    queue: OIMEventQueue;
}

interface TOIMEventQueueOptions {
    scheduler?: OIMEventQueueScheduler;
}
```

## Advanced Patterns

### Custom Storage Implementation

```typescript
import { OIMCollectionStore } from 'oimdb';

class CustomStore<T> implements OIMCollectionStore<T> {
    private data = new Map<string, T>();
    
    get(pk: string): T | undefined {
        return this.data.get(pk);
    }
    
    set(pk: string, entity: T): void {
        this.data.set(pk, entity);
    }
    
    delete(pk: string): boolean {
        return this.data.delete(pk);
    }
    
    clear(): void {
        this.data.clear();
    }
    
    size(): number {
        return this.data.size;
    }
    
    keys(): string[] {
        return Array.from(this.data.keys());
    }
    
    values(): T[] {
        return Array.from(this.data.values());
    }
    
    entries(): [string, T][] {
        return Array.from(this.data.entries());
    }
}

// Use custom store
const collection = new OIMCollection<User>({
    selectPk: new OIMPkSelectorFactory<User>().createIdSelector(),
    store: new CustomStore<User>(),
    updateEntity: new OIMEntityUpdaterFactory<User>().createMergeEntityUpdater()
});
```

### Custom Entity Updater

```typescript
import { TOIMEntityUpdater } from 'oimdb';

const customUpdater: TOIMEntityUpdater<User> = (oldUser, newUser) => {
    // Custom merge logic
    return {
        ...oldUser,
        ...newUser,
        updatedAt: new Date().toISOString(),
        version: (oldUser.version || 0) + 1
    };
};

const collection = new OIMCollection<User>({
    selectPk: new OIMPkSelectorFactory<User>().createIdSelector(),
    store: new OIMCollectionStoreMapDriven<User>(),
    updateEntity: customUpdater
});
```

### Custom PK Selector

```typescript
import { TOIMPkSelector } from 'oimdb';

const customPkSelector: TOIMPkSelector<User, string> = {
    selectPk(user: User): string {
        // Use email as primary key instead of id
        return user.email;
    }
};

const collection = new OIMCollection<User>({
    selectPk: customPkSelector,
    store: new OIMCollectionStoreMapDriven<User>(),
    updateEntity: new OIMEntityUpdaterFactory<User>().createMergeEntityUpdater()
});
```

### Event-Driven Architecture

```typescript
// Create event-driven system
const collection = new OIMCollection<User>({...});
const coalescer = new OIMUpdateEventCoalescerCollection(collection.emitter);
const scheduler = OIMEventQueueSchedulerFactory.createMicrotask();
const queue = new OIMEventQueue({ scheduler });
const emitter = new OIMUpdateEventEmitter({ coalescer, queue });

// Subscribe to updates
emitter.subscribeOnKey('user1', (user) => {
    console.log('User 1 updated:', user);
});

// Make changes
collection.upsertOne({ id: 'user1', name: 'John Updated' });

// Events are automatically processed by scheduler
// Or manually flush
queue.flush();
```

### Performance Optimization

```typescript
// Use appropriate scheduler for your use case
const db = createDb({
    scheduler: 'microtask' // Fastest for most cases
});

// Batch operations when possible
users.upsertMany([user1, user2, user3, user4, user5]);

// Use indexes for frequent lookups
const userByEmail = db.createIndex<string, string>();
userByEmail.set('john@example.com', ['user1']);

// Subscribe only to what you need
users.subscribe('user1', handler); // Single entity
users.subscribeMany(['user1', 'user2'], handler); // Multiple entities

// Manual control over event processing
db.flushUpdatesNotifications(); // Process all pending events
```
