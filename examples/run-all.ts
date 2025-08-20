import { execSync } from 'child_process';
import { readdirSync } from 'fs';

async function runAllExamples() {
    console.log('🚀 Running All OIMDB Examples\n');

    const examplesDir = process.cwd() + '/examples';
    const exampleFiles = readdirSync(examplesDir)
        .filter(file => file.endsWith('.ts') && file !== 'run-all.ts')
        .sort();

    for (const file of exampleFiles) {
        console.log('==================================================');
        console.log(`📖 Running: ${file}`);
        console.log('==================================================');

        try {
            execSync(`npx tsx ${file}`, {
                cwd: examplesDir,
                stdio: 'inherit',
            });
        } catch (error) {
            console.error(`❌ Failed to run ${file}:`, error);
        }

        console.log('');
    }

    console.log('🎯 All examples completed!');
    console.log('');
    console.log('📚 Examples covered:');
    console.log('  • Basic usage and CRUD operations');
    console.log('  • Index functionality and comparison strategies');
    console.log('  • Scheduler performance comparison');
    console.log('  • Event system and coalescing');
    console.log('  • Database lifecycle management');
}

runAllExamples().catch(console.error);
