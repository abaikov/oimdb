import { OIMCollection } from '../src/core/OIMCollection';
import { OIMCollectionStoreMapDriven } from '../src/core/OIMCollectionStoreMapDriven';
import { OIMPkSelectorFactory } from '../src/core/OIMPkSelectorFactory';
import { OIMEntityUpdaterFactory } from '../src/core/OIMEntityUpdaterFactory';
import { EOIMCollectionEventType } from '../src/enum/EOIMCollectionEventType';
import { TOIMCollectionUpdatePayload } from '../src/types/TOIMCollectionUpdatePayload';

interface TOIMUser {
    id: string;
    name: string;
    age: number;
    email: string;
}

interface TOIMProduct {
    productId: number;
    title: string;
    price: number;
    category: string;
}

describe('OIMCollection', () => {
    describe('Basic CRUD Operations', () => {
        let collection: OIMCollection<TOIMUser, string>;
        let eventSpy: jest.Mock;

        beforeEach(() => {
            collection = new OIMCollection<TOIMUser, string>({
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMUser>().createMergeEntityUpdater(),
            });
            eventSpy = jest.fn();
            collection.emitter.on(EOIMCollectionEventType.UPDATE, eventSpy);
        });

        afterEach(() => {
            collection.emitter.offAll();
        });

        test('should insert single entity and emit update event', () => {
            const user: TOIMUser = {
                id: 'user1',
                name: 'John Doe',
                age: 30,
                email: 'john@example.com',
            };

            collection.upsertOne(user);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1'],
            } as TOIMCollectionUpdatePayload<string>);
        });

        test('should insert multiple entities and emit single update event', () => {
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

            collection.upsertMany(users);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1', 'user2', 'user3'],
            });
        });

        test('should update existing entity', () => {
            const user: TOIMUser = {
                id: 'user1',
                name: 'John Doe',
                age: 30,
                email: 'john@example.com',
            };

            collection.upsertOne(user);
            eventSpy.mockClear();

            const updatedUser = {
                id: 'user1',
                name: 'John Smith',
                age: 31,
                email: 'johnsmith@example.com',
            };

            collection.upsertOne(updatedUser);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1'],
            });
        });

        test('should remove single entity and emit update event', () => {
            const user: TOIMUser = {
                id: 'user1',
                name: 'John Doe',
                age: 30,
                email: 'john@example.com',
            };

            collection.upsertOne(user);
            eventSpy.mockClear();

            collection.removeOne(user);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1'],
            });
        });

        test('should remove multiple entities and emit single update event', () => {
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

            collection.upsertMany(users);
            eventSpy.mockClear();

            collection.removeMany(users);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['user1', 'user2'],
            });
        });
    });

    describe('Custom PK Selector', () => {
        test('should work with custom PK selector', () => {
            const collection = new OIMCollection<TOIMProduct, number>({
                selectPk: product => product.productId,
                store: new OIMCollectionStoreMapDriven<TOIMProduct, number>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMProduct>().createMergeEntityUpdater(),
            });

            const eventSpy = jest.fn();
            collection.emitter.on(EOIMCollectionEventType.UPDATE, eventSpy);

            const product: TOIMProduct = {
                productId: 123,
                title: 'Laptop',
                price: 999.99,
                category: 'Electronics',
            };

            collection.upsertOne(product);

            expect(eventSpy).toHaveBeenCalledWith({
                pks: [123],
            });

            collection.emitter.offAll();
        });
    });

    describe('Custom Entity Updater', () => {
        test('should use custom entity updater for merging', () => {
            const customUpdater = jest.fn(
                (draft: Partial<TOIMUser>, existingEntity: TOIMUser) => ({
                    ...existingEntity,
                    ...draft,
                    // Keep old age, don't update it
                    age: existingEntity.age,
                })
            );

            const collection = new OIMCollection<TOIMUser, string>({
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity: customUpdater,
            });

            const originalUser: TOIMUser = {
                id: 'user1',
                name: 'John Doe',
                age: 30,
                email: 'john@example.com',
            };

            collection.upsertOne(originalUser);

            const updatedUser: TOIMUser = {
                id: 'user1',
                name: 'John Smith',
                age: 35, // This should be ignored by custom updater
                email: 'johnsmith@example.com',
            };

            collection.upsertOne(updatedUser);

            expect(customUpdater).toHaveBeenCalledWith(
                updatedUser,
                originalUser
            );
        });
    });

    describe('Event System', () => {
        let collection: OIMCollection<TOIMUser, string>;

        beforeEach(() => {
            collection = new OIMCollection<TOIMUser, string>({
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMUser>().createMergeEntityUpdater(),
            });
        });

        afterEach(() => {
            collection.emitter.offAll();
        });

        test('should support multiple event listeners', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();

            collection.emitter.on(EOIMCollectionEventType.UPDATE, listener1);
            collection.emitter.on(EOIMCollectionEventType.UPDATE, listener2);

            const user: TOIMUser = {
                id: 'user1',
                name: 'John',
                age: 30,
                email: 'john@example.com',
            };

            collection.upsertOne(user);

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
        });

        test('should allow removing event listeners', () => {
            const listener = jest.fn();

            collection.emitter.on(EOIMCollectionEventType.UPDATE, listener);
            collection.emitter.off(EOIMCollectionEventType.UPDATE, listener);

            const user: TOIMUser = {
                id: 'user1',
                name: 'John',
                age: 30,
                email: 'john@example.com',
            };

            collection.upsertOne(user);

            expect(listener).not.toHaveBeenCalled();
        });

        test('should remove all listeners with offAll', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();

            collection.emitter.on(EOIMCollectionEventType.UPDATE, listener1);
            collection.emitter.on(EOIMCollectionEventType.UPDATE, listener2);
            collection.emitter.offAll();

            const user: TOIMUser = {
                id: 'user1',
                name: 'John',
                age: 30,
                email: 'john@example.com',
            };

            collection.upsertOne(user);

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        let collection: OIMCollection<TOIMUser, string>;

        beforeEach(() => {
            collection = new OIMCollection<TOIMUser, string>({
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMUser>().createMergeEntityUpdater(),
            });
        });

        afterEach(() => {
            collection.emitter.offAll();
        });

        test('should handle empty arrays gracefully', () => {
            const eventSpy = jest.fn();
            collection.emitter.on(EOIMCollectionEventType.UPDATE, eventSpy);

            collection.upsertMany([]);
            collection.removeMany([]);

            expect(eventSpy).toHaveBeenCalledTimes(2);
            expect(eventSpy).toHaveBeenNthCalledWith(1, { pks: [] });
            expect(eventSpy).toHaveBeenNthCalledWith(2, { pks: [] });
        });

        test('should handle removing non-existent entity', () => {
            const eventSpy = jest.fn();
            collection.emitter.on(EOIMCollectionEventType.UPDATE, eventSpy);

            const user: TOIMUser = {
                id: 'nonexistent',
                name: 'Ghost',
                age: 0,
                email: 'ghost@example.com',
            };

            // Should not throw and should emit event
            expect(() => collection.removeOne(user)).not.toThrow();
            expect(eventSpy).toHaveBeenCalledWith({
                pks: ['nonexistent'],
            });
        });
    });
});
