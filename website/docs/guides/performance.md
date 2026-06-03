---
sidebar_position: 1
---

# Performance

## Benchmarks

Numbers on an average laptop — treat as directional.

```bash
npx tsx packages/core/bench/index.ts
```

### Collection

| Operation | 1K entities | 100K entities | 1M entities |
|-----------|-------------|----------------|-------------|
| Insert | 6.2M/s | 2.1M/s | 600K/s |
| Update | 2.7M/s | 1.8M/s | 800K/s |
| Delete | 5.8M/s | 2.3M/s | 700K/s |
| Lookup | 9.8M/s | 9.5M/s | 9.2M/s |

### Schedulers

| Scheduler | Throughput | Best for |
|-----------|------------|---------|
| `createMicrotask()` | 2.4B/s | Default — same-tick delivery |
| `createImmediate()` | 1.8B/s | Tests |
| `createTimeout(0)` | 16M/s | Batch / import workloads |
| `createAnimationFrame()` | 8M/s | UI-aligned, React-friendly |

### Indexes

| Operation | 1K keys | 100K keys |
|-----------|---------|-----------|
| Set / Add / Remove | 6–8M/s | 1–2M/s |
| Lookup | 9.1M/s | 8.9M/s |

Computed values and effects run inside the same `queue.flush()` drain — derived recompute and subscriber delivery happen in the same pass.

## Key patterns

### Batch writes

```typescript
// ✅ single notification batch, slots reusable by indexes
const slots = users.upsertMany(largeUserArray);
rawIndex.setSlots('visible', slots);

// ❌ N pending notifications before flush
largeUserArray.forEach(user => users.upsertOne(user));
```

### Scheduler for bulk imports

`microtask` (default) is fastest for typical UI writes. For large bulk imports, use `timeout` to avoid blocking the event loop:

```typescript
const importQueue = new OIMEventQueue({
    scheduler: OIMEventQueueSchedulerFactory.createTimeout(0),
});
```

### Index comparators

Choosing the wrong comparator triggers unnecessary re-renders.

```typescript
// Order-sensitive (search results, ranked lists)
OIMIndexComparatorFactory.createElementWiseComparator<string>()

// Order-insensitive (tags, roles) — ignores reordering
OIMIndexComparatorFactory.createSetBasedComparator<string>()

// Always notify (external ordering you don't control)
OIMIndexComparatorFactory.createAlwaysUpdateComparator<string>()
```

### Slot-backed reads

Indexes store slot references. Entity-by-index reads use `slot.item` directly with no secondary Map lookup per PK. Prefer `entitiesBySetIndexKey` / `entitiesByArrayIndexKey` selectors over `getPksByKey` + manual lookup.

### Cleanup

```typescript
const off = users.updateEventEmitter.subscribeOnKey('u1', handler);
off(); // unsubscribe when done

index.destroy(); // release indexes you no longer need
```
