import { 
    OIMReactiveCollection, 
    OIMEventQueue, 
    OIMEventQueueSchedulerImmediate 
} from '@oimdb/core';
import { OIMSnapshotManager } from '@oimdb/snapshot-manager';

// Define entities
interface User {
    id: number;
    name: string;
    email: string;
}

interface Post {
    id: number;
    title: string;
    authorId: number;
    content: string;
}

// Example usage of OIMSnapshotManager
async function basicUsageExample() {
    // Setup event queue
    const queue = new OIMEventQueue({
        scheduler: new OIMEventQueueSchedulerImmediate()
    });

    // Create collections
    const userCollection = new OIMReactiveCollection<User, number>(queue, {
        selectPk: (user) => user.id
    });

    const postCollection = new OIMReactiveCollection<Post, number>(queue, {
        selectPk: (post) => post.id
    });

    // Create snapshot manager
    const collections = {
        users: userCollection,
        posts: postCollection
    };

    const snapshotManager = new OIMSnapshotManager(collections);

    console.log('🚀 Starting snapshot manager example...\n');

    // Make some changes
    console.log('📝 Creating users...');
    const users: User[] = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' }
    ];
    userCollection.upsertMany(users);

    console.log('📝 Creating posts...');
    const posts: Post[] = [
        { id: 1, title: 'Hello World', authorId: 1, content: 'This is my first post!' },
        { id: 2, title: 'TypeScript Tips', authorId: 2, content: 'Some useful TS patterns...' }
    ];
    postCollection.upsertMany(posts);

    // Take first snapshot
    console.log('\n📸 Taking first snapshot...');
    const snapshot1 = snapshotManager.takeSnapshot();
    
    console.log('Users in snapshot:', snapshot1.users.map(s => ({ pk: s.pk, name: s.entity?.name })));
    console.log('Posts in snapshot:', snapshot1.posts.map(s => ({ pk: s.pk, title: s.entity?.title })));

    // Make more changes
    console.log('\n📝 Updating user and creating new post...');
    userCollection.upsertMany([{ id: 1, name: 'Alice Smith', email: 'alice.smith@example.com' }]);
    postCollection.upsertMany([{ id: 3, title: 'Advanced Patterns', authorId: 1, content: 'Deep dive into...' }]);

    // Delete a user
    console.log('🗑️ Deleting a user...');
    userCollection.removeOne(users[1]); // Delete Bob

    // Take second snapshot
    console.log('\n📸 Taking second snapshot...');
    const snapshot2 = snapshotManager.takeSnapshot();
    
    console.log('Users in snapshot:', snapshot2.users.map(s => ({ 
        pk: s.pk, 
        name: s.entity?.name || 'DELETED',
        isDeleted: s.entity === null 
    })));
    console.log('Posts in snapshot:', snapshot2.posts.map(s => ({ pk: s.pk, title: s.entity?.title })));

    // Check change counts before cleanup
    console.log('\n📊 Current change counts:', snapshotManager.getChangeCount());
    console.log('Has changes:', snapshotManager.hasChanges());

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    snapshotManager.destroy();
    
    console.log('✅ Example completed!');
}

// Run the example
if (require.main === module) {
    basicUsageExample().catch(console.error);
}

export { basicUsageExample };
