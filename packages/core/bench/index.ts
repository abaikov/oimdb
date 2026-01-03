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

    try {
        console.log('📊 COLLECTION BENCHMARKS\n');
        await runAllBenchmarks();

        console.log('='.repeat(60) + '\n');
        console.log('📊 INDEX BENCHMARKS\n');
        await runAllIndexBenchmarks();

        console.log('='.repeat(60) + '\n');
        console.log('📊 SUBSCRIPTION/DISPATCH BENCHMARKS\n');
        await runSubscriptionDispatchBenchmarks();

        console.log('='.repeat(60) + '\n');
        console.log('📊 EFFECTS/COMPUTED BENCHMARKS\n');
        await runEffectComputedBenchmarks();

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
runAllOIMDBBenchmarks();
