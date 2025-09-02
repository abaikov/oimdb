import { OIMIndexManual } from '../../../src/core/OIMIndexManual';
import { OIMIndexComparatorFactory } from '../../../src/core/OIMIndexComparatorFactory';
import { OIMUpdateEventCoalescerIndex } from '../../../src/core/OIMUpdateEventCoalescerIndex';
import { OIMUpdateEventEmitter } from '../../../src/core/OIMUpdateEventEmitter';
import { OIMEventQueue } from '../../../src/core/OIMEventQueue';
import { OIMEventQueueSchedulerImmediate } from '../../../src/core/event-queue-scheduler/OIMEventQueueSchedulerImmediate';

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

class OIMIndexPerformanceBenchmark {
    private index!: OIMIndexManual<string, number>;
    private coalescer!: OIMUpdateEventCoalescerIndex<string>;
    private queue!: OIMEventQueue;
    private emitter!: OIMUpdateEventEmitter<string>;
    private scheduler!: OIMEventQueueSchedulerImmediate;

    private setupComponents(useComparator: boolean = false): void {
        this.index = new OIMIndexManual<string, number>(
            useComparator
                ? {
                      comparePks:
                          OIMIndexComparatorFactory.createElementWiseComparator<number>(),
                  }
                : {}
        );

        this.coalescer = new OIMUpdateEventCoalescerIndex(this.index.emitter);
        this.scheduler = new OIMEventQueueSchedulerImmediate();
        this.queue = new OIMEventQueue({ scheduler: this.scheduler });
        this.emitter = new OIMUpdateEventEmitter({
            coalescer: this.coalescer,
            queue: this.queue,
        });
    }

    private generateTestData(keyCount: number, pksPerKey: number) {
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

    private setupSubscribers(count: number, keyCount: number): void {
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
        useComparator: boolean = false
    ): Promise<TOIMIndexBenchResult> {
        this.setupComponents(useComparator);
        const testData = this.generateTestData(
            scenario.keyCount,
            scenario.pksPerKey
        );
        this.setupSubscribers(scenario.subscriberCount, scenario.keyCount);

        const memoryBefore = this.getMemoryUsage();

        const { time } = this.measureTime(() => {
            for (let i = 0; i < scenario.operationCount; i++) {
                const dataIndex = i % testData.length;
                const { key, pks } = testData[dataIndex];
                this.index.setPks(key, pks);
            }

            this.queue.flush();
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: `${scenario.name}${useComparator ? ' (with comparator)' : ''}`,
            totalTime: time,
            avgTimePerOp: time / scenario.operationCount,
            opsPerSecond: scenario.operationCount / (time / 1000),
            memoryUsage: memoryAfter - memoryBefore,
        };
    }

    public async benchmarkAddOperations(
        scenario: TOIMIndexBenchScenario
    ): Promise<TOIMIndexBenchResult> {
        this.setupComponents();
        this.setupSubscribers(scenario.subscriberCount, scenario.keyCount);

        // Pre-populate with initial data
        for (let i = 0; i < scenario.keyCount; i++) {
            this.index.setPks(`key${i}`, [i * 1000]);
        }

        const memoryBefore = this.getMemoryUsage();

        const { time } = this.measureTime(() => {
            for (let i = 0; i < scenario.operationCount; i++) {
                const keyIndex = i % scenario.keyCount;
                const newPk = 1000000 + i; // Unique PK
                this.index.addPks(`key${keyIndex}`, [newPk]);
            }

            this.queue.flush();
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: `${scenario.name} - Add Operations`,
            totalTime: time,
            avgTimePerOp: time / scenario.operationCount,
            opsPerSecond: scenario.operationCount / (time / 1000),
            memoryUsage: memoryAfter - memoryBefore,
        };
    }

    public async benchmarkRemoveOperations(
        scenario: TOIMIndexBenchScenario
    ): Promise<TOIMIndexBenchResult> {
        this.setupComponents();
        this.setupSubscribers(scenario.subscriberCount, scenario.keyCount);

        // Pre-populate with data to remove
        const testData = this.generateTestData(
            scenario.keyCount,
            scenario.pksPerKey
        );
        testData.forEach(({ key, pks }) => {
            this.index.setPks(key, pks);
        });

        const memoryBefore = this.getMemoryUsage();

        const { time } = this.measureTime(() => {
            for (let i = 0; i < scenario.operationCount; i++) {
                const keyIndex = i % scenario.keyCount;
                const pkToRemove = (i % scenario.pksPerKey) + keyIndex * 1000;
                this.index.removePks(`key${keyIndex}`, [pkToRemove]);
            }

            this.queue.flush();
        });

        const memoryAfter = this.getMemoryUsage();

        return {
            name: `${scenario.name} - Remove Operations`,
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
        this.index?.destroy();
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

    for (const [, scenario] of Object.entries(INDEX_BENCHMARK_SCENARIOS)) {
        console.log(`📊 Running ${scenario.name} benchmarks...`);

        try {
            // Set operations benchmark
            const setBenchmark = new OIMIndexPerformanceBenchmark();
            const setResult =
                await setBenchmark.benchmarkSetOperations(scenario);
            console.log(
                `  ✅ Set Ops: ${setResult.opsPerSecond.toFixed(0)} ops/sec (${setResult.totalTime.toFixed(2)}ms total)`
            );
            setBenchmark.cleanup();

            // Set operations with comparator
            const setComparatorBenchmark = new OIMIndexPerformanceBenchmark();
            const setComparatorResult =
                await setComparatorBenchmark.benchmarkSetOperations(
                    scenario,
                    true
                );
            console.log(
                `  ✅ Set Ops (comparator): ${setComparatorResult.opsPerSecond.toFixed(0)} ops/sec (${setComparatorResult.totalTime.toFixed(2)}ms total)`
            );
            setComparatorBenchmark.cleanup();

            // Add operations benchmark
            const addBenchmark = new OIMIndexPerformanceBenchmark();
            const addResult =
                await addBenchmark.benchmarkAddOperations(scenario);
            console.log(
                `  ✅ Add Ops: ${addResult.opsPerSecond.toFixed(0)} ops/sec (${addResult.totalTime.toFixed(2)}ms total)`
            );
            addBenchmark.cleanup();

            // Remove operations benchmark
            const removeBenchmark = new OIMIndexPerformanceBenchmark();
            const removeResult =
                await removeBenchmark.benchmarkRemoveOperations(scenario);
            console.log(
                `  ✅ Remove Ops: ${removeResult.opsPerSecond.toFixed(0)} ops/sec (${removeResult.totalTime.toFixed(2)}ms total)`
            );
            removeBenchmark.cleanup();

            console.log(
                `  💾 Memory Usage: ${(setResult.memoryUsage || 0).toFixed(2)}MB\n`
            );
        } catch (error) {
            console.error(`  ❌ Error in ${scenario.name}:`, error);
        }
    }
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

        benchmark['setupComponents']();
        const testData = benchmark['generateTestData'](
            stressScenario.keyCount,
            stressScenario.pksPerKey
        );

        // Initial population
        const setupStart = performance.now();
        testData.forEach(({ key, pks }) => {
            benchmark['index'].setPks(key, pks);
        });
        const setupTime = performance.now() - setupStart;

        console.log(`  ✅ Setup completed in ${setupTime.toFixed(2)}ms`);

        // Setup subscribers
        benchmark['setupSubscribers'](
            stressScenario.subscriberCount,
            stressScenario.keyCount
        );

        console.log(
            `  Starting stress test with ${stressScenario.operationCount} operations...`
        );

        const stressStart = performance.now();
        let processedOps = 0;

        // Mixed operations
        for (let i = 0; i < stressScenario.operationCount; i++) {
            const keyIndex = Math.floor(
                Math.random() * stressScenario.keyCount
            );
            const key = `key${keyIndex}`;

            const operation = Math.random();

            if (operation < 0.5) {
                // Set operation (50%)
                const newPks = Array.from(
                    { length: Math.floor(Math.random() * 50) + 1 },
                    (_, j) =>
                        keyIndex * 1000 + j + Math.floor(Math.random() * 100)
                );
                benchmark['index'].setPks(key, newPks);
            } else if (operation < 0.8) {
                // Add operation (30%)
                const newPk =
                    keyIndex * 1000 + Math.floor(Math.random() * 10000);
                benchmark['index'].addPks(key, [newPk]);
            } else {
                // Remove operation (20%)
                const existingPks = benchmark['index'].getPks(key);
                if (existingPks.length > 0) {
                    const pkToRemove =
                        existingPks[
                            Math.floor(Math.random() * existingPks.length)
                        ];
                    benchmark['index'].removePks(key, [pkToRemove]);
                }
            }

            processedOps++;

            if (processedOps % 100_000 === 0) {
                console.log(`    Processed ${processedOps} operations...`);
                benchmark['queue'].flush();
            }
        }

        // Final flush
        benchmark['queue'].flush();
        const stressTime = performance.now() - stressStart;

        console.log(`  ✅ Stress test completed!`);
        console.log(`    Total time: ${stressTime.toFixed(2)}ms`);
        console.log(
            `    Operations per second: ${(stressScenario.operationCount / (stressTime / 1000)).toFixed(0)}`
        );
        console.log(
            `    Avg time per operation: ${(stressTime / stressScenario.operationCount).toFixed(4)}ms`
        );

        const metrics = benchmark['index'].getMetrics();
        console.log(
            `    Final index metrics: ${metrics.totalKeys} keys, ${metrics.totalPks} PKs`
        );

        const emitterMetrics = benchmark['emitter'].getMetrics();
        console.log(
            `    Final emitter metrics: ${emitterMetrics.totalKeys} subscribed keys, ${emitterMetrics.totalHandlers} handlers`
        );
    } catch (error) {
        console.error(`  ❌ Stress test failed:`, error);
    } finally {
        benchmark.cleanup();
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
