import { createDb } from '../src/dx';

interface Task {
    id: string;
    name: string;
    priority: number;
}

async function schedulerComparisonExample() {
    console.log('⏱️  Scheduler Comparison Example\n');

    // Test different schedulers
    const schedulers = [
        { name: 'microtask', type: 'microtask' as const },
        { name: 'immediate', type: 'immediate' as const },
        { name: 'timeout', type: 'timeout' as const },
        { name: 'animationFrame', type: 'animationFrame' as const },
    ];

    for (const scheduler of schedulers) {
        console.log(`🔄 Testing ${scheduler.name} scheduler:`);

        const db = createDb({ scheduler: scheduler.type });
        const tasks = db.createCollection<Task>();

        let notifications = 0;
        const startTime = performance.now();

        // Subscribe to updates
        tasks.subscribe('task1', () => {
            const elapsed = performance.now() - startTime;
            notifications++;
            console.log(
                `    📢 Task1 notification #${notifications} (${elapsed.toFixed(2)}ms)`
            );
        });

        // Make rapid updates
        console.log('    📝 Making rapid updates...');
        for (let i = 0; i < 1000; i++) {
            tasks.upsert({ id: 'task1', name: `Task ${i}`, priority: i });
        }

        const totalTime = performance.now() - startTime;
        const queueLength = db.getMetrics().queueLength;

        console.log(`    ⏱️  Total time: ${totalTime.toFixed(2)}ms`);
        console.log(`    📊 Final queue length: ${queueLength}`);
        console.log(`    📢 Total notifications: ${notifications}`);

        // Cleanup
        db.destroy();
        console.log('');
    }

    console.log('📊 Scheduler Performance Summary:');
    console.log('  • microtask: Fastest, processes in same tick');
    console.log('  • immediate: Instant processing, good for testing');
    console.log('  • timeout: Batched processing, good for performance');
    console.log('  • animationFrame: Smooth UI updates, good for React');

    console.log('\n✅ Scheduler comparison completed!');
}

schedulerComparisonExample();
