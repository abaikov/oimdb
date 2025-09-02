# OIMDB Packages

This directory contains the split packages for OIMDB, each designed for different use cases and developer experience levels.

## 📦 Package Overview

### `@oimdb/core` - Foundation Layer
**Core in-memory data library** providing the foundational building blocks for building high-performance, event-driven in-memory databases.

**Use when you need:**
- Full control over database architecture
- Custom storage backends or schedulers
- Advanced event processing customization
- Building your own database abstractions
- Maximum performance optimization

**Key exports:**
- `OIMCollection<T>` - Entity storage with CRUD operations
- `OIMIndexManual<K, V>` - Fast lookups with reactive updates
- `OIMEventQueue` - Configurable event processing
- `OIMEventQueueScheduler*` - Multiple scheduling strategies
- Abstract classes for custom implementations

### `@oimdb/dx` - Developer Experience Layer
**High-level API** built on top of core, providing a clean and simple database interface with sensible defaults.

**Use when you need:**
- Quick setup and development
- Standard database patterns
- Shared event processing across collections
- Built-in event coalescing and optimization
- Less boilerplate code

**Key exports:**
- `createDb()` - Factory function for database instances
- `OIMDxDb` - Database class with shared event queue

### `@oimdb/react` - React Integration Layer
**React hooks** for selection and subscription with external storage, built on top of core.

**Use when you need:**
- React components with real-time data updates
- Selection and subscription patterns
- Integration with external storage backends
- Optimized re-renders with equality functions
- Custom storage adapters

**Key exports:**
- `useEntity()` - Hook for single entity selection
- `useEntities()` - Hook for multiple entity selection
- `useIndex()` - Hook for indexed data selection
- `IOIMReactStorage` - Storage interface for adapters

## 🚀 Installation

```bash
# Install all packages
npm install @oimdb/core @oimdb/dx @oimdb/react

# Or install individually
npm install @oimdb/core
npm install @oimdb/dx
npm install @oimdb/react
```

## 🔧 Usage Examples

### Using `@oimdb/dx` (Recommended for most use cases)

```typescript
import { createDb } from '@oimdb/dx';

interface User {
    id: string;
    name: string;
    email: string;
}

interface Post {
    id: string;
    title: string;
    authorId: string;
    published: boolean;
}

// Create database with microtask scheduler (fastest)
const db = createDb({ scheduler: 'microtask' });

// Create collections
const users = db.createCollection<User>();
const posts = db.createCollection<Post>();

// Create indexes with different comparison strategies
const userByEmail = db.createIndex<string, string>({ 
    comparison: 'set-based' 
});
const postsByUser = db.createIndex<string, string>({ 
    comparison: 'element-wise' 
});
const publishedPosts = db.createIndex<boolean, string>({ 
    comparison: 'always-update' 
});

// Subscribe to updates
users.subscribe('user123', () => {
    console.log('User updated!');
});

posts.subscribe('post1', () => {
    console.log('Post updated!');
});

// Insert data
users.upsert({ id: 'user123', name: 'John Doe', email: 'john@example.com' });
posts.upsert({ id: 'post1', title: 'Hello World', authorId: 'user123', published: true });

// Build indexes
userByEmail.set('john@example.com', ['user123']);
postsByUser.set('user123', ['post1']);
publishedPosts.set(true, ['post1']);

// Query by index
const userId = userByEmail.get('john@example.com'); // ['user123']
const userPosts = postsByUser.get('user123'); // ['post1']
const published = publishedPosts.get(true); // ['post1']

// Get database metrics
console.log(db.getMetrics());
// { queueLength: 0, scheduler: 'OIMEventQueueSchedulerMicrotask' }

// Clean up
db.destroy();
```

### Using `@oimdb/core` (Advanced usage)

```typescript
import { 
    OIMCollection, 
    OIMCollectionStoreMapDriven,
    OIMIndexManual,
    OIMEventQueueSchedulerMicrotask,
    OIMUpdateEventCoalescerCollection,
    OIMUpdateEventEmitter
} from '@oimdb/core';

interface User {
    id: string;
    name: string;
    email: string;
}

// Create collection with custom configuration
const collection = new OIMCollection<User>({
    selectPk: (entity) => entity.id,
    store: new OIMCollectionStoreMapDriven<User>(),
    updateEntity: (oldEntity, newEntity) => ({ ...oldEntity, ...newEntity }),
    scheduler: new OIMEventQueueSchedulerMicrotask()
});

// Create custom event processing
const coalescer = new OIMUpdateEventCoalescerCollection(collection.emitter);
const eventEmitter = new OIMUpdateEventEmitter({
    coalescer,
    queue: new OIMEventQueue({
        scheduler: new OIMEventQueueSchedulerMicrotask()
    })
});

// Subscribe to coalesced events
eventEmitter.subscribeOnKey('user123', () => {
    console.log('User 123 updated (coalesced)');
});

// Create custom index
const index = new OIMIndexManual<string, string>({
    comparePks: (oldPks, newPks) => {
        // Custom comparison logic
        if (oldPks.length !== newPks.length) return true;
        return oldPks.some((pk, i) => pk !== newPks[i]);
    }
});

// Manual index management
index.set('admin', ['user123']);
index.add('admin', ['user456']);

// Clean up
eventEmitter.destroy();
coalescer.destroy();
collection.emitter.offAll();
```

## 🔄 Scheduler Comparison

The DX layer supports different event processing strategies:

```typescript
import { createDb } from '@oimdb/dx';

// Microtask (fastest) - processes before next render
const db1 = createDb({ scheduler: 'microtask' });

// Immediate (instant) - good for testing
const db2 = createDb({ scheduler: 'immediate' });

// Timeout (batched) - good for performance
const db3 = createDb({ scheduler: 'timeout' });

// AnimationFrame (smooth) - good for React
const db4 = createDb({ scheduler: 'animationFrame' });
```

**Performance characteristics:**
- **Microtask**: Fastest, runs in same tick
- **Immediate**: Instant processing, good for testing
- **Timeout**: Batched processing, good for performance
- **AnimationFrame**: Smooth UI updates, good for React

## 🏗️ Architecture Differences

### DX Layer (`@oimdb/dx`)
```
createDb() → OIMDxDb → Shared Event Queue
    ↓
Collections & Indexes share the same event processing
```

**Benefits:**
- Shared event queue across all collections/indexes
- Built-in event coalescing
- Automatic cleanup and resource management
- Simplified API with sensible defaults

### Core Layer (`@oimdb/core`)
```
OIMCollection → Individual Event Queues
OIMIndex → Individual Event Queues
OIMEventQueue → Custom Schedulers
```

**Benefits:**
- Full control over event processing
- Custom storage backends
- Individual event queue management
- Maximum performance optimization

## 📊 When to Use Which Package

### Use `@oimdb/dx` when:
- ✅ Building applications quickly
- ✅ Need standard database patterns
- ✅ Want shared event processing
- ✅ Prefer less boilerplate code
- ✅ Don't need custom optimizations

### Use `@oimdb/react` when:
- ✅ Building React applications
- ✅ Need real-time data updates
- ✅ Want selection and subscription patterns
- ✅ Using external storage backends
- ✅ Need optimized re-renders

### Use `@oimdb/core` when:
- ✅ Building custom database abstractions
- ✅ Need custom storage backends
- ✅ Want individual event queue control
- ✅ Building performance-critical applications
- ✅ Need custom event processing logic

### Use combinations when:
- ✅ **DX + React**: Full-stack React apps with OIMDB
- ✅ **Core + React**: Custom database with React integration
- ✅ **All three**: Framework building with maximum flexibility
- ✅ **DX + Core**: High-level API with custom optimizations

## 🔗 Package Dependencies

```
@oimdb/dx → @oimdb/core (peer dependency)
@oimdb/react → @oimdb/core (peer dependency)
```

The DX and React packages are built on top of core and require it as a peer dependency. You can use them together or independently.

## 🧪 Testing

```typescript
// Test with DX layer
import { createDb } from '@oimdb/dx';

describe('Database', () => {
    let db: ReturnType<typeof createDb>;
    
    beforeEach(() => {
        db = createDb({ scheduler: 'immediate' });
    });
    
    afterEach(() => {
        db.destroy();
    });
    
    it('should create collections', () => {
        const users = db.createCollection<User>();
        expect(users).toBeDefined();
    });
});

// Test with core layer
import { OIMCollection, OIMCollectionStoreMapDriven } from '@oimdb/core';

describe('OIMCollection', () => {
    let collection: OIMCollection<User>;
    
    beforeEach(() => {
        collection = new OIMCollection({
            selectPk: (entity) => entity.id,
            store: new OIMCollectionStoreMapDriven<User>(),
            updateEntity: (oldEntity, newEntity) => ({ ...oldEntity, ...newEntity })
        });
    });
    
    afterEach(() => {
        collection.emitter.offAll();
    });
    
    it('should upsert entities', () => {
        const user = { id: 'user1', name: 'John', email: 'john@example.com' };
        collection.upsert(user);
        expect(collection.get('user1')).toEqual(user);
    });
});
```

## 📚 Further Reading

- **Core Package**: See `packages/core/README.md` for detailed API reference
- **DX Package**: See `packages/dx/README.md` for DX-specific documentation
- **Examples**: Check the `examples/` directory for usage patterns
- **Tests**: Review test files for implementation details

## 🤝 Contributing

Both packages are part of the OIMDB ecosystem. See the main project repository for contribution guidelines.

## 📄 License

MIT License - see LICENSE file for details.
