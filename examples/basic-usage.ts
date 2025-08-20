import { createDb } from '../src/dx';

interface User {
    id: string;
    name: string;
    email: string;
}

interface Order {
    id: string;
    userId: string;
    amount: number;
    status: 'pending' | 'completed' | 'cancelled';
}

async function basicUsageExample() {
    console.log('🚀 Basic Usage Example\n');

    try {
        // Create database with microtask scheduler (fastest)
        const db = createDb({ scheduler: 'microtask' });

        // Create collections
        const users = db.createCollection<User>();
        const orders = db.createCollection<Order>();

        console.log('📊 Collections and indexes created');

        // Subscribe to updates
        let userNotifications = 0;
        let orderNotifications = 0;

        users.subscribe('user123', () => {
            userNotifications++;
            console.log(
                `  👤 User updated (notification #${userNotifications})`
            );
        });

        orders.subscribe('order456', () => {
            orderNotifications++;
            console.log(
                `  📦 Order updated (notification #${orderNotifications})`
            );
        });

        // Insert data
        console.log('\n📝 Inserting data:');
        users.upsert({
            id: 'user123',
            name: 'John Doe',
            email: 'john@example.com',
        });
        orders.upsert({
            id: 'order456',
            userId: 'user123',
            amount: 99.99,
            status: 'pending',
        });

        // Update data
        console.log('\n✏️  Updating data:');
        users.upsert({
            id: 'user123',
            name: 'John Smith',
            email: 'john@example.com',
        });
        orders.upsert({
            id: 'order456',
            userId: 'user123',
            amount: 99.99,
            status: 'completed',
        });

        // Show metrics
        console.log('\n📊 Database metrics:');
        console.log(`  Scheduler: ${db.getMetrics().scheduler}`);
        console.log(`  Queue length: ${db.getMetrics().queueLength}`);

        // Manual flush to process all events
        console.log('\n🔄 Manual flush:');
        console.log(`  Queue length before: ${db.getMetrics().queueLength}`);
        db.flushUpdatesNotifications();
        console.log(`  Queue length after: ${db.getMetrics().queueLength}`);

        // Cleanup
        console.log('\n🧹 Cleanup:');
        db.destroy();
        console.log('  Database destroyed');

        console.log('\n✅ Basic usage example completed!');
        console.log(
            `  Total notifications: ${userNotifications + orderNotifications}`
        );
    } catch (error) {
        console.error('❌ Basic usage example failed:', error);
    }
}

basicUsageExample();
