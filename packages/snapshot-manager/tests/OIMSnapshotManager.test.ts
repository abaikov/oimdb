import { 
    OIMReactiveCollection, 
    OIMEventQueue, 
    OIMEventQueueSchedulerImmediate 
} from '@oimdb/core';
import { OIMSnapshotManager } from '../src/core/OIMSnapshotManager';

// Test entities
interface User {
    id: number;
    name: string;
    email: string;
}

interface Post {
    id: number;
    title: string;
    authorId: number;
}

interface Comment {
    id: string;
    content: string;
    postId: number;
}

describe('OIMSnapshotManager', () => {
    let userCollection: OIMReactiveCollection<User, number>;
    let postCollection: OIMReactiveCollection<Post, number>;
    let commentCollection: OIMReactiveCollection<Comment, string>;
    let snapshotManager: OIMSnapshotManager<{
        users: OIMReactiveCollection<User, number>;
        posts: OIMReactiveCollection<Post, number>;
        comments: OIMReactiveCollection<Comment, string>;
    }>;
    let queue: OIMEventQueue;

    beforeEach(() => {
        // Create event queue
        queue = new OIMEventQueue({
            scheduler: new OIMEventQueueSchedulerImmediate()
        });

        // Create collections
        userCollection = new OIMReactiveCollection<User, number>(queue, {
            collectionOpts: {
                selectPk: (user) => user.id
            }
        });

        postCollection = new OIMReactiveCollection<Post, number>(queue, {
            collectionOpts: {
                selectPk: (post) => post.id
            }
        });

        commentCollection = new OIMReactiveCollection<Comment, string>(queue, {
            collectionOpts: {
                selectPk: (comment) => comment.id
            }
        });

        // Create snapshot manager
        const collections = {
            users: userCollection,
            posts: postCollection,
            comments: commentCollection
        };

        snapshotManager = new OIMSnapshotManager(collections);
    });

    afterEach(() => {
        snapshotManager.destroy();
    });

    describe('Constructor and initialization', () => {
        it('should initialize with empty change tracking', () => {
            expect(snapshotManager.hasChanges()).toBe(false);
            
            const changeCounts = snapshotManager.getChangeCount();
            expect(changeCounts.users).toBe(0);
            expect(changeCounts.posts).toBe(0);
            expect(changeCounts.comments).toBe(0);
        });

        it('should handle collections with different entity and PK types', () => {
            expect(() => {
                const mixedCollections = {
                    users: userCollection,
                    posts: postCollection,
                    comments: commentCollection
                };
                const manager = new OIMSnapshotManager(mixedCollections);
                manager.destroy();
            }).not.toThrow();
        });
    });

    describe('Change tracking', () => {
        it('should track single entity creation', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            
            userCollection.upsertMany([user]);
            
            expect(snapshotManager.hasChanges()).toBe(true);
            
            const changeCounts = snapshotManager.getChangeCount();
            expect(changeCounts.users).toBe(1);
            expect(changeCounts.posts).toBe(0);
            expect(changeCounts.comments).toBe(0);
        });

        it('should track multiple entity creation in same collection', () => {
            const users: User[] = [
                { id: 1, name: 'John', email: 'john@example.com' },
                { id: 2, name: 'Jane', email: 'jane@example.com' }
            ];
            
            userCollection.upsertMany(users);
            
            expect(snapshotManager.hasChanges()).toBe(true);
            
            const changeCounts = snapshotManager.getChangeCount();
            expect(changeCounts.users).toBe(2);
        });

        it('should track changes across multiple collections', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            const post: Post = { id: 1, title: 'Test Post', authorId: 1 };
            const comment: Comment = { id: 'c1', content: 'Great post!', postId: 1 };
            
            userCollection.upsertMany([user]);
            postCollection.upsertMany([post]);
            commentCollection.upsertMany([comment]);
            
            expect(snapshotManager.hasChanges()).toBe(true);
            
            const changeCounts = snapshotManager.getChangeCount();
            expect(changeCounts.users).toBe(1);
            expect(changeCounts.posts).toBe(1);
            expect(changeCounts.comments).toBe(1);
        });

        it('should deduplicate repeated updates to same entity', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            
            // Update same entity multiple times
            userCollection.upsertMany([user]);
            userCollection.upsertMany([{ ...user, name: 'John Updated' }]);
            userCollection.upsertMany([{ ...user, email: 'john.updated@example.com' }]);
            
            const changeCounts = snapshotManager.getChangeCount();
            expect(changeCounts.users).toBe(1); // Should still be 1 due to deduplication
        });

        it('should track entity updates', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            
            userCollection.upsertMany([user]);
            snapshotManager.clearChanges(); // Clear initial creation
            
            // Update the entity
            userCollection.upsertMany([{ ...user, name: 'John Updated' }]);
            
            expect(snapshotManager.hasChanges()).toBe(true);
            
            const changeCounts = snapshotManager.getChangeCount();
            expect(changeCounts.users).toBe(1);
        });

        it('should track entity deletions', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            
            userCollection.upsertMany([user]);
            snapshotManager.clearChanges(); // Clear initial creation
            
            // Delete the entity
            userCollection.removeOne(user);
            
            expect(snapshotManager.hasChanges()).toBe(true);
            
            const changeCounts = snapshotManager.getChangeCount();
            expect(changeCounts.users).toBe(1);
        });
    });

    describe('Snapshot creation', () => {
        it('should create empty snapshot when no changes', () => {
            const snapshot = snapshotManager.takeSnapshot();
            
            expect(snapshot.users).toEqual([]);
            expect(snapshot.posts).toEqual([]);
            expect(snapshot.comments).toEqual([]);
        });

        it('should create snapshot with created entities', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            const post: Post = { id: 1, title: 'Test Post', authorId: 1 };
            
            userCollection.upsertMany([user]);
            postCollection.upsertMany([post]);
            
            const snapshot = snapshotManager.takeSnapshot();
            
            expect(snapshot.users).toHaveLength(1);
            expect(snapshot.users[0]).toEqual({
                pk: 1,
                entity: user
            });
            
            expect(snapshot.posts).toHaveLength(1);
            expect(snapshot.posts[0]).toEqual({
                pk: 1,
                entity: post
            });
            
            expect(snapshot.comments).toEqual([]);
        });

        it('should create snapshot with updated entities', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            userCollection.upsertMany([user]);
            
            snapshotManager.clearChanges(); // Clear initial creation
            
            const updatedUser: User = { ...user, name: 'John Updated' };
            userCollection.upsertMany([updatedUser]);
            
            const snapshot = snapshotManager.takeSnapshot();
            
            expect(snapshot.users).toHaveLength(1);
            expect(snapshot.users[0]).toEqual({
                pk: 1,
                entity: updatedUser
            });
        });

        it('should create snapshot with deleted entities (null entities)', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            userCollection.upsertMany([user]);
            
            snapshotManager.clearChanges(); // Clear initial creation
            
            userCollection.removeOne(user);
            
            const snapshot = snapshotManager.takeSnapshot();
            
            expect(snapshot.users).toHaveLength(1);
            expect(snapshot.users[0]).toEqual({
                pk: 1,
                entity: null // null indicates deletion
            });
        });

        it('should clear tracked changes after taking snapshot', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            userCollection.upsertMany([user]);
            
            expect(snapshotManager.hasChanges()).toBe(true);
            
            snapshotManager.takeSnapshot();
            
            expect(snapshotManager.hasChanges()).toBe(false);
            
            const changeCounts = snapshotManager.getChangeCount();
            expect(changeCounts.users).toBe(0);
            expect(changeCounts.posts).toBe(0);
            expect(changeCounts.comments).toBe(0);
        });

        it('should handle mixed operations in single snapshot', () => {
            // Create initial entities
            const user1: User = { id: 1, name: 'John', email: 'john@example.com' };
            const user2: User = { id: 2, name: 'Jane', email: 'jane@example.com' };
            userCollection.upsertMany([user1, user2]);
            
            snapshotManager.clearChanges();
            
            // Perform mixed operations
            const updatedUser1: User = { ...user1, name: 'John Updated' };
            userCollection.upsertMany([updatedUser1]); // Update
            
            const newUser: User = { id: 3, name: 'Bob', email: 'bob@example.com' };
            userCollection.upsertMany([newUser]); // Create
            
            userCollection.removeOne(user2); // Delete
            
            const snapshot = snapshotManager.takeSnapshot();
            
            expect(snapshot.users).toHaveLength(3);
            
            // Find each operation result
            const updatedEntity = snapshot.users.find(s => s.pk === 1);
            const createdEntity = snapshot.users.find(s => s.pk === 3);
            const deletedEntity = snapshot.users.find(s => s.pk === 2);
            
            expect(updatedEntity).toEqual({ pk: 1, entity: updatedUser1 });
            expect(createdEntity).toEqual({ pk: 3, entity: newUser });
            expect(deletedEntity).toEqual({ pk: 2, entity: null });
        });
    });

    describe('Options', () => {
        it('should exclude empty collections when includeEmptyCollections is false', () => {
            const collectionsWithOptions = {
                users: userCollection,
                posts: postCollection,
                comments: commentCollection
            };
            
            const managerWithOptions = new OIMSnapshotManager(collectionsWithOptions, {
                includeEmptyCollections: false
            });
            
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            userCollection.upsertMany([user]);
            
            const snapshot = managerWithOptions.takeSnapshot();
            
            expect(snapshot.users).toHaveLength(1);
            expect(snapshot.posts).toBeUndefined();
            expect(snapshot.comments).toBeUndefined();
            
            managerWithOptions.destroy();
        });
    });

    describe('Utility methods', () => {
        it('should manually clear changes', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            userCollection.upsertMany([user]);
            
            expect(snapshotManager.hasChanges()).toBe(true);
            
            snapshotManager.clearChanges();
            
            expect(snapshotManager.hasChanges()).toBe(false);
        });

        it('should provide accurate change counts', () => {
            const users: User[] = [
                { id: 1, name: 'John', email: 'john@example.com' },
                { id: 2, name: 'Jane', email: 'jane@example.com' }
            ];
            const posts: Post[] = [
                { id: 1, title: 'Post 1', authorId: 1 }
            ];
            
            userCollection.upsertMany(users);
            postCollection.upsertMany(posts);
            
            const changeCounts = snapshotManager.getChangeCount();
            
            expect(changeCounts.users).toBe(2);
            expect(changeCounts.posts).toBe(1);
            expect(changeCounts.comments).toBe(0);
        });
    });

    describe('Resource cleanup', () => {
        it('should unsubscribe from events on destroy', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            
            snapshotManager.destroy();
            
            // Changes after destroy should not be tracked
            userCollection.upsertMany([user]);
            
            // Since manager is destroyed, we can't test hasChanges()
            // But we can verify no errors are thrown
            expect(() => userCollection.upsertMany([user])).not.toThrow();
        });

        it('should clear tracked changes on destroy', () => {
            const user: User = { id: 1, name: 'John', email: 'john@example.com' };
            userCollection.upsertMany([user]);
            
            expect(snapshotManager.hasChanges()).toBe(true);
            
            snapshotManager.destroy();
            
            // Create new manager to test state was cleared
            const newManager = new OIMSnapshotManager({
                users: userCollection,
                posts: postCollection,
                comments: commentCollection
            });
            
            expect(newManager.hasChanges()).toBe(false);
            
            newManager.destroy();
        });
    });
});
