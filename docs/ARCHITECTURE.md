# OIMDB Architecture

This document describes the architecture and design principles behind OIMDB.

## Overview

OIMDB is built with a layered architecture that separates concerns and provides flexibility:

```
┌─────────────────────────────────────────────────────────────┐
│                        DX Layer                            │
│              (Developer Experience)                        │
├─────────────────────────────────────────────────────────────┤
│                      Core Layer                            │
│              (Low-level Components)                        │
├─────────────────────────────────────────────────────────────┤
│                    Abstract Layer                          │
│              (Interfaces & Base Classes)                   │
└─────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Performance First
- **In-memory operations** for maximum speed
- **Zero serialization** overhead
- **Optimized data structures** (Map, Set)
- **Efficient event processing** with configurable schedulers

### 2. Modularity
- **Single Responsibility** - each class has one clear purpose
- **Open/Closed** - extensible through composition
- **Dependency Inversion** - depend on abstractions
- **Interface Segregation** - small, focused interfaces

### 3. Developer Experience
- **Simple APIs** for common cases
- **Powerful customization** for advanced users
- **Type safety** throughout the system
- **Predictable behavior** - no hidden performance traps

## Core Components

### Collections

Collections are the primary data containers in OIMDB.

```typescript
class OIMCollection<TEntity, TPk> {
    private store: OIMCollectionStore<TEntity, TPk>;
    private selectPk: TOIMPkSelector<TEntity, TPk>;
    private updateEntity: TOIMEntityUpdater<TEntity>;
    public emitter: OIMCollectionUpdateEventEmitter<TPk>;
}
```

**Responsibilities:**
- Store entities with O(1) access by primary key
- Emit events when entities change
- Provide CRUD operations
- Manage entity lifecycle

**Key Features:**
- **Normalized storage** - no nested objects
- **Event emission** on every change
- **Batch operations** support
- **Custom entity updaters** for merge strategies

### Indexes

Indexes provide fast lookups by secondary keys.

```typescript
class OIMIndexManual<TIndexKey, TPk> extends OIMIndex<TIndexKey, TPk> {
    private data = new Map<TIndexKey, TPk[]>();
    private comparePks?: TOIMIndexComparator<TPk>;
    public emitter: OIMIndexUpdateEventEmitter<TIndexKey>;
}
```

**Responsibilities:**
- Map index keys to arrays of primary keys
- Emit events when index data changes
- Support different comparison strategies
- Provide efficient querying

**Comparison Strategies:**
- **Element-wise**: Compare arrays element by element
- **Set-based**: Treat arrays as sets (order doesn't matter)
- **Always-update**: Always consider changes as updates
- **Custom**: User-defined comparison logic

### Event System

The event system provides reactive updates with intelligent coalescing.

```typescript
class OIMUpdateEventEmitter<TPk> {
    private coalescer: OIMUpdateEventCoalescer<TPk>;
    private queue: OIMEventQueue;
    private subscriptions = new Map<TPk, Set<TOIMEventHandler>>();
}
```

**Responsibilities:**
- Manage event subscriptions
- Coalesce multiple updates to the same entity
- Schedule event processing
- Deliver notifications efficiently

**Coalescing:**
- Multiple updates to the same entity = single notification
- Configurable coalescing strategies
- Support for batch operations

### Event Queue

The event queue manages when and how events are processed.

```typescript
class OIMEventQueue {
    private scheduler: OIMEventQueueScheduler;
    private events: TOIMUpdatePayload<TPk>[] = [];
}
```

**Responsibilities:**
- Buffer events until processing
- Schedule event delivery
- Support different processing strategies
- Provide manual flush capabilities

**Schedulers:**
- **Microtask**: Fastest, same tick processing
- **Immediate**: Instant processing, good for testing
- **Timeout**: Batched processing, performance optimized
- **AnimationFrame**: Smooth UI updates, React-friendly

## Data Flow

### 1. Entity Update

```
User updates entity → Collection stores change → Emitter queues event → Queue processes event → Subscribers notified
```

### 2. Index Update

```
Index data changes → Index emitter queues event → Queue processes event → Index subscribers notified
```

### 3. Event Coalescing

```
Multiple updates to same entity → Coalescer tracks changes → Single event emitted → Subscribers receive one notification
```

## Storage Layer

### Collection Store

```typescript
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
```

**Default Implementation:** `OIMCollectionStoreMapDriven<TEntity, TPk>`
- Uses `Map<TPk, TEntity>` for storage
- O(1) access for all operations
- Memory efficient for most use cases

**Custom Implementations:**
- Persistent storage adapters
- Caching layers
- Specialized data structures

## Event Processing

### Event Lifecycle

1. **Creation**: Entity or index changes trigger event creation
2. **Coalescing**: Multiple events for the same entity are combined
3. **Queuing**: Events are added to the processing queue
4. **Scheduling**: Scheduler determines when to process events
5. **Processing**: Events are delivered to subscribers
6. **Cleanup**: Processed events are removed from queue

### Coalescing Strategies

```typescript
interface OIMUpdateEventCoalescer<TPk> {
    addUpdatedKeys(keys: readonly TPk[]): void;
    getUpdatedKeys(): readonly TPk[];
    clearUpdatedKeys(): void;
}
```

**Collection Coalescer:**
- Tracks entity updates across collections
- Supports cross-collection coalescing
- Optimized for entity-centric workflows

**Index Coalescer:**
- Tracks index key updates
- Supports index-specific coalescing
- Optimized for index-centric workflows

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Entity Insert/Update | O(1) | Direct Map access |
| Entity Delete | O(1) | Direct Map access |
| Entity Lookup | O(1) | Direct Map access |
| Index Set/Add/Remove | O(1) | Direct Map access |
| Index Lookup | O(1) | Direct Map access |
| Event Emission | O(n) | n = number of subscribers |
| Event Coalescing | O(1) | Set-based tracking |

### Memory Usage

- **Collections**: ~40 bytes per entity + entity size
- **Indexes**: ~24 bytes per index key + 8 bytes per PK reference
- **Event System**: ~16 bytes per subscription + event buffer
- **Overhead**: Minimal compared to entity data

### Scalability

- **Entity Count**: Millions of entities supported
- **Index Count**: Thousands of indexes supported
- **Subscription Count**: Hundreds of thousands of subscriptions
- **Event Rate**: Millions of events per second

## Extension Points

### Custom Storage

```typescript
class CustomStore<T> implements OIMCollectionStore<T> {
    // Implement interface methods
}

const collection = new OIMCollection<User>({
    store: new CustomStore<User>(),
    // ... other options
});
```

### Custom Comparators

```typescript
const customComparator: TOIMIndexComparator<number> = (oldPks, newPks) => {
    // Custom comparison logic
    return customComparison(oldPks, newPks);
};

const index = new OIMIndexManual<string, number>({
    comparePks: customComparator
});
```

### Custom Schedulers

```typescript
class CustomScheduler implements OIMEventQueueScheduler {
    schedule(process: () => void): void {
        // Custom scheduling logic
    }
    
    cancel(): void {
        // Custom cancellation logic
    }
}
```

## Best Practices

### 1. Entity Design
- **Keep entities flat** - no nested objects
- **Use references** for relationships
- **Minimize entity size** for better performance
- **Choose appropriate primary keys**

### 2. Index Usage
- **Create indexes for frequent queries**
- **Use appropriate comparison strategies**
- **Keep index keys simple**
- **Monitor index performance**

### 3. Event Management
- **Choose appropriate schedulers**
- **Subscribe only to needed entities**
- **Use batch operations when possible**
- **Monitor event queue length**

### 4. Memory Management
- **Destroy unused collections/indexes**
- **Unsubscribe from unused subscriptions**
- **Monitor memory usage**
- **Use appropriate data structures**

## Testing Strategy

### Unit Tests
- **Component isolation** - test each component independently
- **Mock dependencies** - use test doubles for external components
- **Edge cases** - test boundary conditions and error cases
- **Performance** - verify performance characteristics

### Integration Tests
- **Component interaction** - test how components work together
- **Event flow** - verify complete event processing
- **Real-world scenarios** - test common usage patterns
- **Error handling** - verify error propagation

### Performance Tests
- **Benchmarks** - measure operation performance
- **Memory tests** - verify memory usage patterns
- **Stress tests** - test under high load
- **Regression tests** - prevent performance degradation

## Future Considerations

### Planned Features
- **Persistence layer** - save/restore database state
- **Query language** - SQL-like query interface
- **GraphQL integration** - GraphQL resolver support
- **Real-time sync** - WebSocket integration

### Performance Improvements
- **WebAssembly** - critical path optimization
- **Worker threads** - background processing
- **Memory pooling** - reduce allocation overhead
- **Lazy evaluation** - defer expensive operations

### Ecosystem Integration
- **React hooks** - React-specific utilities
- **Vue composables** - Vue-specific utilities
- **Angular services** - Angular-specific utilities
- **DevTools** - debugging and profiling tools
