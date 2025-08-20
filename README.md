# OIMDB - In-Memory Database for Frontend State Management

A high-performance, event-driven in-memory database designed specifically for frontend applications. OIMDB solves state management problems with a focus on performance, normalization, and developer experience.

## 🚀 Quick Start

### Installation

```bash
npm install oimdb
```

### Basic Usage

```typescript
import { createDb } from 'oimdb/dx';

// Create a database instance
const db = createDb({ scheduler: 'microtask' });

// Create collections
const users = db.createCollection<User>();
const posts = db.createCollection<Post>();

// Create indexes for fast lookups
const userByEmail = db.createIndex<string, string>();
const postsByUser = db.createIndex<string, string>();

// Subscribe to updates
users.subscribe('user123', () => {
    console.log('User updated!');
});

// Insert data
users.upsert({ id: 'user123', name: 'John', email: 'john@example.com' });
posts.upsert({ id: 'post1', userId: 'user123', title: 'Hello World' });

// Build indexes
userByEmail.set('john@example.com', ['user123']);
postsByUser.set('user123', ['post1']);

// Query by index
const userId = userByEmail.get('john@example.com'); // ['user123']
const userPosts = postsByUser.get('user123'); // ['post1']

// Clean up
db.destroy();
```

## 🎯 Why OIMDB?

### 🚀 Non-Serializable State for Speed
- **In-memory operations** are orders of magnitude faster than serialization-based solutions
- **Easily handle massive entity lists** without performance degradation
- **Direct object references** eliminate JSON parsing overhead

### 🏗️ Collection-First Design
- **Forces normalization** - no nested objects, only references
- **Optimized for collections** - every operation is designed around entity collections
- **Predictable performance** - O(1) lookups by primary key

### 🔒 Performance by Design
- **Access only by PK or index** - impossible to accidentally create N+1 queries
- **All relationships must be set explicitly** when data arrives
- **Always O(1) retrieval** - no hidden performance traps

### 📡 Smart Event System
- **Subscribe to individual entities** for granular updates
- **Intelligent coalescing** - multiple updates to the same entity = single notification
- **Manual control** over when notifications are delivered
- **Perfect for React** - update state only when you're ready

### ⚡ Optimized by Default
- **No shallow comparison by default** - set = change = notification
- **UI catches all updates** - no missed changes
- **Optional comparators** available when you need to reduce noise
- **Configurable event scheduling** (microtask, immediate, timeout, animationFrame)

### 🔧 Modular Core
- **Replace any component** with your own implementation
- **Separate layers** for storage, entity management, and notifications
- **Extensible architecture** - build exactly what you need

## 📚 API Reference

### DX Layer (Recommended for most use cases)

The DX layer provides a simplified, high-level API that handles common patterns automatically.

#### `createDb(options?)`

Creates a new database instance with shared event processing.

```typescript
import { createDb } from 'oimdb/dx';

const db = createDb({
    scheduler: 'microtask' // 'microtask' | 'immediate' | 'timeout' | 'animationFrame'
});
```

#### Collections

```typescript
const users = db.createCollection<User>();

// CRUD operations
users.upsert({ id: 'user1', name: 'John' });
users.upsertMany([user1, user2, user3]);
users.remove({ id: 'user1' });
users.removeMany([user1, user2]);

// Subscriptions
const unsubscribe = users.subscribe('user1', () => {
    console.log('User 1 updated');
});

// Batch subscriptions
users.subscribeMany(['user1', 'user2'], () => {
    console.log('User 1 or 2 updated');
});
```

#### Indexes

```typescript
const userByEmail = db.createIndex<string, string>({
    comparison: 'element-wise' // 'element-wise' | 'set-based' | 'always-update'
});

// Index operations
userByEmail.set('john@example.com', ['user1']);
userByEmail.add('john@example.com', ['user2']);
userByEmail.remove('john@example.com', ['user1']);
userByEmail.clear('john@example.com');

// Queries
const userIds = userByEmail.get('john@example.com');
const hasKey = userByEmail.has('john@example.com');
const allKeys = userByEmail.keys();

// Subscriptions
userByEmail.subscribe('john@example.com', () => {
    console.log('Index updated for john@example.com');
});
```

#### Database Management

```typescript
// Manual event processing
db.flushUpdatesNotifications();

// Metrics
const metrics = db.getMetrics();
console.log(`Queue length: ${metrics.queueLength}`);
console.log(`Scheduler: ${metrics.scheduler}`);

// Cleanup
db.destroy();
```

### Core Layer (Advanced users)

The core layer provides direct access to all components for maximum flexibility.

#### Collections

```typescript
import { OIMCollection } from 'oimdb';

const collection = new OIMCollection<User>({
    selectPk: new OIMPkSelectorFactory<User>().createIdSelector(),
    store: new OIMCollectionStoreMapDriven<User>(),
    updateEntity: new OIMEntityUpdaterFactory<User>().createMergeEntityUpdater()
});

collection.upsertOne(user);
collection.upsertMany(users);
collection.removeOne(user);
collection.removeMany(users);
```

#### Event System

```typescript
import { OIMUpdateEventEmitter, OIMUpdateEventCoalescerCollection } from 'oimdb';

const coalescer = new OIMUpdateEventCoalescerCollection(collection.emitter);
const emitter = new OIMUpdateEventEmitter({ coalescer, queue });

emitter.subscribeOnKey('user1', handler);
emitter.subscribeOnKeys(['user1', 'user2'], handler);
```

#### Event Queue

```typescript
import { OIMEventQueue, OIMEventQueueSchedulerFactory } from 'oimdb';

const scheduler = OIMEventQueueSchedulerFactory.createMicrotask();
const queue = new OIMEventQueue({ scheduler });

// Manual processing
queue.flush();
```

#### Indexes

```typescript
import { OIMIndexManual, OIMIndexComparatorFactory } from 'oimdb';

const index = new OIMIndexManual<string, number>({
    comparePks: OIMIndexComparatorFactory.createElementWiseComparator<number>()
});

index.setPks('key1', [1, 2, 3]);
index.addPks('key1', [4, 5]);
index.removePks('key1', [1]);
index.getPks('key1'); // [2, 3, 4, 5]
```

## 🔧 Advanced Features

### Custom Comparators

```typescript
// Element-wise comparison (default)
const elementWise = OIMIndexComparatorFactory.createElementWiseComparator<number>();

// Set-based comparison
const setBased = OIMIndexComparatorFactory.createSetBasedComparator<number>();

// Custom comparator
const customComparator: TOIMIndexComparator<number> = (oldPks, newPks) => {
    // Return true if no change, false if changed
    return JSON.stringify(oldPks) === JSON.stringify(newPks);
};
```

### Event Scheduling

```typescript
// Microtask - fastest, same tick processing
const microtaskDb = createDb({ scheduler: 'microtask' });

// Immediate - instant processing, good for testing
const immediateDb = createDb({ scheduler: 'immediate' });

// Timeout - batched processing, performance optimized
const timeoutDb = createDb({ scheduler: 'timeout' });

// AnimationFrame - smooth UI updates, React-friendly
const animationFrameDb = createDb({ scheduler: 'animationFrame' });
```

### Custom Storage

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
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testNamePattern="Collection"
npm test -- --testNamePattern="Index"
npm test -- --testNamePattern="DX"

# Run benchmarks
npx tsx bench/index.ts

# Run examples
npx tsx examples/basic-usage.ts
npx tsx examples/index-usage.ts
npx tsx examples/scheduler-comparison.ts
```

## 📖 Examples

See the `examples/` directory for comprehensive usage examples:

- `basic-usage.ts` - Basic operations and patterns
- `index-usage.ts` - Index functionality and comparison strategies
- `scheduler-comparison.ts` - Different event scheduling approaches

## 📚 Documentation

For comprehensive documentation, see the [`docs/`](docs/) directory:

- [API Reference](docs/API.md) - Complete API documentation
- [Architecture](docs/ARCHITECTURE.md) - Design principles and component structure
- [Performance Guide](docs/PERFORMANCE.md) - Optimization strategies and benchmarks
- [Migration Guide](docs/MIGRATION.md) - Migrating from other state management solutions

## 🤝 Contributing

Contributions are welcome! OIMDB is designed to be modular and extensible.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/abaikov/oimdb/issues)

---

**OIMDB** - The in-memory database that makes frontend state management fast, predictable, and enjoyable. 🚀
