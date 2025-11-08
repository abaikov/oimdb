import { OIMCollection } from '../src/core/OIMCollection';
import { OIMCollectionStoreMapDriven } from '../src/core/OIMCollectionStoreMapDriven';
import { OIMPkSelectorFactory } from '../src/core/OIMPkSelectorFactory';
import { OIMEntityUpdaterFactory } from '../src/core/OIMEntityUpdaterFactory';
import { OIMUpdateEventCoalescerCollection } from '../src/core/OIMUpdateEventCoalescerCollection';
import { OIMUpdateEventEmitter } from '../src/core/OIMUpdateEventEmitter';
import { OIMEventQueue } from '../src/core/OIMEventQueue';

interface TOIMBenchEntity {
    id: string;
    name: string;
    category: string;
    value: number;
    active: boolean;
}

interface TOIMBenchResult {
    name: string;
    totalTime: number;
    avgTimePerOp: number;
    opsPerSecond: number;
    memoryUsage?: number;
}

interface TOIMBenchScenario {
    name: string;
    entityCount: number;
    updateCount: number;
    subscriberCount: number;
    batchSize?: number;
}

class OIMPerformanceBenchmark {
    private collection!: OIMCollection<TOIMBenchEntity, string>;
    private coalescer!: OIMUpdateEventCoalescerCollection<string>;
    private queue!: OIMEventQueue;
    private emitter!: OIMUpdateEventEmitter<string>;

    constructor() {
        this.setupComponents();
    }

    private setupComponents(): void {
        this.collection = new OIMCollection<TOIMBenchEntity, string>({
            selectPk: new OIMPkSelectorFactory<
                TOIMBenchEntity,
                string
            >().createIdSelector(),
            store: new OIMCollectionStoreMapDriven<TOIMBenchEntity, string>(),
            updateEntity:
                new OIMEntityUpdaterFactory<TOIMBenchEntity>().createMergeEntityUpdater(),
        });

        this.coalescer = new OIMUpdateEventCoalescerCollection(
            this.collection.emitter
        );

        this.queue = new OIMEventQueue();
        this.emitter = new OIMUpdateEventEmitter({
            coalescer: this.coalescer,
            queue: this.queue,
        });
    }

    private generateEntities(count: number): TOIMBenchEntity[] {
        const entities: TOIMBenchEntity[] = [];
        const categories = ['A', 'B', 'C', 'D', 'E'];

        for (let i = 0; i < count; i++) {
            entities.push({
                id: `entity${i}`,
                name: `Entity ${i}`,
                category: categories[i % categories.length],
                value: Math.random() * 1000,
                active: Math.random() > 0.5,
            });
        }

        return entities;
    }

    private setupSubscribers(count: number): void {
        const handler = () => {
            /* noop */
        };

        for (let i = 0; i < count; i++) {
            this.emitter.subscribeOnKey(`entity${i}`, handler);
        }
    }

    private measureTime<T>(operation: () => T): { result: T; time: number } {
        const start = performance.now();
        const result = operation();
        const end = performance.now();
        return { result, time: end - start };
    }

    private getMemoryUsage(): number {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            return process.memoryUsage().heapUsed / 1024 / 1024; // MB
        }
        return 0;
    }

    public async benchmarkInsertions(
        scenario: TOIMBenchScenario
    ): Promise<TOIMBenchResult> {
        const entities = this.generateEntities(scenario.entityCount);
        this.setupSubscribers(scenario.subscriberCount);

        const memoryBefore = this.getMemoryUsage();

        const { time } = this.measureTime(() => {
            if (scenario.batchSize && scenario.batchSize > 1) {
                // Batch insertions
                for (let i = 0; i < entities.length; i += scenario.batchSize) {
                    const batch = entities.slice(i, i + scenario.batchSize);
                    this.collection.upsertMany(batch);
                }
            } else {
                // Individual insertions
                entities.forEach(entity => this.collection.upsertOne(entity));
            }

            // Process all events
            this.queue.flush();
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: scenario.name,
            totalTime: time,
            avgTimePerOp: time / scenario.entityCount,
            opsPerSecond: scenario.entityCount / (time / 1000),
            memoryUsage: memoryAfter - memoryBefore,
        };
    }

    public async benchmarkUpdates(
        scenario: TOIMBenchScenario
    ): Promise<TOIMBenchResult> {
        // Setup initial data
        const entities = this.generateEntities(scenario.entityCount);
        this.collection.upsertMany(entities);
        this.setupSubscribers(scenario.subscriberCount);
        this.queue.flush();

        // Prepare updates
        const updateIndices = Array.from({ length: scenario.updateCount }, () =>
            Math.floor(Math.random() * scenario.entityCount)
        );

        const memoryBefore = this.getMemoryUsage();

        const { time } = this.measureTime(() => {
            updateIndices.forEach(index => {
                const entity = entities[index];
                const updatedEntity = {
                    ...entity,
                    value: entity.value + Math.random() * 100,
                    active: !entity.active,
                };
                this.collection.upsertOne(updatedEntity);
            });

            this.queue.flush();
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: scenario.name,
            totalTime: time,
            avgTimePerOp: time / scenario.updateCount,
            opsPerSecond: scenario.updateCount / (time / 1000),
            memoryUsage: memoryAfter - memoryBefore,
        };
    }

    public async benchmarkSubscriptions(
        scenario: TOIMBenchScenario
    ): Promise<TOIMBenchResult> {
        const entities = this.generateEntities(scenario.entityCount);
        this.collection.upsertMany(entities);
        this.queue.flush();

        const memoryBefore = this.getMemoryUsage();

        const { time } = this.measureTime(() => {
            const handler = () => {
                /* noop */
            };

            for (let i = 0; i < scenario.subscriberCount; i++) {
                const entityId = `entity${i % scenario.entityCount}`;
                this.emitter.subscribeOnKey(entityId, handler);
            }
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: scenario.name,
            totalTime: time,
            avgTimePerOp: time / scenario.subscriberCount,
            opsPerSecond: scenario.subscriberCount / (time / 1000),
            memoryUsage: memoryAfter - memoryBefore,
        };
    }

    public async benchmarkEventProcessing(
        scenario: TOIMBenchScenario
    ): Promise<TOIMBenchResult> {
        // Setup data and subscribers
        const entities = this.generateEntities(scenario.entityCount);
        this.collection.upsertMany(entities);
        this.setupSubscribers(scenario.subscriberCount);
        this.queue.flush();

        // Queue up many updates without processing
        const updateIndices = Array.from({ length: scenario.updateCount }, () =>
            Math.floor(Math.random() * scenario.entityCount)
        );

        updateIndices.forEach(index => {
            const entity = entities[index];
            const updatedEntity = {
                ...entity,
                value: entity.value + 1,
            };
            this.collection.upsertOne(updatedEntity);
        });

        const memoryBefore = this.getMemoryUsage();

        // Measure event processing time
        const { time } = this.measureTime(() => {
            this.queue.flush();
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: scenario.name,
            totalTime: time,
            avgTimePerOp: time / scenario.updateCount,
            opsPerSecond: scenario.updateCount / (time / 1000),
            memoryUsage: memoryAfter - memoryBefore,
        };
    }

    public cleanup(): void {
        this.emitter.destroy();
        this.coalescer.destroy();
        this.queue.destroy();
        this.collection.emitter.offAll();
    }
}

// Benchmark scenarios
export const BENCHMARK_SCENARIOS: Record<string, TOIMBenchScenario> = {
    small: {
        name: 'Small Scale',
        entityCount: 1_000,
        updateCount: 5_000,
        subscriberCount: 500,
        batchSize: 100,
    },
    medium: {
        name: 'Medium Scale',
        entityCount: 10_000,
        updateCount: 50_000,
        subscriberCount: 5_000,
        batchSize: 500,
    },
    large: {
        name: 'Large Scale',
        entityCount: 100_000,
        updateCount: 500_000,
        subscriberCount: 50_000,
        batchSize: 1000,
    },
    subscription_heavy: {
        name: 'Subscription Heavy',
        entityCount: 5_000,
        updateCount: 10_000,
        subscriberCount: 25_000,
        batchSize: 100,
    },
    update_heavy: {
        name: 'Update Heavy',
        entityCount: 5_000,
        updateCount: 100_000,
        subscriberCount: 1_000,
        batchSize: 100,
    },
};

export async function runBenchmarkSuite(): Promise<void> {
    console.log('🚀 Starting OIM Performance Benchmark Suite\n');

    for (const scenario of Object.values(BENCHMARK_SCENARIOS)) {
        console.log(`📊 Running ${scenario.name} benchmarks...`);

        const benchmark = new OIMPerformanceBenchmark();

        try {
            // Run insertion benchmark
            const insertionResult =
                await benchmark.benchmarkInsertions(scenario);
            console.log(
                `  ✅ Insertions: ${insertionResult.opsPerSecond.toFixed(0)} ops/sec (${insertionResult.totalTime.toFixed(2)}ms total)`
            );

            // Reset for updates benchmark
            benchmark.cleanup();
            const updateBenchmark = new OIMPerformanceBenchmark();
            const updateResult =
                await updateBenchmark.benchmarkUpdates(scenario);
            console.log(
                `  ✅ Updates: ${updateResult.opsPerSecond.toFixed(0)} ops/sec (${updateResult.totalTime.toFixed(2)}ms total)`
            );

            // Reset for subscriptions benchmark
            updateBenchmark.cleanup();
            const subscriptionBenchmark = new OIMPerformanceBenchmark();
            const subscriptionResult =
                await subscriptionBenchmark.benchmarkSubscriptions(scenario);
            console.log(
                `  ✅ Subscriptions: ${subscriptionResult.opsPerSecond.toFixed(0)} ops/sec (${subscriptionResult.totalTime.toFixed(2)}ms total)`
            );

            // Reset for event processing benchmark
            subscriptionBenchmark.cleanup();
            const eventBenchmark = new OIMPerformanceBenchmark();
            const eventResult =
                await eventBenchmark.benchmarkEventProcessing(scenario);
            console.log(
                `  ✅ Event Processing: ${eventResult.opsPerSecond.toFixed(0)} ops/sec (${eventResult.totalTime.toFixed(2)}ms total)`
            );

            eventBenchmark.cleanup();

            console.log(
                `  💾 Memory Usage: ${(insertionResult.memoryUsage || 0).toFixed(2)}MB\n`
            );
        } catch (error) {
            console.error(`  ❌ Error in ${scenario.name}:`, error);
            benchmark.cleanup();
        }
    }
}

export async function runMemoryLeakTest(): Promise<void> {
    console.log('🔍 Running Memory Leak Test...\n');

    const iterations = 100;
    const entitiesPerIteration = 1000;
    const subscribersPerIteration = 500;

    let initialMemory = 0;
    const memorySnapshots: number[] = [];

    for (let i = 0; i < iterations; i++) {
        const benchmark = new OIMPerformanceBenchmark();

        // Generate and process data
        const entities: TOIMBenchEntity[] = [];
        for (let j = 0; j < entitiesPerIteration; j++) {
            entities.push({
                id: `entity${i}_${j}`,
                name: `Entity ${i}_${j}`,
                category: 'test',
                value: Math.random() * 1000,
                active: true,
            });
        }

        // Setup subscribers
        const handler = () => {
            /* noop */
        };
        for (let j = 0; j < subscribersPerIteration; j++) {
            benchmark['emitter'].subscribeOnKey(`entity${i}_${j}`, handler);
        }

        // Insert and update data
        benchmark['collection'].upsertMany(entities);
        benchmark['queue'].flush();

        // Cleanup
        benchmark.cleanup();

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        // Record memory usage
        const currentMemory = benchmark['getMemoryUsage']();
        memorySnapshots.push(currentMemory);

        if (i === 0) {
            initialMemory = currentMemory;
        }

        if (i % 10 === 0) {
            const memoryIncrease = currentMemory - initialMemory;
            console.log(
                `  Iteration ${i}: ${currentMemory.toFixed(2)}MB (${memoryIncrease >= 0 ? '+' : ''}${memoryIncrease.toFixed(2)}MB)`
            );
        }
    }

    const finalMemory = memorySnapshots[memorySnapshots.length - 1];
    const memoryIncrease = finalMemory - initialMemory;
    const avgMemoryPerIteration = memoryIncrease / iterations;

    console.log(`\n📊 Memory Leak Test Results:`);
    console.log(`  Initial Memory: ${initialMemory.toFixed(2)}MB`);
    console.log(`  Final Memory: ${finalMemory.toFixed(2)}MB`);
    console.log(`  Total Increase: ${memoryIncrease.toFixed(2)}MB`);
    console.log(
        `  Avg Increase per Iteration: ${avgMemoryPerIteration.toFixed(3)}MB`
    );

    if (avgMemoryPerIteration < 0.1) {
        console.log(`  ✅ Memory usage appears stable`);
    } else {
        console.log(`  ⚠️  Potential memory leak detected`);
    }
}

export async function runStressBenchmark(): Promise<void> {
    console.log('💪 Running Stress Test...\n');

    const benchmark = new OIMPerformanceBenchmark();
    const stressScenario: TOIMBenchScenario = {
        name: 'Stress Test',
        entityCount: 50_000,
        updateCount: 1_000_000,
        subscriberCount: 25_000,
        batchSize: 1000,
    };

    try {
        console.log(`  Setting up ${stressScenario.entityCount} entities...`);
        const setupStart = performance.now();

        const entities: TOIMBenchEntity[] = [];
        for (let i = 0; i < stressScenario.entityCount; i++) {
            entities.push({
                id: `stress_entity${i}`,
                name: `Stress Entity ${i}`,
                category: `category${i % 10}`,
                value: Math.random() * 10000,
                active: Math.random() > 0.3,
            });
        }

        benchmark['collection'].upsertMany(entities);

        // Setup many subscribers
        const handler = () => {
            /* noop */
        };
        for (let i = 0; i < stressScenario.subscriberCount; i++) {
            const entityId = `stress_entity${i % stressScenario.entityCount}`;
            benchmark['emitter'].subscribeOnKey(entityId, handler);
        }

        benchmark['queue'].flush();
        const setupTime = performance.now() - setupStart;

        console.log(`  ✅ Setup completed in ${setupTime.toFixed(2)}ms`);
        console.log(
            `  Starting stress test with ${stressScenario.updateCount} updates...`
        );

        const stressStart = performance.now();
        let processedUpdates = 0;

        // Perform massive number of updates
        const updatePromises: Promise<void>[] = [];
        const batchSize = 10000;

        for (
            let batch = 0;
            batch < stressScenario.updateCount;
            batch += batchSize
        ) {
            const promise = new Promise<void>(resolve => {
                setTimeout(() => {
                    const batchEnd = Math.min(
                        batch + batchSize,
                        stressScenario.updateCount
                    );

                    for (let i = batch; i < batchEnd; i++) {
                        const entityIndex = Math.floor(
                            Math.random() * stressScenario.entityCount
                        );
                        const entity = entities[entityIndex];

                        benchmark['collection'].upsertOne({
                            ...entity,
                            value: entity.value + Math.random() * 100,
                            active: Math.random() > 0.5,
                        });

                        processedUpdates++;
                    }

                    benchmark['queue'].flush();

                    if (processedUpdates % 50000 === 0) {
                        console.log(
                            `    Processed ${processedUpdates} updates...`
                        );
                    }

                    resolve();
                }, 0);
            });

            updatePromises.push(promise);
        }

        await Promise.all(updatePromises);

        const stressTime = performance.now() - stressStart;
        const updatesPerSecond =
            stressScenario.updateCount / (stressTime / 1000);

        console.log(`  ✅ Stress test completed!`);
        console.log(`    Total time: ${stressTime.toFixed(2)}ms`);
        console.log(`    Updates per second: ${updatesPerSecond.toFixed(0)}`);
        console.log(
            `    Avg time per update: ${(stressTime / stressScenario.updateCount).toFixed(4)}ms`
        );

        const metrics = benchmark['emitter'].getMetrics();
        console.log(
            `    Final metrics: ${metrics.totalKeys} keys, ${metrics.totalHandlers} handlers`
        );
    } catch (error) {
        console.error(`  ❌ Stress test failed:`, error);
    } finally {
        benchmark.cleanup();
    }
}

// Import index benchmarks
import { runAllIndexBenchmarks } from './index.bench';

// Main benchmark runner
export async function runAllBenchmarks(): Promise<void> {
    console.log('🎯 OIM Database Performance Benchmarks\n');
    console.log('='.repeat(50) + '\n');

    try {
        console.log('📊 COLLECTION BENCHMARKS\n');
        await runBenchmarkSuite();
        console.log('='.repeat(50) + '\n');

        await runMemoryLeakTest();
        console.log('='.repeat(50) + '\n');

        await runStressBenchmark();
        console.log('='.repeat(50) + '\n');

        console.log('📊 INDEX BENCHMARKS\n');
        await runAllIndexBenchmarks();
        console.log('='.repeat(50) + '\n');

        console.log('🎉 All benchmarks completed successfully!');
    } catch (error) {
        console.error('❌ Benchmark suite failed:', error);
        process.exit(1);
    }
}

// Export for use in scripts
export { OIMPerformanceBenchmark, TOIMBenchResult, TOIMBenchScenario };
