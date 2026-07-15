# OIMDB - In-Memory Database for Frontend State Management

A high-performance, event-driven in-memory database designed specifically for frontend applications. OIMDB provides reactive collections, intelligent indexing, and configurable event processing for building fast, predictable state management solutions.

## 📦 Packages

OIMDB is now organized as a monorepo with separate packages:

### [@oimdb/core](packages/core/) - Core Library
The foundational reactive collections, indexing, and event processing library.

```bash
npm install @oimdb/core
```

**Key Features:**
- Reactive collections/objects/indexes with key-scoped subscriptions
- Intelligent event coalescing and reentrancy-safe delivery for optimal performance  
- Configurable schedulers (microtask, timeout, animationFrame, immediate)
- Effects & Computed scheduled via `OIMComputeRuntime` (single draining `queue.flush()` boundary)
- Type-safe operations with full TypeScript support
- O(1) lookups and efficient indexing

[📖 See @oimdb/core documentation](packages/core/README.md)

### [@oimdb/react](packages/react/) - React Integration
React hooks for seamless integration with OIMDB reactive collections.

```bash
npm install @oimdb/react @oimdb/core
```

**Key Features:**
- Direct integration with `OIMReactiveCollection` and collection-bound indexes
- Automatic subscriptions using `useSyncExternalStore`
- React Context support for centralized collection management
- Key-specific subscriptions for efficient re-renders

[📖 See @oimdb/react documentation](packages/react/README.md)

### [@oimdb/redux-adapter](packages/redux-adapter/) - Redux Integration
Production-ready Redux adapter for gradual migration from Redux to OIMDB or hybrid usage.

```bash
npm install @oimdb/redux-adapter @oimdb/core redux
```

**Key Features:**
- **🔄 Two-Way Synchronization**: Automatic sync between OIMDB and Redux in both directions
- **⚡ Automatic Flushing**: Built-in middleware automatically processes events after Redux actions
- **📦 Production Ready**: Battle-tested, optimized for large datasets
- **🔄 Gradual Migration**: Integrate OIMDB into existing Redux projects without breaking changes
- **🎯 Flexible State Mapping**: Custom mappers for any Redux state structure
- **⚡ Performance Optimized**: Efficient diffing algorithms and batched updates

**Perfect for:**
- Migrating from Redux to OIMDB incrementally
- Using OIMDB for complex relational data alongside Redux
- Replacing Redux entirely while maintaining compatibility

[📖 See @oimdb/redux-adapter documentation](packages/redux-adapter/README.md)

## ✨ Quick Example

```typescript
import { OIMReactiveCollection, OIMEventQueue, OIMEventQueueSchedulerFactory } from '@oimdb/core';

interface User {
  id: string;
  name: string;
  email: string;
}

// Create reactive collection
const queue = new OIMEventQueue({
  scheduler: OIMEventQueueSchedulerFactory.createMicrotask()
});

const users = new OIMReactiveCollection<User, string>(queue, {
  selectPk: (user) => user.id
});

// Subscribe to changes
users.updateEventEmitter.subscribeOnKey('user1', () => {
  console.log('User1 updated!');
});

// Insert and update data. Writes return canonical slots, which can be reused by indexes.
const userSlot = users.upsertOne({
  id: 'user1',
  name: 'John',
  email: 'john@example.com'
});
const updatedUserSlot = users.upsertOne({
  id: 'user1',
  name: 'John Doe',
  email: 'john@example.com'
});
console.log(userSlot === updatedUserSlot); // true
// Only one notification fires due to intelligent coalescing
```

## 🎯 Key Benefits

- **🚀 Performance First**: Map-based storage with O(1) lookups
- **📡 Reactive Architecture**: Automatic change notifications with intelligent coalescing  
- **🔧 Type Safety**: Full TypeScript support with advanced generics
- **⚡ Configurable**: Multiple scheduler options for different use cases
- **🏗️ Modular**: Use only what you need, extend what you want

## 🚀 Getting Started

For detailed documentation and API reference, visit the individual package READMEs:

- **[@oimdb/core](packages/core/README.md)** - Complete core library documentation
- **[@oimdb/react](packages/react/README.md)** - React integration guide
- **[@oimdb/redux-adapter](packages/redux-adapter/README.md)** - Redux migration and integration guide

## 🧪 Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run benchmarks
npm run bench

# Build packages
npm run build
```

## 📚 Documentation

Full documentation is published at **[oimdb.org](https://oimdb.org/)**.

Source docs live in [`website/docs/`](website/docs/).

## 🤝 Contributing

Contributions are welcome! OIMDB is designed to be modular and extensible.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/abaikov/oimdb/issues)

---

**OIMDB** - High-performance, reactive in-memory database for frontend applications. 🚀
