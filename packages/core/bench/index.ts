// Main benchmark runner that coordinates all benchmarks
import { runAllBenchmarks } from './collection.bench';
import { runAllIndexBenchmarks } from './index.bench';
import { runSubscriptionDispatchBenchmarks } from './subscription-dispatch.bench';
import { runEffectComputedBenchmarks } from './effect-computed.bench';

/**
 * Run all OIMDB benchmarks */
export async function runAllOIMDBBenchmarks(): Promise<void> {
    console.log('🎯 OIMDB Complete Benchmark Suite\n');
    console.log('='.repeat(60) + '\n');

    const maybeGc = () => {
        const g = globalThis as unknown as { gc?: () => void };
        if (typeof g.gc !== 'function') return;
        // Best-effort GC between suites for more stable numbers.
        g.gc();
        g.gc();
    };

    try {
        console.log('📊 COLLECTION BENCHMARKS\n');
        await runAllBenchmarks();
        maybeGc();

        console.log('='.repeat(60) + '\n');
        console.log('📊 SUBSCRIPTION/DISPATCH BENCHMARKS\n');
        await runSubscriptionDispatchBenchmarks();
        maybeGc();

        console.log('='.repeat(60) + '\n');
        console.log('📊 EFFECTS/COMPUTED BENCHMARKS\n');
        await runEffectComputedBenchmarks();
        maybeGc();

        console.log('='.repeat(60) + '\n');
        console.log('📊 INDEX BENCHMARKS\n');
        await runAllIndexBenchmarks();
        maybeGc();

        console.log('='.repeat(60) + '\n');
        console.log('🎉 All OIMDB benchmarks completed successfully!');
    } catch (error) {
        console.error('❌ Benchmark suite failed:', error);
        process.exit(1);
    }
}

// Export individual benchmark runners
export { runAllBenchmarks as runCollectionBenchmarks } from './collection.bench';
export { runAllIndexBenchmarks } from './index.bench';
export { runSubscriptionDispatchBenchmarks } from './subscription-dispatch.bench';
export { runEffectComputedBenchmarks } from './effect-computed.bench';

// Run benchmarks if this file is executed directly
const __oimdb_isDirectRun_benchIndex =
    typeof process !== 'undefined' &&
    typeof process.argv?.[1] === 'string' &&
    /bench\/index\.(ts|js|mjs|cjs)$/.test(process.argv[1]);
if (__oimdb_isDirectRun_benchIndex) {
    void runAllOIMDBBenchmarks();
}
