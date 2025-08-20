import { createDb } from '../src/dx';

interface User {
    id: string;
    name: string;
    role: string;
}

interface Post {
    id: string;
    title: string;
    authorId: string;
    published: boolean;
}

async function indexUsageExample() {
    console.log('🔍 Index Usage Example\n');

    try {
        // Create database
        const db = createDb({ scheduler: 'immediate' });

        // Create collections
        const users = db.createCollection<User>();
        const posts = db.createCollection<Post>();

        // Create indexes
        const adminIndex = db.createIndex<string, string>();
        const publishedIndex = db.createIndex<string, string>();
        const userPostsIndex = db.createIndex<string, string>();

        console.log('📊 Collections and indexes created');

        // Insert users
        console.log('\n👥 Inserting users:');
        users.upsert({ id: 'user123', name: 'John Admin', role: 'admin' });
        users.upsert({ id: 'user456', name: 'Jane User', role: 'user' });
        users.upsert({ id: 'user789', name: 'Bob Editor', role: 'editor' });

        // Insert posts
        console.log('\n📝 Inserting posts:');
        posts.upsert({
            id: 'post1',
            title: 'First Post',
            authorId: 'user123',
            published: true,
        });
        posts.upsert({
            id: 'post2',
            title: 'Draft Post',
            authorId: 'user456',
            published: false,
        });
        posts.upsert({
            id: 'post3',
            title: 'Published Post',
            authorId: 'user123',
            published: true,
        });

        // Build indexes
        console.log('\n🔗 Building indexes:');
        adminIndex.set('admin', ['user123']);
        adminIndex.set('user', ['user456', 'user789']);
        adminIndex.set('editor', ['user789']);

        publishedIndex.set('published', ['post1', 'post3']);
        publishedIndex.set('draft', ['post2']);

        userPostsIndex.set('user123', ['post1', 'post3']);
        userPostsIndex.set('user456', ['post2']);

        // Query indexes
        console.log('\n🔍 Querying indexes:');
        const adminUsers = adminIndex.get('admin');
        const publishedPosts = publishedIndex.get('published');
        const user123Posts = userPostsIndex.get('user123');

        console.log(`  Admin users: ${adminUsers}`);
        console.log(`  Published posts: ${publishedPosts}`);
        console.log(`  User 123 posts: ${user123Posts}`);

        // Update indexes
        console.log('\n✏️  Updating indexes:');
        adminIndex.add('admin', ['user789']);
        publishedIndex.set('published', ['post1', 'post2', 'post3']);
        userPostsIndex.add('user456', ['post3']);

        // Test coalescing
        console.log('\n🔄 Testing coalescing:');
        console.log(`  Queue length before: ${db.getMetrics().queueLength}`);

        // Subscribe to index updates
        let adminNotifications = 0;
        let publishedNotifications = 0;
        let userPostsNotifications = 0;

        adminIndex.subscribe('admin', () => {
            adminNotifications++;
            console.log(
                `  👑 Admin index updated (notification #${adminNotifications})`
            );
        });

        publishedIndex.subscribe('published', () => {
            publishedNotifications++;
            console.log(
                `  ✅ Published index updated (notification #${publishedNotifications})`
            );
        });

        userPostsIndex.subscribe('user123', () => {
            userPostsNotifications++;
            console.log(
                `  📝 User posts index updated (notification #${userPostsNotifications})`
            );
        });

        // Make changes
        adminIndex.set('admin', ['user123', 'user789']);
        publishedIndex.set('published', ['post1', 'post2', 'post3']);
        userPostsIndex.set('user123', ['post1', 'post3']);

        console.log(
            `  Queue length after updates: ${db.getMetrics().queueLength}`
        );

        // Flush to process events
        db.flushUpdatesNotifications();
        console.log(
            `  Queue length after flush: ${db.getMetrics().queueLength}`
        );

        // Cleanup
        console.log('\n🧹 Cleanup:');
        db.destroy();
        console.log('  Database destroyed');

        console.log('\n✅ Index usage example completed!');
        console.log(
            `  Total notifications: ${adminNotifications + publishedNotifications + userPostsNotifications}`
        );
    } catch (error) {
        console.error('❌ Index usage example failed:', error);
    }
}

indexUsageExample();
