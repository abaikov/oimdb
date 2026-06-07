import {
    OIMEventQueue,
    OIMReactiveCollection,
    createInPlaceEntityUpdater,
} from '../src';

type User = { id: string; name: string; age?: number };

describe('createInPlaceEntityUpdater', () => {
    test('mutates the existing entity in place (stable reference)', () => {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
            updateEntity: createInPlaceEntityUpdater<User>(),
        });

        users.upsertOne({ id: 'u1', name: 'Alice', age: 30 });
        const before = users.getOneByPk('u1');

        users.upsertOneByPk('u1', { name: 'Alice 2' });
        const after = users.getOneByPk('u1');

        // Same object reference, fields updated in place, untouched fields kept.
        expect(after).toBe(before);
        expect(after).toEqual({ id: 'u1', name: 'Alice 2', age: 30 });

        queue.destroy();
    });

    test('default (merge) updater keeps producing a new reference', () => {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
        });

        users.upsertOne({ id: 'u1', name: 'Alice', age: 30 });
        const before = users.getOneByPk('u1');
        users.upsertOneByPk('u1', { name: 'Alice 2' });
        const after = users.getOneByPk('u1');

        expect(after).not.toBe(before);
        expect(after).toEqual({ id: 'u1', name: 'Alice 2', age: 30 });

        queue.destroy();
    });
});
