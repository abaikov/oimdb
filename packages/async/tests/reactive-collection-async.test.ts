import { OIMReactiveCollectionAsync } from '../src/core/OIMReactiveCollectionAsync';
import { OIMCollectionStoreAsyncMock } from './OIMCollectionStoreAsyncMock';
import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
} from '@oimdb/core';

interface TOIMUser {
    id: string;
    name: string;
    age: number;
    email: string;
}

describe('OIMReactiveCollectionAsync', () => {
    describe('Reactive Operations', () => {
        let collection: OIMReactiveCollectionAsync<TOIMUser, string>;
        let store: OIMCollectionStoreAsyncMock<TOIMUser, string>;
        let queue: OIMEventQueue;

        beforeEach(() => {
            store = new OIMCollectionStoreAsyncMock<TOIMUser, string>();
            queue = new OIMEventQueue({
                scheduler: new OIMEventQueueSchedulerImmediate(),
            });
            collection = new OIMReactiveCollectionAsync<TOIMUser, string>(queue, {
                store,
            });
        });

        afterEach(() => {
            collection.emitter.offAll();
        });

        test('should have updateEventEmitter', () => {
            expect(collection.updateEventEmitter).toBeDefined();
        });

        test('should have coalescer', () => {
            expect(collection.coalescer).toBeDefined();
        });

        test('should subscribe to key-specific updates', async () => {
            const callback = jest.fn();

            collection.updateEventEmitter.subscribeOnKey('user1', callback);

            await collection.upsertOne({
                id: 'user1',
                name: 'John',
                age: 30,
                email: 'john@example.com',
            });

            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callback).toHaveBeenCalled();
        });

        test('should subscribe to multiple keys', async () => {
            const callback = jest.fn();

            collection.updateEventEmitter.subscribeOnKeys(['user1', 'user2'], callback);

            await collection.upsertOne({
                id: 'user1',
                name: 'John',
                age: 30,
                email: 'john@example.com',
            });

            await collection.upsertOne({
                id: 'user2',
                name: 'Jane',
                age: 25,
                email: 'jane@example.com',
            });

            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callback).toHaveBeenCalled();
        });

        test('should perform async operations', async () => {
            const user: TOIMUser = {
                id: 'user1',
                name: 'John Doe',
                age: 30,
                email: 'john@example.com',
            };

            await collection.upsertOne(user);

            const retrieved = await collection.getOneByPk('user1');
            expect(retrieved).toEqual(user);
        });

        test('should handle multiple async operations', async () => {
            const users: TOIMUser[] = [
                {
                    id: 'user1',
                    name: 'John',
                    age: 30,
                    email: 'john@example.com',
                },
                {
                    id: 'user2',
                    name: 'Jane',
                    age: 25,
                    email: 'jane@example.com',
                },
            ];

            await collection.upsertMany(users);

            const all = await collection.getAll();
            expect(all).toHaveLength(2);
        });
    });
});

