# OIMDB Performance Guide

This document provides detailed performance information and optimization strategies for OIMDB.

## Performance Overview

OIMDB is designed for high-performance scenarios with the following characteristics on an average laptop:

- **Insertions**: 600K - 6M ops/sec (depending on scale)
- **Updates**: 800K - 2.7M ops/sec (with event emission)
- **Subscriptions**: 2.8M - 9.8M ops/sec
- **Event Processing**: 16M - 2.4B ops/sec (depending on scheduler)
- **Index Operations**: 37K - 8.3M ops/sec (depending on operation type)

## Performance Benchmarks

### Collection Operations

| Operation | Small Scale (1K) | Medium Scale (100K) | Large Scale (1M) |
|-----------|------------------|---------------------|-------------------|
| Insert | 6.2M ops/sec | 2.1M ops/sec | 600K ops/sec |
| Update | 2.7M ops/sec | 1.8M ops/sec | 800K ops/sec |
| Delete | 5.8M ops/sec | 2.3M ops/sec | 700K ops/sec |
| Lookup | 9.8M ops/sec | 9.5M ops/sec | 9.2M ops/sec |

### Event System Performance

| Scheduler | Event Rate | Latency | Use Case |
|-----------|------------|---------|----------|
| Microtask | 2.4B ops/sec | <1ms | High-frequency updates |
| Immediate | 1.8B ops/sec | <1ms | Testing, debugging |
| Timeout | 16M ops/sec | 1-100ms | Batch processing |
| AnimationFrame | 8M ops/sec | 16ms | UI updates |

### Index Performance

| Operation | Small Index (1K keys) | Large Index (100K keys) |
|-----------|----------------------|-------------------------|
| Set | 8.3M ops/sec | 2.1M ops/sec |
| Add | 6.7M ops/sec | 1.8M ops/sec |
| Remove | 7.2M ops/sec | 1.9M ops/sec |
| Lookup | 9.1M ops/sec | 8.9M ops/sec |

## Performance Factors

### 1. Scale Impact

Performance degrades with scale due to:

- **Memory allocation** overhead
- **Garbage collection** pressure
- **Cache locality** degradation
- **Event queue** processing time

**Mitigation Strategies:**
- Use batch operations for large datasets
- Implement pagination for UI rendering
- Monitor memory usage and GC pressure
- Use appropriate data structures

### 2. Event System Impact

Event processing can become a bottleneck:

- **Subscription count** affects notification time
- **Event coalescing** reduces overhead
- **Scheduler choice** impacts latency vs throughput
- **Queue length** affects memory usage

**Optimization Strategies:**
- Minimize subscription count
- Use appropriate schedulers
- Monitor event queue length
- Implement event filtering

### 3. Memory Usage

Memory overhead per component:

| Component | Overhead | Notes |
|-----------|----------|-------|
| Entity | ~40 bytes | Map entry + entity data |
| Index Key | ~24 bytes | Map entry + array reference |
| Subscription | ~16 bytes | Handler reference + metadata |
| Event | ~32 bytes | Payload + metadata |

**Memory Optimization:**
- Use primitive types for keys when possible
- Minimize entity size
- Clean up unused subscriptions
- Monitor memory usage patterns

## Optimization Strategies

### 1. Entity Design

**Keep Entities Flat:**
```typescript
// ❌ Avoid nested objects
interface User {
    id: string;
    profile: {
        name: string;
        email: string;
        address: {
            street: string;
            city: string;
        };
    };
}

// ✅ Use normalized structure
interface User {
    id: string;
    name: string;
    email: string;
    addressId: string;
}

interface Address {
    id: string;
    street: string;
    city: string;
}
```

**Minimize Entity Size:**
```typescript
// ❌ Avoid large fields
interface Product {
    id: string;
    name: string;
    description: string; // Could be very long
    imageData: string; // Base64 encoded image
}

// ✅ Use references for large data
interface Product {
    id: string;
    name: string;
    descriptionId: string;
    imageId: string;
}
```

### 2. Index Optimization

**Choose Appropriate Comparison Strategy:**
```typescript
// For ordered lists (e.g., search results)
const searchIndex = db.createIndex<string, string>({
    comparison: 'element-wise'
});

// For unordered sets (e.g., tags)
const tagIndex = db.createIndex<string, string>({
    comparison: 'set-based'
});

// For always-updating data (e.g., timestamps)
const timeIndex = db.createIndex<number, string>({
    comparison: 'always-update'
});
```

**Optimize Index Keys:**
```typescript
// ❌ Avoid complex keys
const complexIndex = db.createIndex<string, string>();
complexIndex.set(JSON.stringify({ category: 'books', price: 100 }), ['product1']);

// ✅ Use simple, hashable keys
const categoryIndex = db.createIndex<string, string>();
const priceIndex = db.createIndex<number, string>();
categoryIndex.set('books', ['product1']);
priceIndex.set(100, ['product1']);
```

### 3. Event System Optimization

**Choose Appropriate Scheduler:**
```typescript
// High-frequency updates (e.g., real-time data)
const realtimeDb = createDb({ scheduler: 'microtask' });

// UI updates (e.g., React components)
const uiDb = createDb({ scheduler: 'animationFrame' });

// Batch processing (e.g., data imports)
const batchDb = createDb({ scheduler: 'timeout' });

// Testing and debugging
const testDb = createDb({ scheduler: 'immediate' });
```

**Optimize Subscriptions:**
```typescript
// ❌ Avoid subscribing to everything
users.subscribe('*', handler); // Not supported, but conceptually bad

// ✅ Subscribe only to needed entities
users.subscribe('user1', handler);
users.subscribeMany(['user1', 'user2'], handler);

// ✅ Use batch subscriptions when possible
users.subscribeMany(['user1', 'user2', 'user3'], handler);
```

**Implement Event Filtering:**
```typescript
// Filter events before processing
users.subscribe('user1', (user) => {
    if (user.status === 'active') {
        // Only process active users
        updateUI(user);
    }
});
```

### 4. Batch Operations

**Use Batch Operations for Multiple Updates:**
```typescript
// ❌ Multiple individual operations
users.forEach(user => {
    users.upsert(user);
});

// ✅ Single batch operation
users.upsertMany(users);
```

**Batch Index Updates:**
```typescript
// Update multiple index entries efficiently
const updates = [
    { key: 'admin', pks: ['user1', 'user2'] },
    { key: 'user', pks: ['user3', 'user4'] }
];

updates.forEach(({ key, pks }) => {
    roleIndex.set(key, pks);
});
```

### 5. Memory Management

**Clean Up Unused Resources:**
```typescript
// Destroy unused collections
const tempCollection = db.createCollection<TempData>();
// ... use collection
tempCollection.destroy();

// Unsubscribe from unused subscriptions
const unsubscribe = users.subscribe('user1', handler);
// ... later
unsubscribe();

// Clear unused indexes
const tempIndex = db.createIndex<string, string>();
// ... use index
tempIndex.clear();
```

**Monitor Memory Usage:**
```typescript
// Check collection size
const userCount = users.advanced.collection.getMetrics().totalEntities;

// Check index size
const indexMetrics = userByEmail.advanced.index.getMetrics();
console.log(`Index keys: ${indexMetrics.totalKeys}, PKs: ${indexMetrics.totalPks}`);

// Check event queue length
const queueLength = db.getMetrics().queueLength;
```

## Performance Monitoring

### 1. Built-in Metrics

OIMDB provides built-in metrics for monitoring:

```typescript
// Database metrics
const dbMetrics = db.getMetrics();
console.log(`Queue length: ${dbMetrics.queueLength}`);
console.log(`Scheduler: ${dbMetrics.scheduler}`);

// Collection metrics
const collectionMetrics = users.advanced.collection.getMetrics();
console.log(`Total entities: ${collectionMetrics.totalEntities}`);

// Index metrics
const indexMetrics = userByEmail.advanced.index.getMetrics();
console.log(`Total keys: ${indexMetrics.totalKeys}`);
console.log(`Total PKs: ${indexMetrics.totalPks}`);
console.log(`Average PKs per key: ${indexMetrics.averagePksPerKey}`);
```

### 2. Custom Performance Monitoring

Implement custom performance monitoring:

```typescript
class PerformanceMonitor {
    private metrics = new Map<string, number[]>();
    
    measure(operation: string, fn: () => void): void {
        const start = performance.now();
        fn();
        const duration = performance.now() - start;
        
        if (!this.metrics.has(operation)) {
            this.metrics.set(operation, []);
        }
        this.metrics.get(operation)!.push(duration);
    }
    
    getStats(operation: string) {
        const durations = this.metrics.get(operation) || [];
        if (durations.length === 0) return null;
        
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        
        return { avg, min, max, count: durations.length };
    }
}

const monitor = new PerformanceMonitor();

// Monitor collection operations
monitor.measure('userInsert', () => {
    users.upsertMany(largeUserArray);
});

// Monitor index operations
monitor.measure('indexBuild', () => {
    largeUserArray.forEach(user => {
        userByEmail.set(user.email, [user.id]);
    });
});

// Get performance stats
console.log('User insert:', monitor.getStats('userInsert'));
console.log('Index build:', monitor.getStats('indexBuild'));
```

### 3. Memory Leak Detection

Monitor for memory leaks:

```typescript
class MemoryMonitor {
    private snapshots: Map<string, number>[] = [];
    
    takeSnapshot(label: string): void {
        const snapshot = new Map<string, number>();
        
        // Monitor collection sizes
        snapshot.set('users', users.advanced.collection.getMetrics().totalEntities);
        snapshot.set('orders', orders.advanced.collection.getMetrics().totalEntities);
        
        // Monitor index sizes
        snapshot.set('userByEmail', userByEmail.advanced.index.getMetrics().totalKeys);
        
        // Monitor event queue
        snapshot.set('eventQueue', db.getMetrics().queueLength);
        
        this.snapshots.push(snapshot);
        
        if (this.snapshots.length > 10) {
            this.snapshots.shift();
        }
        
        console.log(`Snapshot "${label}":`, Object.fromEntries(snapshot));
    }
    
    detectLeaks(): void {
        if (this.snapshots.length < 2) return;
        
        const first = this.snapshots[0];
        const last = this.snapshots[this.snapshots.length - 1];
        
        for (const [key, firstValue] of first) {
            const lastValue = last.get(key) || 0;
            if (lastValue > firstValue * 1.5) {
                console.warn(`Potential memory leak in ${key}: ${firstValue} -> ${lastValue}`);
            }
        }
    }
}

const memoryMonitor = new MemoryMonitor();

// Take snapshots at key points
memoryMonitor.takeSnapshot('after-data-load');
memoryMonitor.takeSnapshot('after-user-actions');
memoryMonitor.takeSnapshot('after-cleanup');

// Check for leaks
memoryMonitor.detectLeaks();
```

## Performance Testing

### 1. Load Testing

Test performance under load:

```typescript
async function loadTest(operation: () => void, iterations: number): Promise<void> {
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
        operation();
    }
    
    const duration = performance.now() - start;
    const opsPerSec = (iterations / duration) * 1000;
    
    console.log(`${iterations} operations in ${duration.toFixed(2)}ms`);
    console.log(`${opsPerSec.toFixed(0)} operations/second`);
}

// Test collection operations
await loadTest(() => {
    users.upsert({ id: `user${Date.now()}`, name: 'Test User' });
}, 10000);

// Test index operations
await loadTest(() => {
    userByEmail.set(`email${Date.now()}@test.com`, [`user${Date.now()}`]);
}, 10000);
```

### 2. Memory Testing

Test memory usage patterns:

```typescript
function memoryTest(): void {
    const initialMemory = performance.memory?.usedJSHeapSize || 0;
    
    // Perform operations
    const largeArray = Array.from({ length: 100000 }, (_, i) => ({
        id: `user${i}`,
        name: `User ${i}`,
        email: `user${i}@test.com`
    }));
    
    users.upsertMany(largeArray);
    
    // Force garbage collection if available
    if (global.gc) {
        global.gc();
    }
    
    const finalMemory = performance.memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;
    
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
}

// Run with --expose-gc flag for garbage collection
// node --expose-gc memory-test.js
```

### 3. Stress Testing

Test system limits:

```typescript
async function stressTest(): Promise<void> {
    const startTime = Date.now();
    let operations = 0;
    let errors = 0;
    
    // Run operations continuously
    while (Date.now() - startTime < 30000) { // 30 seconds
        try {
            // Random operations
            const operation = Math.floor(Math.random() * 4);
            
            switch (operation) {
                case 0:
                    users.upsert({ id: `user${Date.now()}`, name: 'Stress Test' });
                    break;
                case 1:
                    userByEmail.set(`email${Date.now()}`, [`user${Date.now()}`]);
                    break;
                case 2:
                    users.remove({ id: `user${Date.now()}` });
                    break;
                case 3:
                    userByEmail.clear(`email${Date.now()}`);
                    break;
            }
            
            operations++;
        } catch (error) {
            errors++;
            console.error('Stress test error:', error);
        }
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    console.log(`Stress test completed:`);
    console.log(`  Operations: ${operations}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Success rate: ${((operations - errors) / operations * 100).toFixed(2)}%`);
}
```

## Best Practices Summary

### 1. Design Principles
- **Keep entities flat and normalized**
- **Use appropriate data types for keys**
- **Minimize entity size**
- **Design for O(1) operations**

### 2. Operation Patterns
- **Use batch operations for multiple items**
- **Choose appropriate schedulers**
- **Subscribe only to needed entities**
- **Implement event filtering**

### 3. Memory Management
- **Clean up unused resources**
- **Monitor memory usage**
- **Use appropriate data structures**
- **Implement pagination for large datasets**

### 4. Performance Monitoring
- **Use built-in metrics**
- **Implement custom monitoring**
- **Detect memory leaks**
- **Test under load**

### 5. Optimization Techniques
- **Profile before optimizing**
- **Focus on bottlenecks**
- **Use appropriate comparison strategies**
- **Implement caching when beneficial**

By following these guidelines, you can achieve optimal performance with OIMDB in your applications.
