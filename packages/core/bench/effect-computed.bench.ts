import {
    OIMComputed,
    OIMEffect,
    OIMComputativeRuntime,
    OIMEffectDependencyComputed,
    OIMEffectDependencyKeyedObject,
    OIMEventQueue,
    OIMReactiveObject,
} from '../src';

interface TOIMBenchResult {
    name: string;
    totalTime: number;
    avgTimePerOp: number;
    opsPerSecond: number;
}

type TObjectKey = 'a' | 'b';

function measureTime(operation: () => void): number {
    const start = performance.now();
    operation();
    return performance.now() - start;
}

function formatResult(
    name: string,
    ops: number,
    time: number
): TOIMBenchResult {
    return {
        name,
        totalTime: time,
        avgTimePerOp: time / ops,
        opsPerSecond: ops / (time / 1000),
    };
}

function setupObject(queue: OIMEventQueue) {
    const obj = new OIMReactiveObject<TObjectKey, number>(queue);
    obj.merge({ a: 1, b: 2 });
    return obj;
}

function setupComputedChain(
    runtime: OIMComputativeRuntime,
    obj: OIMReactiveObject<TObjectKey, number>,
    depth: number
) {
    const computeds: Array<OIMComputed<number>> = [];

    const A = new OIMComputed<number>(runtime, {
        compute: () => (obj.get('a') ?? 0) * 2,
        deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
    });
    computeds.push(A);

    let prev = A;
    for (let i = 1; i < depth; i++) {
        const prevComputed = prev;
        const next = new OIMComputed<number>(runtime, {
            compute: () => prevComputed.get() + i,
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: prevComputed.emitter,
                    updateEventEmitter: prevComputed.updateEventEmitter,
                }),
            ],
        });
        computeds.push(next);
        prev = next;
    }

    return { computeds, leaf: prev };
}

function setupComputedDiamond(
    runtime: OIMComputativeRuntime,
    obj: OIMReactiveObject<TObjectKey, number>
) {
    // A depends on obj.a
    const A = new OIMComputed<number>(runtime, {
        compute: () => (obj.get('a') ?? 0) * 2,
        deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
    });
    // B depends on A and obj.b
    const B = new OIMComputed<number>(runtime, {
        compute: () => A.get() + (obj.get('b') ?? 0),
        deps: [
            new OIMEffectDependencyComputed({
                emitter: A.emitter,
                updateEventEmitter: A.updateEventEmitter,
            }),
            new OIMEffectDependencyKeyedObject(obj, 'b'),
        ],
    });
    // C depends on B
    const C = new OIMComputed<number>(runtime, {
        compute: () => B.get() * 3,
        deps: [
            new OIMEffectDependencyComputed({
                emitter: B.emitter,
                updateEventEmitter: B.updateEventEmitter,
            }),
        ],
    });
    // D depends on A and C (diamond join)
    const D = new OIMComputed<number>(runtime, {
        compute: () => A.get() + C.get(),
        deps: [
            new OIMEffectDependencyComputed({
                emitter: A.emitter,
                updateEventEmitter: A.updateEventEmitter,
            }),
            new OIMEffectDependencyComputed({
                emitter: C.emitter,
                updateEventEmitter: C.updateEventEmitter,
            }),
        ],
    });

    return { A, B, C, D };
}

export async function runEffectComputedBenchmarks(): Promise<void> {
    console.log('📊 EFFECTS/COMPUTED BENCHMARKS\n');
    console.log('='.repeat(50) + '\n');

    // 1) Computed recompute throughput (single computed)
    {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputativeRuntime(queue);
        const obj = setupObject(queue);
        const computed = new OIMComputed<number>(runtime, {
            compute: () => (obj.get('a') ?? 0) * 2,
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
        });

        const iterations = 50_000;
        // Warmup
        obj.setProperty('a', 2);
        queue.flush();

        const time = measureTime(() => {
            for (let i = 0; i < iterations; i++) {
                obj.setProperty('a', i);
                queue.flush(); // recompute
            }
        });

        const r = formatResult('Computed recompute (single)', iterations, time);
        console.log(
            `  ✅ ${r.name}: ${r.opsPerSecond.toFixed(0)} flushes/sec (${r.totalTime.toFixed(2)}ms total)`
        );

        computed.destroy();
        obj.destroy();
        queue.destroy();
        console.log();
    }

    // 2) Computed subscriber delivery cost (2 flushes per update)
    {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputativeRuntime(queue);
        const obj = setupObject(queue);
        const computed = new OIMComputed<number>(runtime, {
            compute: () => (obj.get('a') ?? 0) * 2,
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
        });

        let calls = 0;
        computed.updateEventEmitter.subscribeOnKey('value', () => {
            calls++;
        });

        const iterations = 20_000;
        const time = measureTime(() => {
            for (let i = 0; i < iterations; i++) {
                obj.setProperty('a', i);
                queue.flush(); // recompute + schedule delivery
                queue.flush(); // deliver computed subscriber
            }
        });

        const r = formatResult(
            'Computed subscriber delivery (2 flushes/update)',
            iterations,
            time
        );
        console.log(
            `  ✅ ${r.name}: ${r.opsPerSecond.toFixed(0)} updates/sec (${r.totalTime.toFixed(2)}ms total), calls=${calls}`
        );

        computed.destroy();
        obj.destroy();
        queue.destroy();
        console.log();
    }

    // 3) Chain scaling (depth 10 / 50)
    for (const depth of [10, 50]) {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputativeRuntime(queue);
        const obj = setupObject(queue);
        const { computeds, leaf } = setupComputedChain(runtime, obj, depth);

        // Attach an effect to leaf (simulate integration/UI)
        let effectCalls = 0;
        const effect = new OIMEffect(runtime, {
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: leaf.emitter,
                    updateEventEmitter: leaf.updateEventEmitter,
                }),
            ],
            run: () => {
                effectCalls++;
            },
        });

        const iterations = 5_000;
        const time = measureTime(() => {
            for (let i = 0; i < iterations; i++) {
                obj.setProperty('a', i);
                queue.flush(); // full drain (computed + effect delivery)
            }
        });

        const r = formatResult(
            `Computed chain depth=${depth} (2 flushes/update)`,
            iterations,
            time
        );
        console.log(
            `  ✅ ${r.name}: ${r.opsPerSecond.toFixed(0)} updates/sec (${r.totalTime.toFixed(2)}ms total), effectCalls=${effectCalls}`
        );

        effect.destroy();
        for (const c of computeds.reverse()) c.destroy();
        obj.destroy();
        queue.destroy();
        console.log();
    }

    // 4) Diamond graph (A -> B -> C, A+C -> D), plus effect on D
    {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputativeRuntime(queue);
        const obj = setupObject(queue);
        const { A, B, C, D } = setupComputedDiamond(runtime, obj);

        let effectCalls = 0;
        const effect = new OIMEffect(runtime, {
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: D.emitter,
                    updateEventEmitter: D.updateEventEmitter,
                }),
            ],
            run: () => {
                effectCalls++;
            },
        });

        const iterations = 10_000;
        const time = measureTime(() => {
            for (let i = 0; i < iterations; i++) {
                obj.setProperty('a', i);
                obj.setProperty('b', i + 1);
                queue.flush(); // full drain (computed + effect delivery)
            }
        });

        const r = formatResult(
            'Computed diamond graph (2 flushes/update)',
            iterations,
            time
        );
        console.log(
            `  ✅ ${r.name}: ${r.opsPerSecond.toFixed(0)} updates/sec (${r.totalTime.toFixed(2)}ms total), effectCalls=${effectCalls}`
        );

        effect.destroy();
        D.destroy();
        C.destroy();
        B.destroy();
        A.destroy();
        obj.destroy();
        queue.destroy();
        console.log();
    }
}

// Run benchmarks if this file is executed directly
const __oimdb_isDirectRun_effectComputed =
    typeof process !== 'undefined' &&
    typeof process.argv?.[1] === 'string' &&
    /effect-computed\.bench\.(ts|js|mjs|cjs)$/.test(process.argv[1]);
if (__oimdb_isDirectRun_effectComputed) {
    void runEffectComputedBenchmarks();
}
