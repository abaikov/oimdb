import {
    createOIMCollectionIndexFactory,
    OIMDerivedCollectionIndexSetBased,
    OIMEventQueue,
    OIMReactiveCollection,
} from '../src';

type User = {
    id: string;
    name: string;
    teamId?: string;
    tags?: readonly string[];
};

describe('OIMDerivedCollectionIndexSetBased', () => {
    function createUsers() {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: user => user.id,
        });
        users.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 'team1', tags: ['admin'] },
            { id: 'u2', name: 'Bob', teamId: 'team1', tags: ['user'] },
            { id: 'u3', name: 'Carol', teamId: 'team2', tags: ['user'] },
        ]);
        return { queue, users };
    }

    test('builds initial state from existing collection slots', () => {
        const { queue, users } = createUsers();
        const usersByTeam = new OIMDerivedCollectionIndexSetBased<
            string,
            string,
            User
        >(queue, users, {
            selectIndexKeys: user => user.teamId,
        });

        expect(usersByTeam.getPksByKey('team1')).toEqual(
            new Set(['u1', 'u2'])
        );
        expect(usersByTeam.getEntitiesByKey('team2')).toEqual([
            { id: 'u3', name: 'Carol', teamId: 'team2', tags: ['user'] },
        ]);

        usersByTeam.destroy();
        users.destroy();
        queue.destroy();
    });

    test('moves membership when derived key changes', () => {
        const { queue, users } = createUsers();
        const usersByTeam = new OIMDerivedCollectionIndexSetBased<
            string,
            string,
            User
        >(queue, users, {
            selectIndexKeys: user => user.teamId,
        });

        users.upsertOneByPk('u2', { teamId: 'team2' });
        queue.flush();

        expect(usersByTeam.getPksByKey('team1')).toEqual(new Set(['u1']));
        expect(usersByTeam.getPksByKey('team2')).toEqual(
            new Set(['u3', 'u2'])
        );

        usersByTeam.destroy();
        users.destroy();
        queue.destroy();
    });

    test('removes membership when entity is removed', () => {
        const { queue, users } = createUsers();
        const usersByTeam = new OIMDerivedCollectionIndexSetBased<
            string,
            string,
            User
        >(queue, users, {
            selectIndexKeys: user => user.teamId,
        });

        users.removeOneByPk('u1');
        queue.flush();

        expect(usersByTeam.getPksByKey('team1')).toEqual(new Set(['u2']));

        usersByTeam.destroy();
        users.destroy();
        queue.destroy();
    });

    test('supports multi-key derived membership', () => {
        const { queue, users } = createUsers();
        const usersByTag = new OIMDerivedCollectionIndexSetBased<
            string,
            string,
            User
        >(queue, users, {
            selectIndexKeys: user => user.tags ?? [],
        });

        users.upsertOneByPk('u1', { tags: ['admin', 'user'] });
        users.upsertOneByPk('u2', { tags: [] });
        queue.flush();

        expect(usersByTag.getPksByKey('admin')).toEqual(new Set(['u1']));
        expect(usersByTag.getPksByKey('user')).toEqual(
            new Set(['u3', 'u1'])
        );

        usersByTag.destroy();
        users.destroy();
        queue.destroy();
    });

    test('relations helper creates derived set indexes', () => {
        const { queue, users } = createUsers();
        const indexFactory = createOIMCollectionIndexFactory(queue, users);
        const usersByTeam = indexFactory.derivedSetIndex(user => user.teamId);

        users.upsertOne({ id: 'u4', name: 'Dave', teamId: 'team2' });
        queue.flush();

        expect(usersByTeam.getEntitiesByKey('team2')).toEqual([
            { id: 'u3', name: 'Carol', teamId: 'team2', tags: ['user'] },
            { id: 'u4', name: 'Dave', teamId: 'team2' },
        ]);

        usersByTeam.destroy();
        users.destroy();
        queue.destroy();
    });
});
