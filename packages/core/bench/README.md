# OIMDB Benchmarks

This directory contains comprehensive performance benchmarks for the OIMDB library.

## 🚀 Quick Start

```bash
# Build the library first
npm run build

# Run all benchmarks
npx tsx bench/index.ts

# Run specific benchmark suites
npx tsx bench/collection.bench.ts
npx tsx bench/index.bench.ts
npx tsx bench/slot-index-read.bench.ts
npx tsx bench/subscription-dispatch.bench.ts
npx tsx bench/effect-computed.bench.ts
```

## 📊 Benchmark Suites

### `collection.bench.ts` - Collection Performance
- **Insertion Performance**: Entity creation and storage
- **Update Performance**: Entity modification and event emission
- **Subscription Performance**: Event handler registration
- **Event Processing**: Event queue throughput
- **Memory Leak Testing**: Long-running stability
- **Stress Testing**: High-load scenarios

### `index.bench.ts` - Index Performance
- **Set Operations**: Index key-value assignment
- **Add Operations**: Adding PKs to existing keys
- **Remove Operations**: Removing PKs from keys
- **Comparator Performance**: Different comparison strategies
- **Stress Testing**: Mixed operations under load

### `slot-index-read.bench.ts` - Slot-backed Index Reads
- **Current vs Slot Reads**: Compares `pk[] + collection.get(pk)` with `slot[] -> slot.item`
- **Entry Variant**: Compares `{ pk, item }` entries against lightweight slots
- **Update Cost**: Measures replacing collection entities through stable slots
- **Memory Cost**: Estimates extra heap from canonical slots and slot-backed buckets

### `subscription-dispatch.bench.ts` - Subscription & Dispatch Performance
- **Subscription performance**: `subscribeOnKey` vs `subscribeOnKeys`
- **Unsubscribe performance**: bulk teardown cost
- **Dispatch performance**: pure `OIMUpdateEventEmitter` delivery cost (without CRUD), across:
  - small vs large updated-keys batches (exercises adaptive iteration strategy)
  - different handlers-per-key cardinality

### `effect-computed.bench.ts` - Effects & Computed Performance
- **Computed recompute**: invalidation → recompute cost per flush
- **Computed subscriber delivery**: recompute + delivery within the same draining flush
- **Scaling**: chain and diamond graphs (computed-to-computed dependencies)

### `index.ts` - Benchmark Coordinator
- Orchestrates all benchmark suites
- Provides unified reporting
- Exports individual runners

## 🎯 Performance Metrics

Each benchmark measures:
- **Total Time**: Wall-clock execution time
- **Average Time per Operation**: Per-operation latency
- **Operations per Second**: Throughput measurement
- **Memory Usage**: Heap memory consumption
- **Scalability**: Performance across different scales

## 🔧 Benchmark Scenarios

### Collection Benchmarks
- **Small Scale**: 1,000 entities, 100 updates, 50 subscribers
- **Medium Scale**: 10,000 entities, 1,000 updates, 500 subscribers
- **Large Scale**: 100,000 entities, 10,000 updates, 5,000 subscribers
- **Subscription Heavy**: 5,000 entities, 500 updates, 2,500 subscribers
- **Update Heavy**: 10,000 entities, 100,000 updates, 100 subscribers

### Index Benchmarks
- **Small Scale**: 100 keys, 10 PKs per key, 1,000 operations
- **Medium Scale**: 1,000 keys, 50 PKs per key, 10,000 operations
- **Large Scale**: 10,000 keys, 100 PKs per key, 100,000 operations
- **Key Heavy**: 5,000 keys, 20 PKs per key, 50,000 operations
- **PK Heavy**: 1,000 keys, 500 PKs per key, 50,000 operations

## 📈 Performance Insights

### Collection Performance
- **Insertions**: 600K - 6M ops/sec (depending on scale)
- **Updates**: 800K - 2.7M ops/sec (with event emission)
- **Subscriptions**: 2.8M - 9.8M ops/sec
- **Event Processing**: 16M - 2.4B ops/sec (depending on scheduler)

### Index Performance
- **Set Operations**: 37K - 1.2M ops/sec (depending on PK count)
- **Add Operations**: 4.7M - 8.3M ops/sec
- **Remove Operations**: 3.2M - 8.3M ops/sec
- **Comparator Impact**: 2-10x performance improvement with comparators
- **Slot-backed Entity Reads**: Avoid per-item collection lookups by reading `slot.item` directly

### Memory Characteristics
- **Stable Usage**: No memory leaks detected
- **Linear Scaling**: Memory usage scales with data size
- **Efficient Cleanup**: Proper resource management

## 🧪 Running Custom Benchmarks

```typescript
import { OIMPerformanceBenchmark } from '../bench/collection.bench';

const benchmark = new OIMPerformanceBenchmark();

// Custom scenario
const result = await benchmark.benchmarkInsertions({
    name: 'Custom Test',
    entityCount: 5000,
    updateCount: 500,
    subscriberCount: 250
});

console.log(`Performance: ${result.opsPerSecond} ops/sec`);
```

## 📖 API Reference

For detailed benchmark API documentation:
- **Collection Benchmarks**: `OIMPerformanceBenchmark` class
- **Index Benchmarks**: `OIMIndexPerformanceBenchmark` class
- **Result Types**: `TOIMBenchResult` interface
- **Scenario Types**: `TOIMBenchScenario` interface

## 🎯 Use Cases

- **Performance Testing**: Validate library performance
- **Regression Detection**: Catch performance regressions
- **Optimization Validation**: Measure optimization impact
- **Capacity Planning**: Understand scaling characteristics
- **Comparison**: Compare with other solutions
