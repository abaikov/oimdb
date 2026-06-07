import {
    createOIMCollectionIndexFactory,
    OIMEventQueue,
    OIMReactiveCollection,
} from '../src';

type User = { id: string; name: string };

describe('collection-bound index: pk indexed before its entity exists', () => {
    function setup() {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: user => user.id,
        });
        const indexFactory = createOIMCollectionIndexFactory(queue, users);
        return { queue, users, indexFactory };
    }

    test('set-based: addPks/setPks for an unknown pk does not throw', () => {
        const { queue, users, indexFactory } = setup();
        const usersByTeam = indexFactory.setBasedIndex<'team1'>();

        // No entity for u1 yet — must not crash, must register the pk.
        expect(() => usersByTeam.setPks('team1', ['u1'])).not.toThrow();
        expect(() => usersByTeam.addPks('team1', ['u2'])).not.toThrow();

        expect(usersByTeam.getPksByKey('team1')).toEqual(new Set(['u1', 'u2']));
        // Missing entities surface as positional holes (aligned with the pks),
        // not dropped — so a consumer can show a per-item loading state.
        expect(usersByTeam.getEntitiesByKey('team1')).toStrictEqual([
            undefined,
            undefined,
        ]);

        // When the entity arrives later, the previously reserved slot fills in;
        // the still-missing one stays a hole.
        users.upsertOne({ id: 'u1', name: 'Alice' });
        expect(usersByTeam.getEntitiesByKey('team1')).toStrictEqual([
            { id: 'u1', name: 'Alice' },
            undefined,
        ]);

        usersByTeam.destroy();
        users.destroy();
        queue.destroy();
    });

    test('array-based: setPks for an unknown pk does not throw and fills later', () => {
        const { queue, users, indexFactory } = setup();
        const orderedUsersByTeam = indexFactory.arrayBasedIndex<'team1'>();

        expect(() =>
            orderedUsersByTeam.setPks('team1', ['u2', 'u1'])
        ).not.toThrow();
        expect(orderedUsersByTeam.getEntitiesByKey('team1')).toStrictEqual([
            undefined,
            undefined,
        ]);

        users.upsertMany([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
        ]);
        expect(orderedUsersByTeam.getEntitiesByKey('team1')).toStrictEqual([
            { id: 'u2', name: 'Bob' },
            { id: 'u1', name: 'Alice' },
        ]);

        orderedUsersByTeam.destroy();
        users.destroy();
        queue.destroy();
    });

    test('reserved slots do not leak into collection enumeration', () => {
        const { queue, users, indexFactory } = setup();
        const usersByTeam = indexFactory.setBasedIndex<'team1'>();

        usersByTeam.setPks('team1', ['ghost']);

        // A pk reserved only by an index must not appear as a real entity.
        expect(users.getAll()).toEqual([]);
        expect(users.getAllPks()).toEqual([]);
        expect(users.countAll()).toBe(0);
        expect(users.getOneByPk('ghost')).toBeUndefined();

        usersByTeam.destroy();
        users.destroy();
        queue.destroy();
    });
});
