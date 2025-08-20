import { createDb } from '../src/dx/index';

interface User {
    id: string;
    name: string;
}

interface Order {
    id: string;
    userId: string;
    amount: number;
}

describe('DX Context API', () => {
    test('should create db with shared event queue', () => {
        const db = createDb({ scheduler: 'immediate' });

        const users = db.createCollection<User>();
        const orders = db.createCollection<Order>();

        // Both should share the same queue
        expect(users.advanced.eventQueue).toBe(orders.advanced.eventQueue);

        db.destroy();
    });

    test('should coalesce updates across collections in same db', () => {
        const db = createDb({ scheduler: 'immediate' });

        const users = db.createCollection<User>();
        const orders = db.createCollection<Order>();

        let totalNotifications = 0;
        const globalHandler = () => {
            totalNotifications++;
        };

        // Subscribe to related entities
        users.subscribe('user123', globalHandler);
        orders.subscribe('order456', globalHandler);

        // Make multiple updates
        users.upsert({ id: 'user123', name: 'John' });
        orders.upsert({ id: 'order456', userId: 'user123', amount: 100 });
        users.upsert({ id: 'user123', name: 'John Updated' });

        // Check queue has pending events
        expect(db.getMetrics().queueLength).toBeGreaterThan(0);

        // Process all events at once using new flush method
        db.flushUpdatesNotifications();

        // Should receive notifications for both entities
        expect(totalNotifications).toBe(2); // One for user, one for order
        expect(db.getMetrics().queueLength).toBe(0);

        db.destroy();
    });

    test('should isolate different dbs completely', () => {
        const db1 = createDb({ scheduler: 'immediate' });
        const db2 = createDb({ scheduler: 'immediate' });

        const users1 = db1.createCollection<User>();
        const users2 = db2.createCollection<User>();

        // Verify different queues
        expect(users1.advanced.eventQueue).not.toBe(users2.advanced.eventQueue);

        let db1Notifications = 0;
        let db2Notifications = 0;

        users1.subscribe('user123', () => db1Notifications++);
        users2.subscribe('user123', () => db2Notifications++);

        // Updates in different dbs
        users1.upsert({ id: 'user123', name: 'John in DB 1' });
        users2.upsert({ id: 'user123', name: 'John in DB 2' });

        // Process each database separately
        db1.flushUpdatesNotifications();
        db2.flushUpdatesNotifications();

        // Should be completely isolated
        expect(db1Notifications).toBe(1);
        expect(db2Notifications).toBe(1);

        db1.destroy();
        db2.destroy();
    });

    test('should handle mixed collection and index updates in db', () => {
        const db = createDb({ scheduler: 'immediate' });

        const users = db.createCollection<User>();
        const userIndex = db.createIndex<string, string>();

        let coalescedNotifications = 0;
        const coalescedHandler = () => {
            coalescedNotifications++;
        };

        // Subscribe to both collection and index with same handler
        users.subscribe('user123', coalescedHandler);
        userIndex.subscribe('active-users', coalescedHandler);

        // Update both collection and index
        users.upsert({ id: 'user123', name: 'John' });
        userIndex.set('active-users', ['user123']);

        // Should have events from both sources in same queue
        expect(db.getMetrics().queueLength).toBe(2);

        // Process all events
        db.flushUpdatesNotifications();

        // Should receive notifications from both sources
        expect(coalescedNotifications).toBe(2);

        db.destroy();
    });

    test('should support different scheduler types per db', () => {
        const manualContext = createDb({ scheduler: 'immediate' });
        const microtaskContext = createDb({ scheduler: 'microtask' });

        const manualUsers = manualContext.createCollection<User>();
        const microtaskUsers = microtaskContext.createCollection<User>();

        let manualNotifications = 0;
        let microtaskNotifications = 0;

        manualUsers.subscribe('user123', () => manualNotifications++);
        microtaskUsers.subscribe('user123', () => microtaskNotifications++);

        // Update both
        manualUsers.upsert({ id: 'user123', name: 'Manual John' });
        microtaskUsers.upsert({ id: 'user123', name: 'Microtask John' });

        // Manual db requires explicit flush
        expect(manualNotifications).toBe(0);
        manualUsers.advanced.eventQueue.flush();
        expect(manualNotifications).toBe(1);

        // Microtask db processes automatically (but we can't easily test timing)
        // Just verify it was set up correctly
        expect(microtaskUsers.advanced.eventQueue).toBeDefined();

        setTimeout(() => {
            manualContext.destroy();
            microtaskContext.destroy();
        }, 10);
    });

    test('should provide db metrics', () => {
        const db = createDb({ scheduler: 'immediate' });

        const users = db.createCollection<User>();
        const orders = db.createCollection<Order>();

        // Initially empty
        expect(db.getMetrics().queueLength).toBe(0);

        // Add some updates
        users.upsert({ id: 'user123', name: 'John' });
        orders.upsert({ id: 'order456', userId: 'user123', amount: 100 });

        // Should show queued events
        expect(db.getMetrics().queueLength).toBe(2);
        expect(db.getMetrics().scheduler).toContain('Immediate');

        db.destroy();
    });
});
