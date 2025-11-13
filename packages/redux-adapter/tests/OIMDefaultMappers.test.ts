import {
    OIMReactiveCollection,
    OIMReactiveIndexManualSetBased,
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
} from '@oimdb/core';
import {
    defaultCollectionMapper,
    defaultIndexMapper,
    TOIMDefaultCollectionState,
    TOIMDefaultIndexState,
} from '../src';

interface User {
    id: string;
    name: string;
    age: number;
    email: string;
}

describe('Default Mappers', () => {
    let queue: OIMEventQueue;

    beforeEach(() => {
        const scheduler = new OIMEventQueueSchedulerImmediate();
        queue = new OIMEventQueue({ scheduler });
    });

    afterEach(() => {
        queue.destroy();
    });

    describe('defaultCollectionMapper', () => {
        let collection: OIMReactiveCollection<User, string>;

        beforeEach(() => {
            collection = new OIMReactiveCollection<User, string>(queue);
        });

        test('should initialize state with all entities when currentState is undefined', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                { id: '3', name: 'Charlie', age: 35, email: 'charlie@test.com' },
            ]);

            const state = defaultCollectionMapper(
                collection,
                new Set(['1', '2', '3']),
                undefined
            );

            expect(state.entities).toEqual({
                '1': { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                '2': { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                '3': { id: '3', name: 'Charlie', age: 35, email: 'charlie@test.com' },
            });
            expect(state.ids).toEqual(expect.arrayContaining(['1', '2', '3']));
            expect(state.ids).toHaveLength(3);
        });

        test('should update only changed entities when currentState is provided', () => {
            const currentState: TOIMDefaultCollectionState<User, string> = {
                entities: {
                    '1': { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                    '2': { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                },
                ids: ['1', '2'],
            };

            // Update one entity
            collection.upsertOne({
                id: '1',
                name: 'Alice Updated',
                age: 31,
                email: 'alice@test.com',
            });

            // Add new entity
            collection.upsertOne({
                id: '3',
                name: 'Charlie',
                age: 35,
                email: 'charlie@test.com',
            });

            const state = defaultCollectionMapper(
                collection,
                new Set(['1', '3']),
                currentState
            );

            expect(state.entities['1']).toEqual({
                id: '1',
                name: 'Alice Updated',
                age: 31,
                email: 'alice@test.com',
            });
            expect(state.entities['2']).toEqual(currentState.entities['2']);
            expect(state.entities['3']).toEqual({
                id: '3',
                name: 'Charlie',
                age: 35,
                email: 'charlie@test.com',
            });
            expect(state.ids).toEqual(expect.arrayContaining(['1', '2', '3']));
            expect(state.ids).toHaveLength(3);
        });

        test('should remove deleted entities', () => {
            const currentState: TOIMDefaultCollectionState<User, string> = {
                entities: {
                    '1': { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                    '2': { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                },
                ids: ['1', '2'],
            };

            // Remove one entity
            collection.removeOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });

            const state = defaultCollectionMapper(
                collection,
                new Set(['1']),
                currentState
            );

            expect(state.entities['1']).toBeUndefined();
            expect(state.entities['2']).toEqual(currentState.entities['2']);
            expect(state.ids).toEqual(['2']);
        });
    });

    describe('defaultIndexMapper', () => {
        let index: OIMReactiveIndexManualSetBased<string, string>;

        beforeEach(() => {
            index = new OIMReactiveIndexManualSetBased<string, string>(queue);
        });

        test('should initialize state with all keys when currentState is undefined', () => {
            index.setPks('department1', ['user1', 'user2']);
            index.setPks('department2', ['user3']);

            const state = defaultIndexMapper(
                index,
                new Set(['department1', 'department2']),
                undefined
            );

            expect(state.entities).toEqual({
                department1: { id: 'department1', ids: ['user1', 'user2'] },
                department2: { id: 'department2', ids: ['user3'] },
            });
        });

        test('should update only changed keys when currentState is provided', () => {
            const currentState: TOIMDefaultIndexState<string, string> = {
                entities: {
                    department1: { id: 'department1', ids: ['user1', 'user2'] },
                    department2: { id: 'department2', ids: ['user3'] },
                },
            };

            // Update one key
            index.setPks('department1', ['user1', 'user2', 'user4']);

            const state = defaultIndexMapper(
                index,
                new Set(['department1']),
                currentState
            );

            expect(state.entities.department1).toEqual({
                id: 'department1',
                ids: ['user1', 'user2', 'user4'],
            });
            expect(state.entities.department2).toEqual(currentState.entities.department2);
        });
    });
});
