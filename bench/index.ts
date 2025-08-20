// Main benchmark runner that coordinates all benchmarks
import { runAllBenchmarks } from './collection.bench';
import { runAllIndexBenchmarks } from './index.bench';

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
        console.log('🎉 All OIMDB benchmarks completed successfully!');
    } catch (error) {
        console.error('❌ Benchmark suite failed:', error);
        process.exit(1);
    }
}

// Export individual benchmark runners
export { runAllBenchmarks as runCollectionBenchmarks } from './collection.bench';
export { runAllIndexBenchmarks } from './index.bench';

// Run benchmarks if this file is executed directly
runAllOIMDBBenchmarks();
