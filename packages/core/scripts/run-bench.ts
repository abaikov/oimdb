import { runAllOIMDBBenchmarks } from '../bench/index';

async function main() {
    console.log('🚀 Starting OIMDB Benchmarks...\n');

    await runAllOIMDBBenchmarks();

    console.log('\n✨ Benchmarks completed successfully!');
}

main().catch(error => {
    console.error('❌ Benchmark execution failed:', error);
    process.exit(1);
});
