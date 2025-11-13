import { OIMIndexManualSetBased } from '../src/core/OIMIndexManualSetBased';
import { OIMIndexManualArrayBased } from '../src/core/OIMIndexManualArrayBased';
import { OIMIndexComparatorFactory } from '../src/core/OIMIndexComparatorFactory';
import { OIMUpdateEventCoalescerIndex } from '../src/core/OIMUpdateEventCoalescerIndex';
import { OIMUpdateEventEmitter } from '../src/core/OIMUpdateEventEmitter';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMEventQueueSchedulerImmediate } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerImmediate';

interface TOIMIndexBenchResult {
    name: string;
    totalTime: number;
    avgTimePerOp: number;
    opsPerSecond: number;
    memoryUsage?: number;
}

interface TOIMIndexBenchScenario {
    name: string;
    keyCount: number;
    pksPerKey: number;
    operationCount: number;
    subscriberCount: number;
}

type TOIMIndexType = 'SetBased' | 'ArrayBased';

class OIMIndexPerformanceBenchmark {
    private indexSetBased!: OIMIndexManualSetBased<string, number>;
    private indexArrayBased!: OIMIndexManualArrayBased<string, number>;
    private coalescer!: OIMUpdateEventCoalescerIndex<string>;
    private queue!: OIMEventQueue;
    private emitter!: OIMUpdateEventEmitter<string>;
    private scheduler!: OIMEventQueueSchedulerImmediate;

    public setupComponents(
        indexType: TOIMIndexType,
        useComparator: boolean = false
    ): void {
        if (indexType === 'SetBased') {
            this.indexSetBased = new OIMIndexManualSetBased<string, number>(
                useComparator
                    ? {
                          comparePks:
                              OIMIndexComparatorFactory.createElementWiseComparator<number>(),
                      }
                    : {}
            );
        } else {
            this.indexArrayBased = new OIMIndexManualArrayBased<string, number>(
                useComparator
                    ? {
                          comparePks:
                              OIMIndexComparatorFactory.createElementWiseComparator<number>(),
                      }
                    : {}
            );
        }

        const index =
            indexType === 'SetBased'
                ? this.indexSetBased
                : this.indexArrayBased;

        this.coalescer = new OIMUpdateEventCoalescerIndex(index.emitter);
        this.scheduler = new OIMEventQueueSchedulerImmediate();
        this.queue = new OIMEventQueue({ scheduler: this.scheduler });
        this.emitter = new OIMUpdateEventEmitter({
            coalescer: this.coalescer,
            queue: this.queue,
        });
    }

    public getIndex(indexType: TOIMIndexType) {
        return indexType === 'SetBased'
            ? this.indexSetBased
            : this.indexArrayBased;
    }

    public generateTestData(keyCount: number, pksPerKey: number) {
        const data: Array<{ key: string; pks: number[] }> = [];

        for (let i = 0; i < keyCount; i++) {
            const key = `key${i}`;
            const pks = Array.from(
                { length: pksPerKey },
                (_, j) => i * 1000 + j
            );
            data.push({ key, pks });
        }

        return data;
    }

    public setupSubscribers(count: number, keyCount: number): void {
        const handler = () => {
            /* noop */
        };

        for (let i = 0; i < count; i++) {
            const keyIndex = i % keyCount;
            this.emitter.subscribeOnKey(`key${keyIndex}`, handler);
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

    public async benchmarkSetOperations(
        scenario: TOIMIndexBenchScenario,
        indexType: TOIMIndexType,
        useComparator: boolean = false
    ): Promise<TOIMIndexBenchResult> {
        this.setupComponents(indexType, useComparator);
        const testData = this.generateTestData(
            scenario.keyCount,
            scenario.pksPerKey
        );
        this.setupSubscribers(scenario.subscriberCount, scenario.keyCount);

        const memoryBefore = this.getMemoryUsage();
        const index = this.getIndex(indexType);

        const { time } = this.measureTime(() => {
            for (let i = 0; i < scenario.operationCount; i++) {
                const dataIndex = i % testData.length;
                const { key, pks } = testData[dataIndex];
                index.setPks(key, pks);
            }

            this.queue.flush();
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: `${scenario.name} - ${indexType}${useComparator ? ' (with comparator)' : ''}`,
            totalTime: time,
            avgTimePerOp: time / scenario.operationCount,
            opsPerSecond: scenario.operationCount / (time / 1000),
            memoryUsage: memoryAfter - memoryBefore,
        };
    }

    public async benchmarkAddOperations(
        scenario: TOIMIndexBenchScenario,
        indexType: TOIMIndexType
    ): Promise<TOIMIndexBenchResult> {
        // Only for SetBased - ArrayBased doesn't use addPks
        if (indexType === 'ArrayBased') {
            throw new Error('Add operations not supported for ArrayBased');
        }

        this.setupComponents(indexType);
        this.setupSubscribers(scenario.subscriberCount, scenario.keyCount);
        const index = this.indexSetBased;

        // Pre-populate with initial data
        for (let i = 0; i < scenario.keyCount; i++) {
            index.setPks(`key${i}`, [i * 1000]);
        }

        const memoryBefore = this.getMemoryUsage();

        const { time } = this.measureTime(() => {
            for (let i = 0; i < scenario.operationCount; i++) {
                const keyIndex = i % scenario.keyCount;
                const newPk = 1000000 + i; // Unique PK
                index.addPks(`key${keyIndex}`, [newPk]);
            }

            this.queue.flush();
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: `${scenario.name} - ${indexType} - Add Operations`,
            totalTime: time,
            avgTimePerOp: time / scenario.operationCount,
            opsPerSecond: scenario.operationCount / (time / 1000),
            memoryUsage: memoryAfter - memoryBefore,
        };
    }

    public async benchmarkRemoveOperations(
        scenario: TOIMIndexBenchScenario,
        indexType: TOIMIndexType
    ): Promise<TOIMIndexBenchResult> {
        // Only for SetBased - ArrayBased doesn't use removePks
        if (indexType === 'ArrayBased') {
            throw new Error('Remove operations not supported for ArrayBased');
        }

        this.setupComponents(indexType);
        this.setupSubscribers(scenario.subscriberCount, scenario.keyCount);
        const index = this.indexSetBased;

        // Pre-populate with data to remove
        const testData = this.generateTestData(
            scenario.keyCount,
            scenario.pksPerKey
        );
        testData.forEach(({ key, pks }) => {
            index.setPks(key, pks);
        });

        const memoryBefore = this.getMemoryUsage();

        const { time } = this.measureTime(() => {
            for (let i = 0; i < scenario.operationCount; i++) {
                const keyIndex = i % scenario.keyCount;
                const pkToRemove =
                    (i % scenario.pksPerKey) + keyIndex * 1000;
                index.removePks(`key${keyIndex}`, [pkToRemove]);
            }

            this.queue.flush();
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: `${scenario.name} - ${indexType} - Remove Operations`,
            totalTime: time,
            avgTimePerOp: time / scenario.operationCount,
            opsPerSecond: scenario.operationCount / (time / 1000),
            memoryUsage: memoryAfter - memoryBefore,
        };
    }

    public cleanup(): void {
        this.emitter?.destroy();
        this.coalescer?.destroy();
        this.queue?.destroy();
        this.indexSetBased?.destroy();
        this.indexArrayBased?.destroy();
    }
}

// Benchmark scenarios
export const INDEX_BENCHMARK_SCENARIOS: Record<string, TOIMIndexBenchScenario> =
    {
        small: {
            name: 'Small Scale',
            keyCount: 100,
            pksPerKey: 50,
            operationCount: 5_000,
            subscriberCount: 200,
        },
        medium: {
            name: 'Medium Scale',
            keyCount: 1_000,
            pksPerKey: 100,
            operationCount: 50_000,
            subscriberCount: 2_000,
        },
        large: {
            name: 'Large Scale',
            keyCount: 10_000,
            pksPerKey: 200,
            operationCount: 100_000,
            subscriberCount: 20_000,
        },
        key_heavy: {
            name: 'Key Heavy',
            keyCount: 50_000,
            pksPerKey: 10,
            operationCount: 100_000,
            subscriberCount: 10_000,
        },
        pk_heavy: {
            name: 'PK Heavy',
            keyCount: 100,
            pksPerKey: 5_000,
            operationCount: 10_000,
            subscriberCount: 500,
        },
    };

export async function runIndexBenchmarkSuite(): Promise<void> {
    console.log('🚀 Starting OIM Index Performance Benchmarks\n');
    console.log('Comparing SetBased vs ArrayBased indexes\n');

    const results: Array<{
        scenario: string;
        type: TOIMIndexType;
        operation: string;
        result: TOIMIndexBenchResult;
    }> = [];

    for (const [scenarioKey, scenario] of Object.entries(
        INDEX_BENCHMARK_SCENARIOS
    )) {
        console.log(`📊 Running ${scenario.name} benchmarks...`);

        try {
            // Set operations benchmark - SetBased
            const setBenchmarkSet = new OIMIndexPerformanceBenchmark();
            const setResultSet = await setBenchmarkSet.benchmarkSetOperations(
                scenario,
                'SetBased'
            );
            console.log(
                `  ✅ SetBased Set Ops: ${setResultSet.opsPerSecond.toFixed(0)} ops/sec (${setResultSet.totalTime.toFixed(2)}ms total)`
            );
            results.push({
                scenario: scenarioKey,
                type: 'SetBased',
                operation: 'set',
                result: setResultSet,
            });
            setBenchmarkSet.cleanup();

            // Set operations benchmark - ArrayBased
            const setBenchmarkArray = new OIMIndexPerformanceBenchmark();
            const setResultArray =
                await setBenchmarkArray.benchmarkSetOperations(
                    scenario,
                    'ArrayBased'
                );
            console.log(
                `  ✅ ArrayBased Set Ops: ${setResultArray.opsPerSecond.toFixed(0)} ops/sec (${setResultArray.totalTime.toFixed(2)}ms total)`
            );
            results.push({
                scenario: scenarioKey,
                type: 'ArrayBased',
                operation: 'set',
                result: setResultArray,
            });
            setBenchmarkArray.cleanup();

            // Comparison
            const speedup =
                setResultArray.opsPerSecond / setResultSet.opsPerSecond;
            console.log(
                `  📈 Speedup: ${speedup > 1 ? 'ArrayBased' : 'SetBased'} is ${Math.abs(speedup - 1).toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'}\n`
            );

            // Set operations with comparator - SetBased
            const setComparatorBenchmarkSet =
                new OIMIndexPerformanceBenchmark();
            const setComparatorResultSet =
                await setComparatorBenchmarkSet.benchmarkSetOperations(
                    scenario,
                    'SetBased',
                    true
                );
            console.log(
                `  ✅ SetBased Set Ops (comparator): ${setComparatorResultSet.opsPerSecond.toFixed(0)} ops/sec (${setComparatorResultSet.totalTime.toFixed(2)}ms total)`
            );
            results.push({
                scenario: scenarioKey,
                type: 'SetBased',
                operation: 'set-comparator',
                result: setComparatorResultSet,
            });
            setComparatorBenchmarkSet.cleanup();

            // Set operations with comparator - ArrayBased
            const setComparatorBenchmarkArray =
                new OIMIndexPerformanceBenchmark();
            const setComparatorResultArray =
                await setComparatorBenchmarkArray.benchmarkSetOperations(
                    scenario,
                    'ArrayBased',
                    true
                );
            console.log(
                `  ✅ ArrayBased Set Ops (comparator): ${setComparatorResultArray.opsPerSecond.toFixed(0)} ops/sec (${setComparatorResultArray.totalTime.toFixed(2)}ms total)`
            );
            results.push({
                scenario: scenarioKey,
                type: 'ArrayBased',
                operation: 'set-comparator',
                result: setComparatorResultArray,
            });
            setComparatorBenchmarkArray.cleanup();

            // Add operations benchmark - SetBased only
            const addBenchmark = new OIMIndexPerformanceBenchmark();
            const addResult = await addBenchmark.benchmarkAddOperations(
                scenario,
                'SetBased'
            );
            console.log(
                `  ✅ SetBased Add Ops: ${addResult.opsPerSecond.toFixed(0)} ops/sec (${addResult.totalTime.toFixed(2)}ms total)`
            );
            results.push({
                scenario: scenarioKey,
                type: 'SetBased',
                operation: 'add',
                result: addResult,
            });
            addBenchmark.cleanup();

            // Remove operations benchmark - SetBased only
            const removeBenchmark = new OIMIndexPerformanceBenchmark();
            const removeResult = await removeBenchmark.benchmarkRemoveOperations(
                scenario,
                'SetBased'
            );
            console.log(
                `  ✅ SetBased Remove Ops: ${removeResult.opsPerSecond.toFixed(0)} ops/sec (${removeResult.totalTime.toFixed(2)}ms total)`
            );
            results.push({
                scenario: scenarioKey,
                type: 'SetBased',
                operation: 'remove',
                result: removeResult,
            });
            removeBenchmark.cleanup();

            console.log(
                `  💾 Memory Usage (SetBased): ${(setResultSet.memoryUsage || 0).toFixed(2)}MB`
            );
            console.log(
                `  💾 Memory Usage (ArrayBased): ${(setResultArray.memoryUsage || 0).toFixed(2)}MB\n`
            );
        } catch (error) {
            console.error(`  ❌ Error in ${scenario.name}:`, error);
        }
    }

    // Print summary comparison
    console.log('\n📊 Summary Comparison:\n');
    console.log('Set Operations (no comparator):');
    for (const [scenarioKey, scenario] of Object.entries(
        INDEX_BENCHMARK_SCENARIOS
    )) {
        const setBased = results.find(
            (r) =>
                r.scenario === scenarioKey &&
                r.type === 'SetBased' &&
                r.operation === 'set'
        );
        const arrayBased = results.find(
            (r) =>
                r.scenario === scenarioKey &&
                r.type === 'ArrayBased' &&
                r.operation === 'set'
        );
        if (setBased && arrayBased) {
            const ratio = arrayBased.result.opsPerSecond / setBased.result.opsPerSecond;
            console.log(
                `  ${scenario.name}: ArrayBased is ${ratio.toFixed(2)}x ${ratio > 1 ? 'faster' : 'slower'} than SetBased`
            );
        }
    }

    return;
}

export async function runComparatorBenchmark(): Promise<void> {
    console.log('🔍 Comparator Performance Benchmark\n');

    const scenarios = [
        { name: 'Small Arrays', arraySize: 10, iterations: 100_000 },
        { name: 'Medium Arrays', arraySize: 100, iterations: 10_000 },
        { name: 'Large Arrays', arraySize: 1_000, iterations: 1_000 },
        { name: 'Very Large Arrays', arraySize: 10_000, iterations: 100 },
    ];

    for (const scenario of scenarios) {
        console.log(`📊 ${scenario.name} (${scenario.arraySize} elements):`);

        const arr1 = Array.from({ length: scenario.arraySize }, (_, i) => i);
        const arr2 = Array.from({ length: scenario.arraySize }, (_, i) => i); // Same content
        const arr3 = Array.from(
            { length: scenario.arraySize },
            (_, i) => scenario.arraySize - 1 - i
        ); // Reverse

        // Element-wise comparator
        const elementWise =
            OIMIndexComparatorFactory.createElementWiseComparator<number>();
        const elementWiseTime = measureComparatorTime(
            elementWise,
            arr1,
            arr2,
            scenario.iterations
        );
        console.log(
            `  Element-wise: ${(scenario.iterations / (elementWiseTime / 1000)).toFixed(0)} ops/sec`
        );

        // Set-based comparator
        const setBased =
            OIMIndexComparatorFactory.createSetBasedComparator<number>();
        const setBasedTime = measureComparatorTime(
            setBased,
            arr1,
            arr3,
            scenario.iterations
        );
        console.log(
            `  Set-based: ${(scenario.iterations / (setBasedTime / 1000)).toFixed(0)} ops/sec`
        );

        // Shallow comparator
        const shallow =
            OIMIndexComparatorFactory.createShallowComparator<number>();
        const shallowTime = measureComparatorTime(
            shallow,
            arr1,
            arr1,
            scenario.iterations
        );
        console.log(
            `  Shallow: ${(scenario.iterations / (shallowTime / 1000)).toFixed(0)} ops/sec`
        );

        console.log();
    }
}

function measureComparatorTime(
    comparator: (a: readonly number[], b: readonly number[]) => boolean,
    arr1: readonly number[],
    arr2: readonly number[],
    iterations: number
): number {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        comparator(arr1, arr2);
    }
    return performance.now() - start;
}

export async function runIndexStressBenchmark(): Promise<void> {
    console.log('💪 Index Stress Test\n');

    // Test both types
    for (const indexType of ['SetBased', 'ArrayBased'] as TOIMIndexType[]) {
        console.log(`\n📊 ${indexType} Stress Test:`);
        const benchmark = new OIMIndexPerformanceBenchmark();
        const stressScenario: TOIMIndexBenchScenario = {
            name: 'Stress Test',
            keyCount: 10_000,
            pksPerKey: 100,
            operationCount: 1_000_000,
            subscriberCount: 5_000,
        };

        try {
            console.log(
                `  Setting up ${stressScenario.keyCount} keys with ${stressScenario.pksPerKey} PKs each...`
            );

            benchmark.setupComponents(indexType);
            const testData = benchmark.generateTestData(
                stressScenario.keyCount,
                stressScenario.pksPerKey
            );
            const index = benchmark.getIndex(indexType);

            // Initial population
            const setupStart = performance.now();
            testData.forEach(({ key, pks }) => {
                index.setPks(key, pks);
            });
            const setupTime = performance.now() - setupStart;

            console.log(`  ✅ Setup completed in ${setupTime.toFixed(2)}ms`);

            // Setup subscribers
            benchmark.setupSubscribers(
                stressScenario.subscriberCount,
                stressScenario.keyCount
            );

            console.log(
                `  Starting stress test with ${stressScenario.operationCount} operations...`
            );

            const stressStart = performance.now();
            let processedOps = 0;

            // Only set operations for ArrayBased, mixed for SetBased
            for (let i = 0; i < stressScenario.operationCount; i++) {
                const keyIndex = Math.floor(
                    Math.random() * stressScenario.keyCount
                );
                const key = `key${keyIndex}`;

                if (indexType === 'SetBased') {
                    const operation = Math.random();

                    if (operation < 0.5) {
                        // Set operation (50%)
                        const newPks = Array.from(
                            { length: Math.floor(Math.random() * 50) + 1 },
                            (_, j) =>
                                keyIndex * 1000 +
                                j +
                                Math.floor(Math.random() * 100)
                        );
                        index.setPks(key, newPks);
                    } else if (operation < 0.8) {
                        // Add operation (30%)
                        const newPk =
                            keyIndex * 1000 +
                            Math.floor(Math.random() * 10000);
                        index.addPks(key, [newPk]);
                    } else {
                        // Remove operation (20%)
                        const existingPks = index.getPksByKey(key);
                        if (existingPks.size > 0) {
                            const pkToRemove = Array.from(existingPks)[
                                Math.floor(Math.random() * existingPks.size)
                            ];
                            index.removePks(key, [pkToRemove]);
                        }
                    }
                } else {
                    // ArrayBased - only set operations
                    const newPks = Array.from(
                        { length: Math.floor(Math.random() * 50) + 1 },
                        (_, j) =>
                            keyIndex * 1000 +
                            j +
                            Math.floor(Math.random() * 100)
                    );
                    index.setPks(key, newPks);
                }

                processedOps++;

                if (processedOps % 100_000 === 0) {
                    console.log(`    Processed ${processedOps} operations...`);
                    benchmark.queue?.flush();
                }
            }

            // Final flush
            benchmark.queue?.flush();
            const stressTime = performance.now() - stressStart;

            console.log(`  ✅ Stress test completed!`);
            console.log(`    Total time: ${stressTime.toFixed(2)}ms`);
            console.log(
                `    Operations per second: ${(stressScenario.operationCount / (stressTime / 1000)).toFixed(0)}`
            );
            console.log(
                `    Avg time per operation: ${(stressTime / stressScenario.operationCount).toFixed(4)}ms`
            );

            const metrics = index.getMetrics();
            console.log(
                `    Final index metrics: ${metrics.totalKeys} keys, ${metrics.totalPks} PKs`
            );

            const emitterMetrics = benchmark.emitter?.getMetrics();
            console.log(
                `    Final emitter metrics: ${emitterMetrics.totalKeys} subscribed keys, ${emitterMetrics.totalHandlers} handlers`
            );
        } catch (error) {
            console.error(`  ❌ Stress test failed:`, error);
        } finally {
            benchmark.cleanup();
        }
    }
}

export async function runAllIndexBenchmarks(): Promise<void> {
    console.log('🎯 OIM Index Performance Benchmarks\n');
    console.log('='.repeat(50) + '\n');

    try {
        await runIndexBenchmarkSuite();
        console.log('='.repeat(50) + '\n');

        await runComparatorBenchmark();
        console.log('='.repeat(50) + '\n');

        await runIndexStressBenchmark();
        console.log('='.repeat(50) + '\n');

        console.log('🎉 All index benchmarks completed successfully!');
    } catch (error) {
        console.error('❌ Index benchmark suite failed:', error);
        process.exit(1);
    }
}

// Export for use in scripts
export {
    OIMIndexPerformanceBenchmark,
    TOIMIndexBenchResult,
    TOIMIndexBenchScenario,
};

// Run benchmarks if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllIndexBenchmarks();
}
