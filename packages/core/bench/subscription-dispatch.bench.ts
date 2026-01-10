import { OIMUpdateEventEmitter } from '../src/core/OIMUpdateEventEmitter';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { TOIMPk } from '../src/type/TOIMPk';

interface TOIMSubscriptionDispatchBenchResult {
    name: string;
    totalTime: number;
    avgTimePerOp: number;
    opsPerSecond: number;
}

interface TOIMSubscriptionDispatchScenario {
    name: string;
    keysCount: number;
    handlersPerKey: number;
    updatedKeysPerBatch: number;
    batches: number;
    /**
     * If specified, only this many keys will have any subscriptions.
     * Useful to benchmark sparse subscriptions with a large key space.
     */
    subscribedKeysCount?: number;
    /**
     * If specified, all subscriptions are attached to this single key ("hot key").
     * Useful to benchmark worst-case fanout on one key.
     */
    hotKey?: string;
}

class OIMSubscriptionDispatchBenchmark {
    private readonly queue = new OIMEventQueue();
    private readonly emitter = new OIMUpdateEventEmitter<string>(this.queue);

    private readonly keys: string[] = [];
    private readonly handlers: Array<() => void> = [];

    public setup(
        keysCount: number,
        handlersPerKey: number,
        opts?: { subscribedKeysCount?: number; hotKey?: string }
    ): void {
        this.keys.length = 0;
        for (let i = 0; i < keysCount; i++) this.keys.push(`k${i}`);

        this.handlers.length = 0;
        for (let i = 0; i < handlersPerKey; i++) this.handlers.push(() => {});

        const hotKey = opts?.hotKey;
        if (hotKey) {
            for (const handler of this.handlers) {
                this.emitter.subscribeOnKey(hotKey, handler);
            }
            return;
        }

        const subscribedKeysCount = opts?.subscribedKeysCount ?? keysCount;
        const subscribedKeys =
            subscribedKeysCount >= keysCount
                ? this.keys
                : this.keys.slice(0, Math.max(0, subscribedKeysCount));

        for (const key of subscribedKeys) {
            for (const handler of this.handlers) {
                this.emitter.subscribeOnKey(key, handler);
            }
        }
    }

    private measureTime(operation: () => void): number {
        const start = performance.now();
        operation();
        return performance.now() - start;
    }

    public benchmarkSubscribeOnKey(
        keysCount: number
    ): TOIMSubscriptionDispatchBenchResult {
        const bench = new OIMSubscriptionDispatchBenchmark();
        const handler = () => {};
        const keys = Array.from({ length: keysCount }, (_, i) => `k${i}`);

        const time = bench.measureTime(() => {
            for (const key of keys) {
                bench.emitter.subscribeOnKey(key, handler);
            }
        });

        bench.cleanup();
        return {
            name: `subscribeOnKey (${keysCount.toLocaleString()} keys)`,
            totalTime: time,
            avgTimePerOp: time / keysCount,
            opsPerSecond: keysCount / (time / 1000),
        };
    }

    public benchmarkSubscribeOnKeys(
        keysCount: number
    ): TOIMSubscriptionDispatchBenchResult {
        const bench = new OIMSubscriptionDispatchBenchmark();
        const handler = () => {};
        const keys = Array.from({ length: keysCount }, (_, i) => `k${i}`);

        const time = bench.measureTime(() => {
            bench.emitter.subscribeOnKeys(keys, handler);
        });

        bench.cleanup();
        return {
            name: `subscribeOnKeys (${keysCount.toLocaleString()} keys in one call)`,
            totalTime: time,
            avgTimePerOp: time / keysCount,
            opsPerSecond: keysCount / (time / 1000),
        };
    }

    public benchmarkUnsubscribe(
        keysCount: number
    ): TOIMSubscriptionDispatchBenchResult {
        const bench = new OIMSubscriptionDispatchBenchmark();
        const handler = () => {};
        const unsubscribes: Array<() => void> = [];

        for (let i = 0; i < keysCount; i++) {
            unsubscribes.push(bench.emitter.subscribeOnKey(`k${i}`, handler));
        }

        const time = bench.measureTime(() => {
            for (const unsub of unsubscribes) unsub();
        });

        bench.cleanup();
        return {
            name: `unsubscribe (${keysCount.toLocaleString()} keys)`,
            totalTime: time,
            avgTimePerOp: time / keysCount,
            opsPerSecond: keysCount / (time / 1000),
        };
    }

    public benchmarkDispatch(
        scenario: TOIMSubscriptionDispatchScenario
    ): TOIMSubscriptionDispatchBenchResult {
        this.setup(scenario.keysCount, scenario.handlersPerKey, {
            subscribedKeysCount: scenario.subscribedKeysCount,
            hotKey: scenario.hotKey,
        });

        const updatedKeys = scenario.hotKey
            ? [scenario.hotKey]
            : this.keys.slice(0, scenario.updatedKeysPerBatch);

        // Warmup (JIT)
        for (let i = 0; i < 10; i++) {
            this.emitter.markUpdatedKeys(updatedKeys);
            this.queue.flush();
        }

        const totalOps = scenario.batches;
        const time = this.measureTime(() => {
            for (let i = 0; i < scenario.batches; i++) {
                this.emitter.markUpdatedKeys(updatedKeys);
                this.queue.flush();
            }
        });

        return {
            name: `${scenario.name} (keys=${scenario.keysCount.toLocaleString()}, subscribedKeys=${(scenario.subscribedKeysCount ?? scenario.keysCount).toLocaleString()}, handlers/key=${scenario.handlersPerKey}, updated/batch=${scenario.updatedKeysPerBatch.toLocaleString()}, batches=${scenario.batches.toLocaleString()}${scenario.hotKey ? `, hotKey=${scenario.hotKey}` : ''})`,
            totalTime: time,
            avgTimePerOp: time / totalOps,
            opsPerSecond: totalOps / (time / 1000),
        };
    }

    public cleanup(): void {
        this.emitter.destroy();
        this.queue.destroy();
    }
}

const DISPATCH_SCENARIOS: TOIMSubscriptionDispatchScenario[] = [
    {
        name: 'Dispatch - few updated keys (should iterate flushingKeys)',
        keysCount: 50_000,
        handlersPerKey: 1,
        updatedKeysPerBatch: 100,
        batches: 500,
    },
    {
        name: 'Dispatch - many updated keys (should iterate keyHandlers)',
        keysCount: 50_000,
        handlersPerKey: 1,
        updatedKeysPerBatch: 30_000,
        batches: 100,
    },
    {
        name: 'Dispatch - few updated keys, multiple handlers per key',
        keysCount: 10_000,
        handlersPerKey: 5,
        updatedKeysPerBatch: 100,
        batches: 300,
    },
    {
        name: 'Dispatch - many updated keys, multiple handlers per key',
        keysCount: 10_000,
        handlersPerKey: 5,
        updatedKeysPerBatch: 8_000,
        batches: 80,
    },
    {
        name: 'Dispatch - hot key (single key, huge fanout)',
        keysCount: 100_000,
        subscribedKeysCount: 1,
        hotKey: 'hot',
        handlersPerKey: 20_000,
        updatedKeysPerBatch: 1,
        batches: 50,
    },
    {
        name: 'Dispatch - sparse subscriptions (large key space, few subscribed keys)',
        keysCount: 200_000,
        subscribedKeysCount: 1_000,
        handlersPerKey: 1,
        updatedKeysPerBatch: 50_000,
        batches: 50,
    },
];

export async function runSubscriptionDispatchBenchmarks(): Promise<void> {
    console.log('📊 SUBSCRIPTION/DISPATCH BENCHMARKS\n');
    console.log('='.repeat(50) + '\n');

    const bench = new OIMSubscriptionDispatchBenchmark();

    const subscribeResults = [
        bench.benchmarkSubscribeOnKey(10_000),
        bench.benchmarkSubscribeOnKeys(10_000),
        bench.benchmarkUnsubscribe(10_000),
    ];

    for (const r of subscribeResults) {
        console.log(
            `  ✅ ${r.name}: ${r.opsPerSecond.toFixed(0)} ops/sec (${r.totalTime.toFixed(2)}ms total)`
        );
    }

    console.log('\n');

    for (const scenario of DISPATCH_SCENARIOS) {
        const dispatchBench = new OIMSubscriptionDispatchBenchmark();
        try {
            const r = dispatchBench.benchmarkDispatch(scenario);
            console.log(
                `  ✅ ${r.name}: ${r.opsPerSecond.toFixed(0)} batches/sec (${r.totalTime.toFixed(2)}ms total)`
            );
        } finally {
            dispatchBench.cleanup();
        }
    }

    console.log('\n');
}

// Run benchmarks if this file is executed directly
const __oimdb_isDirectRun_subscriptionDispatch =
    typeof process !== 'undefined' &&
    typeof process.argv?.[1] === 'string' &&
    /subscription-dispatch\.bench\.(ts|js|mjs|cjs)$/.test(process.argv[1]);
if (__oimdb_isDirectRun_subscriptionDispatch) {
    void runSubscriptionDispatchBenchmarks();
}
