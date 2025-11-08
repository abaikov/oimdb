import { OIMCollectionAsync } from '../src/core/OIMCollectionAsync';
import { OIMCollectionStoreAsyncMock } from './OIMCollectionStoreAsyncMock';
import { EOIMCollectionEventType } from '@oimdb/core';
import type { TOIMCollectionUpdatePayload } from '@oimdb/core';

interface TOIMUser {
    id: string;
    name: string;
    age: number;
    email: string;
}

describe('OIMCollectionAsync', () => {
    describe('Basic CRUD Operations', () => {
        let collection: OIMCollectionAsync<TOIMUser, string>;
        let store: OIMCollectionStoreAsyncMock<TOIMUser, string>;
        let eventSpy: jest.Mock;

        beforeEach(() => {
            store = new OIMCollectionStoreAsyncMock<TOIMUser, string>();
            collection = new OIMCollectionAsync<TOIMUser, string>({
                store,
            });
            eventSpy = jest.fn();
            collection.emitter.on(EOIMCollectionEventType.UPDATE, eventSpy);
        });

        afterEach(() => {
            collection.emitter.offAll();
        });

        test('should insert single entity and emit update event', async () => {
            const user: TOIMUser = {
                id: 'user1',
                name: 'John Doe',
                age: 30,
                email: 'john@example.com',
            };

            await collection.upsertOne(user);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1'],
            } as TOIMCollectionUpdatePayload<string>);
        });

        test('should insert multiple entities and emit single update event', async () => {
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
                { id: 'user3', name: 'Bob', age: 35, email: 'bob@example.com' },
            ];

            await collection.upsertMany(users);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1', 'user2', 'user3'],
            });
        });

        test('should update existing entity', async () => {
            const user: TOIMUser = {
                id: 'user1',
                name: 'John Doe',
                age: 30,
                email: 'john@example.com',
            };

            await collection.upsertOne(user);
            eventSpy.mockClear();

            const updatedUser = {
                id: 'user1',
                name: 'John Smith',
                age: 31,
                email: 'johnsmith@example.com',
            };

            await collection.upsertOne(updatedUser);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1'],
            });

            const retrieved = await collection.getOneByPk('user1');
            expect(retrieved?.name).toBe('John Smith');
        });

        test('should get single entity by primary key', async () => {
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

        test('should return undefined for non-existent entity', async () => {
            const retrieved = await collection.getOneByPk('non-existent');
            expect(retrieved).toBeUndefined();
        });

        test('should get multiple entities by primary keys', async () => {
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
                { id: 'user3', name: 'Bob', age: 35, email: 'bob@example.com' },
            ];

            await collection.upsertMany(users);

            const retrieved = await collection.getManyByPks(['user1', 'user3']);
            expect(retrieved).toHaveLength(2);
            expect(retrieved.map(u => u.id)).toEqual(expect.arrayContaining(['user1', 'user3']));
        });

        test('should remove single entity and emit update event', async () => {
            const user: TOIMUser = {
                id: 'user1',
                name: 'John Doe',
                age: 30,
                email: 'john@example.com',
            };

            await collection.upsertOne(user);
            eventSpy.mockClear();

            await collection.removeOne(user);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1'],
            });

            const retrieved = await collection.getOneByPk('user1');
            expect(retrieved).toBeUndefined();
        });

        test('should remove multiple entities and emit single update event', async () => {
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
                { id: 'user3', name: 'Bob', age: 35, email: 'bob@example.com' },
            ];

            await collection.upsertMany(users);
            eventSpy.mockClear();

            await collection.removeMany([users[0], users[2]]);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1', 'user3'],
            });

            const remaining = await collection.getAll();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].id).toBe('user2');
        });

        test('should clear all entities and emit update event', async () => {
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
            eventSpy.mockClear();

            await collection.clear();

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: [],
            });

            const count = await collection.countAll();
            expect(count).toBe(0);
        });

        test('should count all entities', async () => {
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

            const count = await collection.countAll();
            expect(count).toBe(2);
        });

        test('should get all entities', async () => {
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
            expect(all.map(u => u.id)).toEqual(expect.arrayContaining(['user1', 'user2']));
        });

        test('should get all primary keys', async () => {
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

            const pks = await collection.getAllPks();
            expect(pks).toHaveLength(2);
            expect(pks).toEqual(expect.arrayContaining(['user1', 'user2']));
        });
    });
});

